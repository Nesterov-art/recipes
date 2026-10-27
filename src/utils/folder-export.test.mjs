import assert from 'node:assert/strict';
import test from 'node:test';
import {
  backupFileName, EXPORT_RETENTION_MS, exportOutcome, FolderSaveError, nameFromUri, saveToFolder, staleExportFolders, uniqueName,
} from './folder-export.ts';

const day = new Date(2026, 9, 27, 23, 59);
const tree = 'content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FMonorec/document/primary%3ADocuments%2FMonorec%2F';
// A folder in the shape of a SAF tree: create() never replaces, like DocumentsContract.createDocument.
function folder(existing = [], { failCreate, failWrite, corrupt, failRead } = {}) {
  const files = new Map(existing.map(name => [name, 'old content']));
  const log = [];
  return {
    files, log,
    list: () => [...files.keys()],
    create(name) {
      if (failCreate) throw new Error(failCreate);
      if (files.has(name)) throw new Error('test folder: create must not reuse a name');
      files.set(name, ''); log.push(['create', name]);
      return {
        uri: tree + encodeURIComponent(name),
        async write(text) { if (failWrite) throw new Error(failWrite); files.set(name, corrupt ? text.slice(1) : text); },
        async text() { if (failRead) throw new Error('read denied'); return files.get(name); },
        delete() { files.delete(name); log.push(['delete', name]); },
      };
    },
  };
}
const text = JSON.stringify({ format: 'recipes-profile-backup', version: 1, profile: { recipes: ['ё'.repeat(1000)] } });

test('readable file names use the local date and the backup kind', () => {
  assert.equal(backupFileName('profile', day), 'monorec-profile-2026-10-27.json');
  assert.equal(backupFileName('recipes', day), 'monorec-recipes-2026-10-27.json');
});

test('a second save on the same day gets a new name instead of replacing the first', () => {
  assert.equal(uniqueName('monorec-profile-2026-10-27.json', []), 'monorec-profile-2026-10-27.json');
  assert.equal(uniqueName('monorec-profile-2026-10-27.json', ['MONOREC-profile-2026-10-27.json']), 'monorec-profile-2026-10-27-2.json');
  assert.equal(uniqueName('a.json', ['a.json', 'a-2.json', 'a-3.json']), 'a-4.json');
});

test('names are read from SAF document URIs', () => {
  assert.equal(nameFromUri(`${tree}monorec-profile-2026-10-27.json`), 'monorec-profile-2026-10-27.json');
  assert.equal(nameFromUri('content://com.android.providers.downloads.documents/document/msf%3A42'), '42');
  assert.equal(nameFromUri('file:///data/user/0/cache/monorec-exports/1/x.json'), 'x.json');
});

test('saving writes, reads back and reports the verified name', async () => {
  const dir = folder();
  const result = await saveToFolder(async () => dir, text, 'profile', day);
  assert.deepEqual(result, { status: 'saved', name: 'monorec-profile-2026-10-27.json' });
  assert.equal(dir.files.get('monorec-profile-2026-10-27.json'), text);
  assert.deepEqual(exportOutcome(result.status), { recordDate: true, message: 'saved' });
});

test('an existing file of the same day is kept and the new one gets "-2"', async () => {
  const dir = folder(['monorec-profile-2026-10-27.json']);
  const result = await saveToFolder(async () => dir, text, 'profile', day);
  assert.equal(result.name, 'monorec-profile-2026-10-27-2.json');
  assert.equal(dir.files.get('monorec-profile-2026-10-27.json'), 'old content');
});

test('closing the folder picker is not an error and creates nothing', async () => {
  const result = await saveToFolder(async () => null, text, 'recipes', day);
  assert.deepEqual(result, { status: 'cancelled' });
  assert.deepEqual(exportOutcome('cancelled'), { recordDate: false, message: null });
});

test('a failed write, a short file or an unreadable file is never reported as saved', async () => {
  for (const [options, code] of [[{ failWrite: 'EACCES: permission denied' }, 'write'], [{ corrupt: true }, 'verify'], [{ failRead: true }, 'verify'],
    [{ failWrite: 'ENOSPC: no space left on device' }, 'space'], [{ failCreate: 'No space left' }, 'space'], [{ failCreate: 'Permission denied' }, 'write']]) {
    const dir = folder(['keep.json'], options);
    await assert.rejects(saveToFolder(async () => dir, text, 'profile', day), error => error instanceof FolderSaveError && error.code === code, JSON.stringify(options));
    // Only the file this save created is removed; other files in the folder stay.
    assert.deepEqual(dir.list(), ['keep.json'], JSON.stringify(options));
  }
});

test('the Share sheet hands the file off without claiming it was saved', () => {
  assert.deepEqual(exportOutcome('shared'), { recordDate: false, message: 'handedOff' });
});

test('only export folders older than a day, named by their creation time, are cleaned up', () => {
  const now = Date.UTC(2026, 9, 27, 12);
  const fresh = String(now - 60_000), old = String(now - EXPORT_RETENTION_MS - 1);
  assert.deepEqual(staleExportFolders([fresh, old, 'DocumentPicker', 'other-1234567890123'], now), [old]);
});

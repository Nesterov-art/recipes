// Backup export outcomes and the Android "save to folder" flow, without native imports so
// that every branch is unit-testable. Only a folder save is known to have written a file;
// a Share sheet reports nothing about what the receiving app did with it.
export type BackupKind = 'profile' | 'recipes';
export type ShareResult = 'saved' | 'shared' | 'cancelled';
export type FolderFile = { uri: string; write: (text: string) => Promise<void>; text: () => Promise<string>; delete: () => void };
export type PickedFolder = { list: () => string[]; create: (name: string) => FolderFile };
export type FolderSaveResult = { status: 'cancelled' } | { status: 'saved'; name: string };

export class FolderSaveError extends Error {
  code: 'write' | 'verify' | 'space';
  constructor(code: FolderSaveError['code'], cause?: unknown) {
    super(code, { cause });
    this.code = code;
  }
}
const spaceError = (error: unknown) => error instanceof Error && /ENOSPC|no space|full|quota/i.test(error.message);

export function backupFileName(kind: BackupKind, date = new Date()) {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `monorec-${kind}-${day}.json`;
}
// A second save on the same day gets "-2", "-3", ... instead of replacing the first file.
export function uniqueName(name: string, existing: Iterable<string>) {
  const taken = new Set([...existing].map(item => item.toLowerCase()));
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem}-${n}${ext}`;
  return candidate;
}
// SAF document URIs end in an encoded "root:path/name"; the file name is its last segment.
export function nameFromUri(uri: string) {
  let decoded = uri;
  try { decoded = decodeURIComponent(uri); } catch { /* Keep the raw URI. */ }
  return decoded.split(/[/:]/).filter(Boolean).pop() ?? '';
}

// pick resolves to null when the user closes the folder picker.
export async function saveToFolder(pick: () => Promise<PickedFolder | null>, text: string, kind: BackupKind, now = new Date()): Promise<FolderSaveResult> {
  const folder = await pick();
  if (!folder) return { status: 'cancelled' };
  const name = uniqueName(backupFileName(kind, now), folder.list());
  let file: FolderFile;
  try { file = folder.create(name); } catch (error) { throw new FolderSaveError(spaceError(error) ? 'space' : 'write', error); }
  try {
    await file.write(text);
  } catch (error) {
    removeOwn(file);
    throw new FolderSaveError(spaceError(error) ? 'space' : 'write', error);
  }
  let stored: string | undefined;
  try { stored = await file.text(); } catch { /* Reported as a failed check below. */ }
  if (stored !== text) {
    removeOwn(file); // An incomplete copy must not look like a backup.
    throw new FolderSaveError('verify');
  }
  const saved = nameFromUri(file.uri);
  return { status: 'saved', name: saved.endsWith('.json') ? saved : name };
}
function removeOwn(file: FolderFile) {
  try { file.delete(); } catch { /* The file was created by this save; nothing else is touched. */ }
}

// Whether an export may update "last export" and which message it gets.
export function exportOutcome(result: ShareResult) {
  return {
    recordDate: result === 'saved',
    message: result === 'saved' ? 'saved' as const : result === 'shared' ? 'handedOff' as const : null,
  };
}

// Share copies live in cache/monorec-exports/<created ms>/ and stay a day, long enough
// for the receiving app to read them. Only folders named by this scheme are listed.
export const EXPORT_RETENTION_MS = 24 * 60 * 60 * 1000;
export function staleExportFolders(names: readonly string[], now: number, maxAge = EXPORT_RETENTION_MS) {
  return names.filter(name => /^\d{13}$/.test(name) && now - Number(name) > maxAge);
}

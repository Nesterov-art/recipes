import { useImperativeHandle, type Ref } from 'react';
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  nameFromUri, saveToFolder, staleExportFolders, type BackupKind, type FolderSaveResult, type PickedFolder, type ShareResult,
} from '@/utils/folder-export';

export type PickedBackup = { name: string; text: string };
export type BackupPickerHandle = { pick: () => void };
export type BackupPickerProps = { ref: Ref<BackupPickerHandle>; onFile: (file: PickedBackup) => Promise<void>; onError: (error: unknown) => void };

// Copies made by the document picker inside this app's cache are removed once read.
// Nothing outside Paths.cache (such as the user's original file) is ever deleted.
function removeCacheCopy(uri: string) {
  if (!uri.startsWith(Paths.cache.uri)) return;
  try { new File(uri).delete(); } catch { /* A leftover copy is harmless. */ }
}

export function BackupFilePicker({ ref, onFile, onError }: BackupPickerProps) {
  useImperativeHandle(ref, () => ({ pick: () => {
    void (async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'application/octet-stream'], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      let text: string;
      try { text = await new File(asset.uri).text(); } finally { removeCacheCopy(asset.uri); }
      await onFile({ name: asset.name, text });
    })().catch(onError);
  } }), [onError, onFile]);
  return null;
}

// Android only: the system folder picker (Storage Access Framework) needs no storage permission.
export const canSaveToFolder = Platform.OS === 'android';
const cancelled = (error: unknown) => error instanceof Error
  && ((error as { code?: string }).code === 'ERR_PICKER_CANCELLED' || /cancel/i.test(error.message));
export function saveBackupToFolder(text: string, kind: BackupKind): Promise<FolderSaveResult> {
  return saveToFolder(async (): Promise<PickedFolder | null> => {
    let folder: Directory;
    try { folder = await Directory.pickDirectoryAsync(); } catch (error) {
      if (cancelled(error)) return null;
      throw error;
    }
    return {
      list: () => folder.list().map(entry => nameFromUri(entry.uri)),
      create: name => {
        const file = folder.createFile(name, 'application/json');
        return { uri: file.uri, write: content => file.write(content), text: () => file.text(), delete: () => file.delete() };
      },
    };
  }, text, kind);
}

const EXPORTS = 'monorec-exports';
function removeStaleExports() {
  try {
    const root = new Directory(Paths.cache, EXPORTS);
    if (!root.exists) return;
    const folders = root.list().filter((entry): entry is Directory => entry instanceof Directory);
    const stale = new Set(staleExportFolders(folders.map(folder => nameFromUri(folder.uri)), Date.now()));
    for (const folder of folders) if (stale.has(nameFromUri(folder.uri))) folder.delete();
  } catch { /* Cleanup never blocks an export. */ }
}
// The receiving app may read the file after shareAsync resolves, so it is kept for a day.
export async function shareBackupFile(text: string, name: string): Promise<ShareResult> {
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing unavailable');
  removeStaleExports();
  const folder = new Directory(Paths.cache, EXPORTS, String(Date.now()));
  folder.create({ intermediates: true, idempotent: true });
  const file = new File(folder, name);
  // File.write() is async since SDK 58; share only after the backup is written.
  file.create(); await file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: name });
  // Native Share does not report whether the receiver actually saved the file.
  return 'shared';
}

import { useImperativeHandle, type Ref } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type PickedBackup = { name: string; text: string };
export type BackupPickerHandle = { pick: () => void };
export type BackupPickerProps = { ref: Ref<BackupPickerHandle>; onFile: (file: PickedBackup) => Promise<void>; onError: (error: unknown) => void };

export function BackupFilePicker({ ref, onFile, onError }: BackupPickerProps) {
  useImperativeHandle(ref, () => ({ pick: () => {
    void (async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'application/octet-stream'], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const text = await new File(asset.uri).text();
      await onFile({ name: asset.name, text });
    })().catch(onError);
  } }), [onError, onFile]);
  return null;
}
export async function saveBackupFile(text: string, name: string): Promise<boolean> {
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing unavailable');
  const file = new File(Paths.cache, `${Date.now()}-${Math.random()}-${name}`);
  // File.write() is async since SDK 58; share only after the backup is written.
  file.create(); await file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: name });
  // Native Share does not report whether the receiver actually saved the file.
  return true;
}

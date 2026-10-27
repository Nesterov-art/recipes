import { useImperativeHandle, useRef } from 'react';
import type { BackupPickerProps } from './backup-files';
import type { BackupKind, FolderSaveResult, ShareResult } from '@/utils/folder-export';

export function BackupFilePicker({ ref, onFile, onError }: BackupPickerProps) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ pick: () => input.current?.click() }), []);
  return <input ref={input} type="file" accept=".json,application/json" hidden data-testid="recipe-file-input" onChange={event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (file) void file.text().then(text => onFile({ name: file.name, text })).catch(onError);
  }} />;
}
// The web keeps its download/Web Share behaviour; folder saving is an Android action.
export const canSaveToFolder = false;
export function saveBackupToFolder(_text: string, _kind: BackupKind): Promise<FolderSaveResult> {
  return Promise.reject(new Error('Saving to a folder is not available on the web'));
}
export async function shareBackupFile(text: string, name: string): Promise<ShareResult> {
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
    else {
      const url = URL.createObjectURL(file); const link = document.createElement('a');
      link.href = url; link.download = file.name; document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
    }
    return 'saved';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}

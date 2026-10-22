import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import type { RecoveryExportProps } from './storage-recovery-export';

export function StorageRecoveryExport({ payload, colors, t }: RecoveryExportProps) {
  const [error, setError] = useState(false);
  async function download() {
    setError(false);
    try {
      const file = new File([payload()], `recipes-recovery-${Date.now()}.json`, { type: 'application/json' });
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url; link.download = file.name;
        document.body.appendChild(link);
        try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setError(true);
    }
  }
  return <>
    <Pressable accessibilityRole="button" onPress={() => void download()} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={{ color: colors.text, fontSize: 17, textAlign: 'center' }}>{t('storageExportRecovery')}</Text>
    </Pressable>
    {error && <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 17 }}>{t('backupExportError')}</Text>}
  </>;
}

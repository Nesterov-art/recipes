import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import type { AppColors } from '@/constants/theme';
import type { Translate } from '@/constants/i18n';
import { saveBackupFile } from '@/components/backup-files';
import { appStorage, PROFILE_STORAGE_KEYS } from '@/utils/app-storage';
import { captureEmergency, emergencyComplete, emergencyDiagnostic, type EmergencyCapture } from '@/utils/emergency-export';
import { serializeProfileBackup } from '@/utils/profile-backup';
import { serializeRecipeBackup } from '@/utils/recipe-backup';

export type RecoveryExportProps = { payload: () => string; colors: AppColors; t: Translate };

// Native emergency export through the existing Share sheet. It only reads: nothing is
// repaired, replaced or removed. A diagnostic file is never presented as a backup.
export function StorageRecoveryExport({ payload, colors, t }: RecoveryExportProps) {
  const [capture, setCapture] = useState<EmergencyCapture | null>(null);
  const [message, setMessage] = useState<'saved' | 'error' | null>(null);
  useEffect(() => {
    let active = true;
    void captureEmergency(appStorage, PROFILE_STORAGE_KEYS).then(value => { if (active) setCapture(value); });
    return () => { active = false; };
  }, []);
  if (!capture) return null;
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
  async function share(text: () => string, name: string) {
    setMessage(null);
    try { await saveBackupFile(text(), name); setMessage('saved'); } catch { setMessage('error'); }
  }
  const complete = emergencyComplete(capture);
  const unreadable = Object.keys(capture.errors);
  const hint = (text: string) => <Text style={{ color: colors.muted, fontSize: 15 }}>{text}</Text>;
  const button = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={{ color: colors.text, fontSize: 17, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
  return <>
    {hint(t('emergencyHint'))}
    {capture.profile
      ? button(t('emergencySaveProfile'), () => void share(() => serializeProfileBackup(capture.profile!), `recipes-profile-${stamp()}.json`))
      : capture.book && <>
        {button(t('emergencySaveBook'), () => void share(() => serializeRecipeBackup(capture.book!.recipes, capture.book!.recipeMeta), `recipes-${stamp()}.json`))}
        {hint(t('emergencyBookHint'))}
      </>}
    {button(t('emergencySaveDiagnostic'), () => void share(() => emergencyDiagnostic(capture, payload()),
      `monorec-diagnostic-${stamp()}${complete ? '' : '-incomplete'}.json`))}
    {hint(t('emergencyDiagnosticHint'))}
    {unreadable.length > 0 && hint(t('emergencyIncomplete', { keys: unreadable.join(', ') }))}
    {message && <Text accessibilityLiveRegion="polite" style={{ color: message === 'error' ? colors.danger : colors.text, fontSize: 17 }}>
      {t(message === 'error' ? 'backupExportError' : 'emergencySaved')}
    </Text>}
  </>;
}

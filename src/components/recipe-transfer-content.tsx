import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BackupFilePicker, saveBackupFile, type BackupPickerHandle, type PickedBackup } from '@/components/backup-files';
import { SettingsHint, SettingsRow, SettingsSection } from '@/components/settings-list';
import { useRecipes } from '@/context/recipes-context';
import { useSettings } from '@/context/settings-context';
import { useToast } from '@/context/toast-context';
import { useStyles } from '@/styles';
import { BackupError, mergeRecipeBackup, serializeRecipeBackup } from '@/utils/recipe-backup';
import { LARGE_PROFILE_BYTES, parseBackupFile, recipesFromBackup, serializeProfileBackup, utf8Length } from '@/utils/profile-backup';
import { captureProfile, LAST_BACKUP_KEY, ProfileRestoreError, restoreProfile } from '@/utils/profile-transaction';
import { assertProfileReady, refreshStores, settleStores, withProfileLock } from '@/utils/storage-coordination';

type Mode = 'add' | 'restore';
type Preview = { name: string; backup: ReturnType<typeof parseBackupFile>; mode: Mode; bytes: number; current?: Awaited<ReturnType<typeof captureProfile>> };

export function RecipeTransferContent() {
  const { recipes, recipeMeta, importRecipes } = useRecipes();
  const { colors, fontScale, language, t } = useSettings();
  const { showToast } = useToast();
  const styles = useStyles();
  const picker = useRef<BackupPickerHandle>(null);
  const mode = useRef<Mode>('add');
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [largeExport, setLargeExport] = useState(false);
  const summary = preview?.mode === 'add' ? mergeRecipeBackup(recipes, recipeMeta, recipesFromBackup(preview.backup)) : null;
  const profile = preview?.backup.format === 'recipes-profile-backup' ? preview.backup.profile : null;
  const fs = (size: number) => Math.round(size * fontScale);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(LAST_BACKUP_KEY).then(value => { if (active) setLastBackup(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  function report(err: unknown, exporting = false) {
    setError(t(err instanceof BackupError ? err.code === 'size' ? 'backupSizeError' : err.code === 'version' ? 'backupVersionError' : 'backupInvalidError'
      : err instanceof ProfileRestoreError ? err.code === 'conflict' ? 'profileConflict' : err.code === 'recovery' ? 'profileRecoveryError' : 'profileRestoreError'
      : exporting ? 'backupExportError' : 'backupImportError'));
  }
  async function exportFile(full: boolean) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      await settleStores();
      const text = full ? serializeProfileBackup((await captureProfile(AsyncStorage)).profile) : serializeRecipeBackup(recipes, recipeMeta);
      setLargeExport(utf8Length(text) > LARGE_PROFILE_BYTES);
      if (!await saveBackupFile(text, `${full ? 'recipes-profile' : 'recipes'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)) return;
      if (full) {
        const date = new Date().toISOString();
        try {
          await withProfileLock(async () => { await assertProfileReady(AsyncStorage); await AsyncStorage.setItem(LAST_BACKUP_KEY, date); });
          setLastBackup(date);
        } catch { setError(t('profileDateError')); }
      }
    } catch (err) { report(err, true); }
    finally { setBusy(false); working.current = false; }
  }
  function chooseFile(nextMode: Mode) {
    if (working.current) return;
    mode.current = nextMode; setError(''); picker.current?.pick();
  }
  async function selectFile(file: PickedBackup) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setPreview(null);
    try {
      const backup = parseBackupFile(file.text);
      if (mode.current === 'restore' && backup.format !== 'recipes-profile-backup') { setError(t('profileRequiresFull')); return; }
      await settleStores();
      const current = mode.current === 'restore' ? await captureProfile(AsyncStorage) : undefined;
      setPreview({ name: file.name, backup, mode: mode.current, bytes: utf8Length(file.text), current });
    } catch (err) { report(err); }
    finally { setBusy(false); working.current = false; }
  }
  async function confirm() {
    if (!preview || working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      if (preview.mode === 'add') {
        await importRecipes(recipesFromBackup(preview.backup), result => {
          setPreview(null); setError(''); showToast(t('backupImported', { count: result.added }));
        });
      } else if (preview.backup.format === 'recipes-profile-backup' && preview.current) {
        await settleStores();
        await restoreProfile(AsyncStorage, preview.backup.profile, preview.current.raw);
        await refreshStores();
        setPreview(null); showToast(t('profileRestored'));
      }
    } catch (err) { report(err); }
    finally { setBusy(false); working.current = false; }
  }
  const paragraph = (text: ReactNode) => <Text style={{ color: colors.muted, fontSize: fs(15), lineHeight: fs(20) }}>{text}</Text>;
  const previewCard = preview && <View testID={preview.mode === 'add' ? 'recipe-import-preview' : 'profile-import-preview'} style={[styles.settingsCard, { padding: 16, marginTop: 16, gap: 12 }]}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: fs(17), lineHeight: fs(22), fontWeight: '600' }}>{t(preview.mode === 'add' ? 'backupPreview' : 'profilePreview')}</Text>
      {paragraph(preview.name)}
      {preview.mode === 'add' && summary && <>
        <Text style={{ color: colors.text, fontSize: fs(16) }}>{t('backupSummary', { added: summary.added, duplicates: summary.duplicates })}</Text>
        {summary.conflicts > 0 && paragraph(t('backupConflicts', { count: summary.conflicts }))}
      </>}
      {preview.mode === 'restore' && profile && <>
        <Text style={{ color: colors.text, fontSize: fs(16) }}>{t('profileSummary', {
          recipes: profile.recipes.length, favorites: Object.values(profile.recipeMeta).filter(meta => meta.favorite).length,
          cookings: Object.values(profile.recipeMeta).reduce((sum, meta) => sum + meta.cookings.length, 0),
          items: profile.shoppingItems.length, checked: profile.shoppingItems.filter(item => item.checked).length,
        })}</Text>
        {paragraph(profile.recipes.slice(0, 5).map(item => item.title).join(' · '))}
        {paragraph(profile.shoppingItems.slice(0, 5).map(item => item.text).join(' · '))}
        {paragraph(t('profileSettings', { theme: t(profile.settings.theme === 'system' ? 'systemTheme' : profile.settings.theme), language: t(profile.settings.language === 'ru' ? 'russian' : 'english') }))}
        {paragraph(t(profile.settings.shoppingCompletedBehavior === 'keep' ? 'keepCompletedInPlace' : 'moveCompletedDown'))}
        <Text style={{ color: colors.danger, fontSize: fs(16) }}>{t('profileReplaceWarning', { recipes: preview.current?.profile.recipes.length ?? 0, items: preview.current?.profile.shoppingItems.length ?? 0 })}</Text>
      </>}
      {preview.bytes > LARGE_PROFILE_BYTES && paragraph(t('profileLarge'))}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void confirm()}
        style={{ minHeight: 52, backgroundColor: colors.accent, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 26, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
        <Text style={{ color: colors.accentText, fontSize: fs(17), lineHeight: fs(22), fontWeight: '600', textAlign: 'center' }}>{t(preview.mode === 'add' ? 'backupConfirm' : 'profileConfirm')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setPreview(null); setError(''); }} style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontSize: fs(17), lineHeight: fs(22) }}>{t('cancel')}</Text>
      </Pressable>
    </View>;
  return <>
    <BackupFilePicker ref={picker} onFile={selectFile} onError={err => report(err)} />
    <SettingsSection title={t('backupTitle')} footer={<>
      {recipes.length === 0 && <SettingsHint>{t('backupExportEmpty')}</SettingsHint>}
      <SettingsHint>{t('backupHint')}</SettingsHint>
      {preview?.mode === 'add' && previewCard}
    </>}>
      <SettingsRow label={t('backupExport')} icon="download-outline" onPress={() => void exportFile(false)} disabled={busy || recipes.length === 0}
        hint={recipes.length === 0 ? t('backupExportEmpty') : undefined} />
      <SettingsRow label={t('backupImport')} icon="cloud-upload-outline" onPress={() => chooseFile('add')} disabled={busy} />
    </SettingsSection>
    <SettingsSection title={t('profileTitle')} footer={<>
      <SettingsHint>{t('profileLastBackup', { date: lastBackup && Number.isFinite(Date.parse(lastBackup)) ? new Date(lastBackup).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US') : t('profileNever') })}</SettingsHint>
      <SettingsHint>{t('profileHint')}</SettingsHint>
      {largeExport && <SettingsHint>{t('profileLarge')}</SettingsHint>}
      {preview?.mode === 'restore' && previewCard}
      {!!error && <SettingsHint role="alert">{error}</SettingsHint>}
    </>}>
      <SettingsRow label={t('profileExport')} icon="download-outline" onPress={() => void exportFile(true)} disabled={busy} />
      <SettingsRow label={t('profileRestore')} icon="refresh-outline" onPress={() => chooseFile('restore')} disabled={busy} />
    </SettingsSection>
  </>;
}

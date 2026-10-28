import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import {
  BackupFilePicker, canSaveToFolder, saveBackupToFolder, shareBackupFile, type BackupPickerHandle, type PickedBackup,
} from '@/components/backup-files';
import { SettingsHint, SettingsRow, SettingsSection } from '@/components/settings-list';
import { useRecipes } from '@/context/recipes-context';
import { useSettings } from '@/context/settings-context';
import { useToast } from '@/context/toast-context';
import { useStyles } from '@/styles';
import { appStorage, captureAppProfile, restoreAppProfile } from '@/utils/app-storage';
import { BackupError, mergeRecipeBackup } from '@/utils/recipe-backup';
import { LARGE_PROFILE_BYTES, parseBackupFile, recipesFromBackup, serializeProfileBackup, utf8Length } from '@/utils/profile-backup';
import { LAST_BACKUP_KEY, ProfileRestoreError } from '@/utils/profile-transaction';
import { assertProfileReady, refreshStores, settleStores, withProfileLock } from '@/utils/storage-coordination';
import { backupFileName, exportOutcome, FolderSaveError, type ShareResult } from '@/utils/folder-export';

type Mode = 'add' | 'restore';
type Target = 'share' | 'folder';
type Preview = { name: string; backup: ReturnType<typeof parseBackupFile>; mode: Mode; bytes: number; current?: Awaited<ReturnType<typeof captureAppProfile>> };
// Errors are shown with the action that caused them.
type Problem = { where: 'create' | 'restore'; text: string };

// One backup of all app data and one restore. The file decides what a restore does: a full
// backup is previewed and replaces the data only when confirmed; an older recipe-only file
// opens the recipe import with its merge and never replaces anything else.
export function RecipeTransferContent() {
  const { recipes, recipeMeta, importRecipes } = useRecipes();
  const { colors, fontScale, language, t } = useSettings();
  const { showToast } = useToast();
  const styles = useStyles();
  const picker = useRef<BackupPickerHandle>(null);
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [largeExport, setLargeExport] = useState(false);
  const summary = preview?.mode === 'add' ? mergeRecipeBackup(recipes, recipeMeta, recipesFromBackup(preview.backup)) : null;
  const profile = preview?.backup.format === 'recipes-profile-backup' ? preview.backup.profile : null;
  const fs = (size: number) => Math.round(size * fontScale);
  useEffect(() => {
    let active = true;
    void appStorage.getItem(LAST_BACKUP_KEY).then(value => { if (active) setLastBackup(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  function report(err: unknown, where: Problem['where']) {
    if (err instanceof FolderSaveError && err.leftover) { setProblem({ where, text: t('backupSaveLeftover', { name: err.leftover }) }); return; }
    setProblem({ where, text: t(err instanceof BackupError ? err.code === 'size' ? 'backupSizeError' : err.code === 'version' ? 'backupVersionError' : 'backupInvalidError'
      : err instanceof ProfileRestoreError ? err.code === 'conflict' ? 'profileConflict' : err.code === 'recovery' ? 'profileRecoveryError' : err.code === 'space' ? 'profileSpaceError' : 'profileRestoreError'
      : err instanceof FolderSaveError ? err.code === 'space' ? 'backupSaveSpaceError' : 'backupSaveError'
      : where === 'create' ? 'backupExportError' : 'backupImportError') });
  }
  async function recordBackupDate() {
    const date = new Date().toISOString();
    try {
      await withProfileLock(async () => { await assertProfileReady(appStorage); await appStorage.setItem(LAST_BACKUP_KEY, date); });
      setLastBackup(date);
    } catch { setProblem({ where: 'create', text: t('profileDateError') }); }
  }
  async function exportFile(target: Target) {
    if (working.current) return;
    working.current = true; setBusy(true); setProblem(null);
    try {
      await settleStores();
      const text = serializeProfileBackup((await captureAppProfile()).profile);
      setLargeExport(utf8Length(text) > LARGE_PROFILE_BYTES);
      let result: ShareResult;
      if (target === 'folder') {
        const saved = await saveBackupToFolder(text, 'profile');
        result = saved.status;
        if (saved.status === 'saved') showToast(t('backupSavedToFolder', { name: saved.name }));
      } else {
        // The web keeps its established download names; native files get readable ones.
        const name = Platform.OS === 'web' ? `recipes-profile-${new Date().toISOString().replace(/[:.]/g, '-')}.json` : backupFileName('profile');
        result = await shareBackupFile(text, name);
        const { message } = exportOutcome(result);
        if (message) showToast(t(message === 'handedOff' ? 'backupHandedOff' : 'backupSaved'));
      }
      if (result !== 'cancelled') setChoosing(false);
      // Only a write known to have finished counts as the last export.
      if (exportOutcome(result).recordDate) await recordBackupDate();
    } catch (err) { report(err, 'create'); }
    finally { setBusy(false); working.current = false; }
  }
  // Android saves one full backup to a folder or shares it; elsewhere the system share or
  // download opens right away.
  function create() {
    if (working.current) return;
    setProblem(null);
    if (canSaveToFolder) setChoosing(value => !value);
    else void exportFile('share');
  }
  function chooseFile() {
    if (working.current) return;
    setProblem(null); picker.current?.pick();
  }
  async function selectFile(file: PickedBackup) {
    if (working.current) return;
    working.current = true; setBusy(true); setProblem(null); setPreview(null);
    try {
      const backup = parseBackupFile(file.text);
      const mode: Mode = backup.format === 'recipes-profile-backup' ? 'restore' : 'add';
      await settleStores();
      const current = mode === 'restore' ? await captureAppProfile() : undefined;
      setPreview({ name: file.name, backup, mode, bytes: utf8Length(file.text), current });
    } catch (err) { report(err, 'restore'); }
    finally { setBusy(false); working.current = false; }
  }
  async function confirm() {
    if (!preview || working.current) return;
    working.current = true; setBusy(true); setProblem(null);
    try {
      if (preview.mode === 'add') {
        await importRecipes(recipesFromBackup(preview.backup), result => {
          setPreview(null); setProblem(null); showToast(t('backupImported', { count: result.added }));
        });
      } else if (preview.backup.format === 'recipes-profile-backup' && preview.current) {
        await settleStores();
        await restoreAppProfile(preview.backup.profile, preview.current.raw);
        await refreshStores();
        setPreview(null); showToast(t('profileRestored'));
      }
    } catch (err) { report(err, 'restore'); }
    finally { setBusy(false); working.current = false; }
  }
  const paragraph = (text: ReactNode) => <Text style={{ color: colors.muted, fontSize: fs(15), lineHeight: fs(20) }}>{text}</Text>;
  const alert = (where: Problem['where']) => problem?.where === where && <SettingsHint role="alert">{problem.text}</SettingsHint>;
  const previewCard = preview && <View testID={preview.mode === 'add' ? 'recipe-import-preview' : 'profile-import-preview'} style={[styles.settingsCard, { padding: 16, marginTop: 16, gap: 12 }]}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: fs(17), lineHeight: fs(22), fontWeight: '600' }}>{t(preview.mode === 'add' ? 'backupPreview' : 'profilePreview')}</Text>
      {paragraph(preview.name)}
      {preview.mode === 'add' && summary && <>
        <Text style={{ color: colors.text, fontSize: fs(16) }}>{t('backupSummary', { added: summary.added, duplicates: summary.duplicates })}</Text>
        {summary.conflicts > 0 && paragraph(t('backupConflicts', { count: summary.conflicts }))}
        {paragraph(t('legacyRecipesHint'))}
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
      {alert('restore')}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void confirm()}
        style={{ minHeight: 52, backgroundColor: colors.accent, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 26, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
        <Text style={{ color: colors.accentText, fontSize: fs(17), lineHeight: fs(22), fontWeight: '600', textAlign: 'center' }}>{t(preview.mode === 'add' ? 'backupConfirm' : 'profileConfirm')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setPreview(null); setProblem(null); }} style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontSize: fs(17), lineHeight: fs(22) }}>{t('cancel')}</Text>
      </Pressable>
    </View>;
  return <>
    <BackupFilePicker ref={picker} onFile={selectFile} onError={err => report(err, 'restore')} />
    <View testID="backup-create-section">
      <SettingsSection title={t('backupCreateTitle')} footer={<>
        {alert('create')}
        <SettingsHint>{t('profileLastBackup', { date: lastBackup && Number.isFinite(Date.parse(lastBackup)) ? new Date(lastBackup).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US') : t('profileNever') })}</SettingsHint>
        <SettingsHint>{t('profileHint')}</SettingsHint>
        {canSaveToFolder && <SettingsHint>{t('saveToFolderHint')}</SettingsHint>}
        {largeExport && <SettingsHint>{t('profileLarge')}</SettingsHint>}
      </>}>
        <SettingsRow label={t('backupCreate')} icon="download-outline" onPress={create} disabled={busy}
          accessory={canSaveToFolder ? 'menu' : undefined} expanded={canSaveToFolder ? choosing : undefined} />
        {canSaveToFolder && choosing && [
          <SettingsRow key="folder" label={t('saveToFolder')} spokenLabel={t('saveBackupToFolder')} icon="folder-outline" onPress={() => void exportFile('folder')} disabled={busy} />,
          <SettingsRow key="share" label={t('share')} spokenLabel={t('shareBackup')} icon="share-outline" onPress={() => void exportFile('share')} disabled={busy} />,
        ]}
      </SettingsSection>
    </View>
    <View testID="backup-restore-section">
      <SettingsSection title={t('restoreTitle')} footer={<>
        {!preview && alert('restore')}
        <SettingsHint>{t('restoreHint')}</SettingsHint>
        {previewCard}
      </>}>
        <SettingsRow label={t('restoreFromFile')} icon="refresh-outline" onPress={chooseFile} disabled={busy} />
      </SettingsSection>
    </View>
  </>;
}

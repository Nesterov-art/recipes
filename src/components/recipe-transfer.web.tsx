import { Ionicons } from '@expo/vector-icons';
import { useRef, useState, type ChangeEvent } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useRecipes } from '@/context/recipes-context';
import { useSettings } from '@/context/settings-context';
import { useToast } from '@/context/toast-context';
import { useStyles } from '@/styles';
import { BackupError, MAX_BACKUP_BYTES, mergeRecipeBackup, parseRecipeBackup, serializeRecipeBackup, type RecipeBackup } from '@/utils/recipe-backup';

export function RecipeTransfer() {
  const { recipes, recipeMeta, importRecipes } = useRecipes();
  const { colors, fontScale, t } = useSettings();
  const { showToast } = useToast();
  const styles = useStyles();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ name: string; backup: RecipeBackup } | null>(null);
  const [error, setError] = useState('');
  const summary = preview ? mergeRecipeBackup(recipes, recipeMeta, preview.backup) : null;

  function report(err: unknown, fallback: 'backupExportError' | 'backupImportError') {
    setError(t(err instanceof BackupError ? err.code === 'size' ? 'backupSizeError' : err.code === 'version' ? 'backupVersionError' : 'backupInvalidError' : fallback));
  }

  async function exportFile() {
    setError('');
    setBusy(true);
    try {
      const text = serializeRecipeBackup(recipes, recipeMeta);
      const file = new File([text], `recipes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, { type: 'application/json' });
      if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) report(err, 'backupExportError');
    } finally { setBusy(false); }
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new BackupError('size');
      const backup = parseRecipeBackup(await file.text());
      setPreview({ name: file.name, backup });
    } catch (err) { report(err, 'backupImportError'); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!preview || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await importRecipes(preview.backup);
      setPreview(null);
      showToast(t('backupImported', { count: result.added }));
    } catch (err) { report(err, 'backupImportError'); }
    finally { setBusy(false); }
  }

  return <>
    <Text style={styles.settingLabel}>{t('backupTitle')}</Text>
    <View style={styles.settingsCard}>
      <input ref={input} type="file" accept=".json,application/json" hidden data-testid="recipe-file-input" onChange={event => void selectFile(event)} />
      <Pressable accessibilityRole="button" accessibilityLabel={t('backupExport')} disabled={busy || recipes.length === 0}
        accessibilityState={{ disabled: busy || recipes.length === 0 }} onPress={() => void exportFile()}
        style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed, { opacity: busy || recipes.length === 0 ? 0.45 : 1 }]}>
        <Ionicons name="download-outline" size={20} color={colors.text} />
        <Text style={styles.settingsRowText}>{t('backupExport')}</Text>
      </Pressable>
      <View style={styles.settingsSeparator} />
      <Pressable accessibilityRole="button" accessibilityLabel={t('backupImport')} disabled={busy} accessibilityState={{ disabled: busy }}
        onPress={() => { setError(''); input.current?.click(); }} style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}>
        <Ionicons name="cloud-upload-outline" size={20} color={colors.text} />
        <Text style={styles.settingsRowText}>{t('backupImport')}</Text>
      </Pressable>
    </View>
    <Text style={{ color: colors.muted, fontSize: Math.round(14 * fontScale), lineHeight: Math.round(20 * fontScale), marginTop: 10 }}>{t('backupHint')}</Text>
    {preview && summary && <View testID="recipe-import-preview" style={[styles.settingsCard, { padding: 18, marginTop: 16, gap: 12 }]}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: Math.round(18 * fontScale), fontWeight: '600' }}>{t('backupPreview')}</Text>
      <Text style={{ color: colors.muted, fontSize: Math.round(14 * fontScale) }}>{preview.name}</Text>
      <Text style={{ color: colors.text, fontSize: Math.round(16 * fontScale) }}>{t('backupSummary', { added: summary.added, duplicates: summary.duplicates })}</Text>
      {summary.conflicts > 0 && <Text style={{ color: colors.muted, fontSize: Math.round(14 * fontScale) }}>{t('backupConflicts', { count: summary.conflicts })}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void confirm()}
        style={{ minHeight: 48, backgroundColor: colors.accent, padding: 14, borderRadius: 24, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
        <Text style={{ color: colors.accentText, fontSize: Math.round(16 * fontScale), fontWeight: '600' }}>{t('backupConfirm')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setPreview(null); setError(''); }} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.muted, fontSize: Math.round(16 * fontScale) }}>{t('cancel')}</Text>
      </Pressable>
    </View>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger, marginTop: 12, fontSize: Math.round(15 * fontScale) }}>{error}</Text>}
  </>;
}

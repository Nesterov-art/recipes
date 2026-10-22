import type { PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { createTranslator, type Translate } from '@/constants/i18n';
import { THEMES, type AppColors } from '@/constants/theme';
import type { SafeStore, StorageIssue } from '@/utils/safe-storage';
import { StorageRecoveryExport } from '@/components/storage-recovery-export';

type Props<T> = PropsWithChildren<{
  store: Pick<SafeStore<T>, 'retry' | 'reread' | 'recover' | 'exportRecovery'>; loaded: boolean; saving: boolean; issue?: StorageIssue; canRecover: boolean;
  t?: Translate; colors?: AppColors;
}>;
export function StorageGuard<T>({ children, store, loaded, saving, issue, canRecover, t = createTranslator('ru'), colors = THEMES.dark }: Props<T>) {
  const writing = issue === 'write' || issue === 'mirror';
  const button = (label: string, action: () => void) => (
    <Pressable accessibilityRole="button" disabled={saving} onPress={action}
      style={{ padding: 16, borderRadius: 18, backgroundColor: colors.accent }}>
      <Text style={{ color: colors.accentText, fontSize: 17, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
  const content = (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
      <View style={{ padding: 24, gap: 20, borderRadius: 20, backgroundColor: colors.card }}>
        <Text accessibilityRole="alert" style={{ color: colors.text, fontSize: 20 }}>
          {t(issue === 'profile' ? 'profileRecoveryTitle' : issue === 'mirror' ? 'storageMirrorError' : writing ? 'storageWriteError' : issue === 'unsupported' ? 'storageUnsupported' : 'storageReadError')}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 17 }}>{t(issue === 'profile' ? 'profileRecoveryError' : issue === 'mirror' ? 'storageMirrorHint' : issue === 'conflict' ? 'storageConflict' : writing ? 'storageUnsaved' : 'storageProtected')}</Text>
        {button(t(writing ? 'storageRetrySave' : 'storageRetryRead'), () => { void (writing ? store.retry() : store.reread()); })}
        {canRecover && !writing && button(t('storageRecover'), () => { void store.recover(); })}
        <StorageRecoveryExport payload={store.exportRecovery} colors={colors} t={t} />
      </View>
    </ScrollView>
  );
  // Keep screens/form drafts mounted on a failed write, but block further edits.
  return <>
    <View style={loaded ? { flex: 1, minHeight: 0 } : { display: 'none' }}
      accessibilityElementsHidden={!!issue}
      importantForAccessibility={issue ? 'no-hide-descendants' : 'auto'}
      aria-hidden={!!issue}>
      {loaded ? children : null}
    </View>
    {issue ? loaded ? <Modal visible animationType="fade">{content}</Modal> : content : null}
  </>;
}

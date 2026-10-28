import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';

type BottomSheetProps = { title: string; onClose: () => void; children: ReactNode };

// A sheet from the bottom over a dimmed screen. Built like OptionMenu on Modal, so Android
// Back, a web focus trap and focus return come without a new dependency. The caller mounts
// it only while open. A tap outside, Back and Escape (web) close it; Modal has no drag
// gesture, so it is not closed by swiping.
export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  const styles = useStyles();
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const latestOnClose = useRef(onClose);
  useEffect(() => { latestOnClose.current = onClose; });

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    // As in OptionMenu: listen from the first paint, before the web Modal's own handler runs.
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') latestOnClose.current(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // The sheet precedes the backdrop so the focus trap starts inside it. It sits above the
  // system navigation bar and scrolls when large text makes it taller than the screen.
  return <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
    <View style={StyleSheet.absoluteFill}>
      <View style={styles.sheetWrap} pointerEvents="box-none">
        {/* On the web the Modal itself is the dialog; natively VoiceOver stays inside the sheet. */}
        <View accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: window.height - insets.top - 24 }]}>
          <View style={styles.sheetHandle} />
          <ScrollView bounces={false} style={{ flexGrow: 0 }}>
            <Text role="heading" accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
            {children}
          </ScrollView>
        </View>
      </View>
      <Pressable style={[StyleSheet.absoluteFill, styles.sheetBackdrop]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('close')} />
    </View>
  </Modal>;
}

type SheetActionProps = { icon: ComponentProps<typeof Ionicons>['name']; label: string; hint: string; onPress: () => void };

// One choice of a sheet: an icon, what it does and a short explanation.
export function SheetAction({ icon, label, hint, onPress }: SheetActionProps) {
  const styles = useStyles();
  const { colors } = useSettings();
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}
    style={({ pressed }) => [styles.sheetAction, pressed && styles.sheetActionPressed]}>
    <View style={styles.sheetActionIcon}><Ionicons name={icon} size={20} color={colors.text} /></View>
    <View style={styles.sheetActionLabels}>
      <Text style={styles.settingsRowText}>{label}</Text>
      <Text style={styles.settingsRowDetail}>{hint}</Text>
    </View>
  </Pressable>;
}

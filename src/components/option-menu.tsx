import { Ionicons } from '@expo/vector-icons';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';

export type MenuAnchor = { x: number; y: number; width: number; height: number };

type OptionMenuProps<T extends string> = {
  title: string;
  anchor: MenuAnchor | null;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
};

const GAP = 4;
const EDGE = 16;
const MIN_WIDTH = 200;

// Last web input modality. :focus-visible is unreliable after the Modal returns
// focus programmatically, which would draw a focus ring after a tap.
let keyboardInput = false;
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('keydown', () => { keyboardInput = true; }, true);
  document.addEventListener('pointerdown', () => { keyboardInput = false; }, true);
}

// Compact single-choice menu anchored under its row. Modal provides Android Back,
// a web focus trap and focus return to the opener without a new dependency.
export function OptionMenu<T extends string>({ title, anchor, options, selected, onSelect, onClose }: OptionMenuProps<T>) {
  const styles = useStyles();
  const { colors, fontScale, t } = useSettings();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const selectedRef = useRef<View>(null);
  const latestOnClose = useRef(onClose);
  useEffect(() => { latestOnClose.current = onClose; });

  useLayoutEffect(() => {
    if (!anchor || Platform.OS !== 'web') return;
    // The web Modal handles Escape only after its passive effects run, which can lag
    // the first paint. A layout effect listens from the moment the menu appears.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latestOnClose.current();
    };
    document.addEventListener('keydown', onKeyDown);
    // The focus trap lands on the menu container. Keyboard users continue from the
    // current option and return to the row afterwards; a tap leaves no focus ring.
    const keyboard = keyboardInput;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = keyboard ? requestAnimationFrame(() => selectedRef.current?.focus()) : undefined;
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (keyboard && opener?.isConnected) requestAnimationFrame(() => opener.focus());
    };
  }, [anchor]);

  if (!anchor) return null;

  // The menu's right edge follows the row's value and chevron; its width fits the
  // longest option within the screen margins.
  const right = Math.max(EDGE, window.width - (anchor.x + anchor.width) + 8);
  const maxWidth = window.width - right - EDGE;
  const below = window.height - insets.bottom - EDGE - (anchor.y + anchor.height + GAP);
  const above = anchor.y - GAP - insets.top - EDGE;
  const estimate = 12 + options.length * Math.max(48, Math.round(22 * fontScale) + 26);
  const size = { right, minWidth: Math.min(MIN_WIDTH, maxWidth), maxWidth };
  const position = below >= estimate || below >= above
    ? { ...size, top: anchor.y + anchor.height + GAP, maxHeight: below }
    : { ...size, bottom: window.height - anchor.y + GAP, maxHeight: above };

  // Mounted only while open: reusing one web Modal for a quick close and reopen
  // leaves it inactive (no Escape, no focus trap). The menu precedes the backdrop
  // so the focus trap starts inside the menu.
  return <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
    <View tabIndex={-1} style={[styles.optionMenu, position]} accessibilityRole="radiogroup" accessibilityLabel={title} accessibilityViewIsModal>
      <ScrollView bounces={false} style={{ flexGrow: 0 }}>
        {options.map(option => {
          const checked = option.value === selected;
          return <Pressable
            key={option.value}
            ref={checked ? selectedRef : undefined}
            onPress={() => { onSelect(option.value); onClose(); }}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            aria-checked={checked}
            style={({ pressed }) => [styles.optionMenuItem, pressed && styles.optionMenuItemPressed]}
          >
            <View style={styles.optionMenuCheck}>
              {checked && <Ionicons name="checkmark" size={20} color={colors.text} />}
            </View>
            <Text style={styles.optionMenuText}>{option.label}</Text>
          </Pressable>;
        })}
      </ScrollView>
    </View>
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('close')} />
  </Modal>;
}

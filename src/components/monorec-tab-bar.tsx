import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useSettings } from '@/context/settings-context';

/** A floating-looking bar which occupies layout space above the safe area. */
export function MonorecTabBar({ state, descriptors, emitter, navigateToTab, insets, webKeyboardOpen }: BottomTabBarProps & { webKeyboardOpen: boolean }) {
  const { colors } = useSettings();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [width, setWidth] = useState(0);
  const previousWidth = useRef(0);
  const x = useSharedValue(0);
  const itemWidth = Math.max(0, width - 12) / state.routes.length;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => {
    const target = state.index * itemWidth;
    // Deep links and resizing should not sweep the capsule from tab zero.
    if (width !== previousWidth.current) x.set(target);
    else x.set(withTiming(target, { duration: 200, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
    previousWidth.current = width;
  }, [itemWidth, state.index, width, x]);
  const capsuleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return <View style={[styles.outer, {
    backgroundColor: colors.bg,
    paddingLeft: insets.left + 16,
    paddingRight: insets.right + 16,
    paddingBottom: Math.max(insets.bottom, 8),
  }, (webKeyboardOpen || keyboardOpen) && styles.hidden]}>
    <View testID="monorec-tab-bar" role="tablist" style={[styles.bar, { backgroundColor: colors.card }]}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && <Animated.View testID="tab-active-capsule" pointerEvents="none" aria-hidden
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.capsule, { width: itemWidth, backgroundColor: colors.accent }, capsuleStyle]} />}
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const color = focused ? colors.accentText : colors.muted;
        return <Pressable key={route.key} accessibilityRole={Platform.OS === 'ios' ? 'button' : 'tab'}
          accessibilityLabel={options.tabBarAccessibilityLabel ?? label} accessibilityState={{ selected: focused }} aria-selected={focused}
          accessibilityShowsLargeContentViewer accessibilityLargeContentTitle={label}
          onPress={() => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          }} onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })} style={styles.tab}>
          <View style={styles.icon}>{options.tabBarIcon?.({ focused, color, size: 24 })}</View>
          <Text allowFontScaling={false} style={[styles.label, { color }]}>{label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: 16, paddingTop: 8 },
  hidden: { display: 'none' },
  bar: { height: 72, borderRadius: 40, padding: 6, flexDirection: 'row' },
  capsule: { position: 'absolute', top: 6, left: 6, height: 60, borderRadius: 32 },
  tab: { flex: 1, minWidth: 0, height: 60, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 32 },
  icon: { width: 28, height: 26, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '600', textAlign: 'center' },
});

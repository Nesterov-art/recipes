import { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/context/settings-context';
import { useToast } from '@/context/toast-context';
import { useStyles } from '@/styles';

export function AppToast() {
  const insets = useSafeAreaInsets();
  const { colors } = useSettings();
  const { clearToast, notice } = useToast();
  const styles = useStyles();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(clearToast, 1800);
    return () => clearTimeout(timer);
  }, [clearToast, notice]);

  if (!notice) return null;

  return (
    <Animated.View
      key={notice.id}
      entering={FadeInDown.duration(180)}
      exiting={FadeOutUp.duration(160)}
      pointerEvents="none"
      style={[styles.toast, { top: insets.top + 8, shadowColor: colors.text }]}
    >
      <Text style={styles.toastText}>{notice.message}</Text>
    </Animated.View>
  );
}

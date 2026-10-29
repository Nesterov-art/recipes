import { Ionicons } from '@expo/vector-icons';
import { Children, Fragment, type ComponentRef, type ReactNode, type Ref } from 'react';
import { Pressable, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';

type IconName = keyof typeof Ionicons.glyphMap;
// Instance behind a View ref (a host element since React Native 0.87).
export type ViewRef = ComponentRef<typeof View>;
type Accessory = 'chevron' | 'menu' | 'external';

const ACCESSORY_ICONS: Record<Accessory, IconName> = {
  chevron: 'chevron-forward',
  menu: 'chevron-down',
  external: 'open-outline',
};

// Large system text moves the value under the title instead of squeezing both.
const STACKED_FONT_SCALE = 1.35;

// A section without rows shows only its title and footer text.
export function SettingsSection({ title, footer, children }: { title: string; footer?: ReactNode; children?: ReactNode }) {
  const styles = useStyles();
  const rows = Children.toArray(children);
  return <View>
    <Text accessibilityRole="header" style={styles.settingLabel}>{title}</Text>
    {rows.length > 0 && <View style={styles.settingsCard}>
      {rows.map((row, index) => <Fragment key={index}>
        {index > 0 && <View style={styles.settingsSeparator} />}
        {row}
      </Fragment>)}
    </View>}
    {footer}
  </View>;
}

// Information that is read, not tapped: a card with an icon and one or more short lines.
export function SettingsNote({ lines, icon = 'information-circle-outline', style }: { lines: string[]; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const { colors } = useSettings();
  return <View style={[styles.settingsNote, style]}>
    <Ionicons name={icon} size={20} color={colors.muted} />
    <View style={styles.settingsNoteBody}>
      {lines.map(line => <Text key={line} style={styles.settingsNoteText}>{line}</Text>)}
    </View>
  </View>;
}

export function SettingsHint({ children, role }: { children: ReactNode; role?: 'alert' }) {
  const styles = useStyles();
  const { colors } = useSettings();
  return <Text accessibilityRole={role} style={[styles.settingsHint, role === 'alert' && { color: colors.danger }]}>{children}</Text>;
}

type SettingsRowProps = {
  icon: IconName;
  label: string;
  // Second line under the label, e.g. a role or short explanation.
  detail?: string;
  value?: string;
  accessory?: Accessory;
  onPress?: () => void;
  disabled?: boolean;
  // Read by screen readers after the label, e.g. why the row is disabled.
  hint?: string;
  // Replaces the spoken label when the visible one relies on its section, e.g. "Save to folder".
  spokenLabel?: string;
  expanded?: boolean;
  role?: 'button' | 'link';
  ref?: Ref<ViewRef>;
};

export function SettingsRow({ icon, label, detail, value, accessory, onPress, disabled = false, hint, spokenLabel, expanded, role = 'button', ref }: SettingsRowProps) {
  const styles = useStyles();
  const { colors, fontScale } = useSettings();
  // On web the app scales text itself (fontScale); natively the OS does (systemFontScale).
  const { fontScale: systemFontScale } = useWindowDimensions();
  const stacked = !!value && fontScale * systemFontScale >= STACKED_FONT_SCALE;
  const accessibilityLabel = `${spokenLabel ?? label}${detail ? `, ${detail}` : ''}${value ? `: ${value}` : ''}`;
  const content = <>
    <View style={styles.settingsRowIcon}><Ionicons name={icon} size={20} color={colors.text} /></View>
    <View style={[styles.settingsRowBody, stacked && styles.settingsRowBodyStacked]}>
      {detail
        ? <View style={styles.settingsRowLabels}>
          <Text style={styles.settingsRowText}>{label}</Text>
          <Text style={styles.settingsRowDetail}>{detail}</Text>
        </View>
        : <Text style={styles.settingsRowText}>{label}</Text>}
      {!!value && <Text style={[styles.settingsRowValue, stacked && styles.settingsRowValueStacked]}>{value}</Text>}
    </View>
    {accessory && <Ionicons name={ACCESSORY_ICONS[accessory]} size={16} color={colors.muted} />}
  </>;

  if (!onPress) {
    return <View ref={ref} accessible accessibilityLabel={accessibilityLabel} style={styles.settingsRow}>{content}</View>;
  }
  return <Pressable
    ref={ref}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole={role}
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }}
    accessibilityHint={hint}
    aria-expanded={expanded}
    style={({ pressed }) => [styles.settingsRow, pressed && styles.settingsRowPressed, disabled && styles.settingsRowDisabled]}
  >
    {content}
  </Pressable>;
}

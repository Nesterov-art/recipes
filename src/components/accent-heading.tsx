import { Text, type TextProps } from 'react-native';

// Decorative punctuation for large screen headings only; stored copy stays unchanged.
export function AccentHeading({ children, ...props }: Omit<TextProps, 'children'> & { children: string }) {
  const ending = children.match(/[?!？！.!…,:;。]$/u);
  return (
    <Text {...props} accessibilityRole="header" accessibilityLabel={children}>
      {ending ? <>{children.slice(0, -ending[0].length)}<Text style={{ color: '#F5A66A' }}>{ending[0]}</Text></> : <>{children}<Text style={{ color: '#F5A66A' }}>.</Text></>}
    </Text>
  );
}

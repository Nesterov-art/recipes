import type { ScrollViewProps } from 'react-native';

// Native lists close the keyboard when the user drags them.
export const keyboardDismissOnDrag: ScrollViewProps['keyboardDismissMode'] = 'on-drag';

import type { ScrollViewProps } from 'react-native';

// React Native Web blurs the focused field on every scroll event, including
// programmatic and focus-driven scrolls, so typed text can be lost. Browsers have
// no drag-to-dismiss keyboard behaviour to preserve.
export const keyboardDismissOnDrag: ScrollViewProps['keyboardDismissMode'] = undefined;

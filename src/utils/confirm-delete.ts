import { Alert } from 'react-native';

export function confirmDelete(title: string, message: string, confirmLabel: string, cancelLabel: string): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

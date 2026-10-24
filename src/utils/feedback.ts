import * as Linking from 'expo-linking';

const FEEDBACK_URL = 'https://github.com/Nesterov-art/recipes/issues/new';

export function openFeedback(appVersion: string) {
  const title = encodeURIComponent(`[${appVersion}] `);
  void Linking.openURL(`${FEEDBACK_URL}?title=${title}`).catch((error) => {
    console.warn('Unable to open feedback page', error);
  });
}

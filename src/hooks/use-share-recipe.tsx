import { useRef, useState } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import type { Recipe } from '@/constants/recipes';
import { useSettings } from '@/context/settings-context';
import { useToast } from '@/context/toast-context';
import { useStyles } from '@/styles';
import { buildRecipeLink, LINK_LIMITS, RecipeLinkError, SHARE_ORIGIN } from '@/utils/recipe-link';

type Notice = { error: string } | { link: string };

// "Share recipe": the system share menu opens at once with the title and the link. A browser
// without a share menu copies the link. A sheet appears only when something needs reading:
// the recipe is too long for a link, or the link could not be handed over and is shown to
// select by hand. Closing the share menu is not an error. One share runs at a time.
export function useShareRecipe() {
  const { t } = useSettings();
  const { showToast } = useToast();
  const styles = useStyles();
  const busy = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Why no link was made: too long, a field the format cannot carry (named, with its limit),
  // or anything else.
  function linkError(error: unknown) {
    if (!(error instanceof RecipeLinkError)) return t('recipeLinkFailed');
    if (error.code === 'size') return t('recipeLinkTooLong');
    if (error.code !== 'unsupported' || !error.limit) return t('recipeLinkFailed');
    const detail = {
      title: t('recipeLinkLimitTitle', { max: LINK_LIMITS.title }),
      time: t('recipeLinkLimitTime', { max: LINK_LIMITS.time }),
      ingredients: t('recipeLinkLimitIngredients', { items: LINK_LIMITS.items, max: LINK_LIMITS.ingredient }),
      steps: t('recipeLinkLimitSteps', { items: LINK_LIMITS.items, max: LINK_LIMITS.step }),
    }[error.limit];
    return t('recipeLinkUnsupported', { detail });
  }

  async function share(recipe: Recipe) {
    if (busy.current) return;
    busy.current = true;
    try {
      let link: string;
      try {
        link = buildRecipeLink(recipe, Platform.OS === 'web' ? window.location.origin : SHARE_ORIGIN);
      } catch (error) {
        setNotice({ error: linkError(error) });
        return;
      }
      if (Platform.OS !== 'web') {
        try { await Share.share({ message: `${recipe.title}\n${link}` }); } catch { setNotice({ link }); }
        return;
      }
      if (typeof navigator.share === 'function') {
        try { await navigator.share({ title: recipe.title, url: link }); return; } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          // Any other refusal falls back to copying.
        }
      }
      try {
        await navigator.clipboard.writeText(link);
        showToast(t('linkCopied'));
      } catch { setNotice({ link }); }
    } finally {
      busy.current = false;
    }
  }

  const close = () => setNotice(null);
  const sheet = notice && <BottomSheet title={t('shareRecipeTitle')} onClose={close}>
    {'error' in notice
      ? <Text accessibilityRole="alert" style={[styles.settingsHint, { marginTop: 0, paddingHorizontal: 4 }]}>{notice.error}</Text>
      : <View style={{ paddingHorizontal: 4 }}>
        <Text style={[styles.settingsHint, { marginTop: 0 }]}>{t('copyLinkManual')}</Text>
        <View style={[styles.group, { marginTop: 12, padding: 16, backgroundColor: styles.screen.backgroundColor }]}>
          <Text selectable testID="recipe-link" style={[styles.groupTextMuted, { fontSize: 13, lineHeight: 18 }]}>{notice.link}</Text>
        </View>
        <Text style={styles.settingsHint}>{t('shareRecipeHint')}</Text>
      </View>}
    <View style={[styles.choiceActions, { paddingHorizontal: 4 }]}>
      <Pressable onPress={close} style={({ pressed }) => [styles.choicePrimary, pressed && styles.pressed]} accessibilityRole="button">
        <Text style={styles.choicePrimaryText}>{t('done')}</Text>
      </Pressable>
    </View>
  </BottomSheet>;

  return { share, sheet };
}

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SharedRecipeView } from '@/components/shared-recipe-view';
import { MONOREC_THEMES } from '@/constants/theme';
import { useImportDraft } from '@/context/import-draft-context';
import { useRecipes } from '@/context/recipes-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useToast } from '@/context/toast-context';
import { useStyles } from '@/styles';
import { fetchRecipePage } from '@/utils/fetch-recipe-page';
import { findDuplicate, recipeFromDraft } from '@/utils/import-draft';
import { linkTarget, loadMessage, type Message, parseMessage, problemMessage } from '@/utils/import-link-target';
import { mergeRecipeBackup, type RecipeBackup } from '@/utils/recipe-backup';
import { createWithFreshId } from '@/utils/recipe-create';
import { parseRecipePage, type RecipeImportResult } from '@/utils/recipe-import';
import { LINK_ERRORS, SHARE_ORIGIN, type SharedRecipe } from '@/utils/recipe-link';

// A recipe found on a cooking site: added as is when it is whole, or checked in the form first.
type SiteRecipe = Extract<RecipeImportResult, { status: 'complete' | 'partial' }> & { host: string };
// Monorec's own host names: a Monorec page that is not a recipe link is not loaded as a site.
const OWN_HOSTS = [new URL(SHARE_ORIGIN).hostname, ...(Platform.OS === 'web' && typeof window !== 'undefined' ? [window.location.hostname] : [])];

export default function ImportLinkScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><ImportLinkContent /></PaletteProvider>;
}

// A pasted link is read and previewed; the book changes only after "Add to my book", through
// the regular recipe import with its duplicate check. The recipe gets a new local id.
function ImportLinkContent() {
  const insets = useSafeAreaInsets();
  const { colors, t } = useSettings();
  const { showToast } = useToast();
  const styles = useStyles();
  const { recipes, recipeMeta, importRecipes, createRecipe } = useRecipes();
  const drafts = useImportDraft();
  const [text, setText] = useState('');
  const [shared, setShared] = useState<SharedRecipe | null>(null);
  const [error, setError] = useState('');
  const saving = useRef(false);
  // Each "Show recipe" brings its result into view: the preview, or the field with the error.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const contentY = useRef(0);
  const fieldY = useRef(0);
  const [shown, setShown] = useState(0);
  const reveal = (y: number) => scroll.current?.scrollTo({ y: Math.max(0, contentY.current + y - insets.top - 16), animated: true });
  const backup = (recipe: SharedRecipe, id: string): RecipeBackup => ({
    format: 'recipes-backup', version: 1, exportedAt: new Date().toISOString(), recipes: [{ id, ...recipe }], recipeMeta: {},
  });
  const duplicate = shared !== null && mergeRecipeBackup(recipes, recipeMeta, backup(shared, 'preview')).duplicates > 0;

  // A page of a cooking site. One load at a time: each has a number, and only the latest one
  // may change the screen, so a late answer to an older load (or after leaving) is dropped.
  const [site, setSite] = useState<SiteRecipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useRef<{ id: number; controller: AbortController } | null>(null);
  const loads = useRef(0);
  const say = (message: Message) => t(message.key, message.values);
  function stopLoading() {
    load.current?.controller.abort();
    load.current = null;
    loads.current++;
    setLoading(false);
  }
  // The draft handed to the form, forgotten when this screen closes.
  const offered = useRef<string | null>(null);
  useEffect(() => () => {
    load.current?.controller.abort(); load.current = null; loads.current++;
    if (offered.current) drafts.clear(offered.current);
  }, [drafts]);
  // A site recipe that is whole can be added as is; it is a duplicate only when every field
  // matches one in the book exactly (the existing comparison).
  const whole = site?.status === 'complete' ? recipeFromDraft(site.draft, 'preview') : null;
  const siteDuplicate = whole ? findDuplicate(recipes, { title: whole.title, category: whole.category, time: whole.time, ingredients: whole.ingredients, steps: whole.steps }) : null;
  // Adding: created under a free id only, refused if an exact copy is in the book (checked inside
  // the write), and no second write while one is running.
  const [adding, setAdding] = useState<'idle' | 'saving' | 'failed' | 'idConflict'>('idle');
  const addingNow = useRef(false);
  async function addSite() {
    if (!site || addingNow.current) return;
    const recipe = recipeFromDraft(site.draft, 'new');
    if (!recipe) return;
    const { id: _id, ...fields } = recipe;
    if (findDuplicate(recipes, fields)) return;
    addingNow.current = true;
    setAdding('saving');
    const { result } = await createWithFreshId(createRecipe, fields, id => router.replace({ pathname: '/recipe/[id]', params: { id } }), { refuseDuplicate: true });
    addingNow.current = false;
    // A failed write stays with the storage guard (its Retry finishes this same recipe); a copy
    // that appeared meanwhile shows as the duplicate notice once the book updates.
    if (result === 'notSaved') setAdding('failed');
    else if (result === 'idTaken') setAdding('idConflict');
    else if (result === 'duplicate') setAdding('idle');
  }
  function editSite() {
    if (!site || addingNow.current) return;
    offered.current = drafts.offer({ draft: site.draft, host: site.host });
    router.push({ pathname: '/form', params: { draft: offered.current } });
  }

  async function findOnSite(url: string) {
    const id = ++loads.current;
    const controller = new AbortController();
    load.current = { id, controller };
    setLoading(true);
    const loaded = await fetchRecipePage(url, { signal: controller.signal });
    if (loads.current !== id) return;
    load.current = null;
    setLoading(false);
    if (loaded.status === 'cancelled') { setNotice(say(loadMessage(loaded, Platform.OS === 'web'))); return; }
    if (loaded.status !== 'success') { setError(say(loadMessage(loaded, Platform.OS === 'web'))); return; }
    const parsed = parseRecipePage(loaded.html);
    if (parsed.status === 'complete' || parsed.status === 'partial') {
      setAdding('idle');
      setSite({ ...parsed, host: new URL(loaded.url).hostname });
    }
    else setError(say(parseMessage(parsed)));
  }

  function show() {
    Keyboard.dismiss();
    if (loading) return;
    setShown(count => count + 1);
    setShared(null); setSite(null); setError(''); setNotice('');
    const target = linkTarget(text, OWN_HOSTS);
    if (target.kind === 'monorec') setShared(target.recipe);
    else if (target.kind === 'monorecError') setError(t(LINK_ERRORS[target.code]));
    else if (target.kind === 'notLink') setError(t('recipeLinkMissing'));
    else if (target.kind === 'ownPage') setError(t('importLinkOwnPage'));
    else if (target.kind === 'refused') setError(say(loadMessage(target.result, Platform.OS === 'web')));
    else void findOnSite(target.url);
  }
  async function add() {
    if (!shared || saving.current) return;
    saving.current = true;
    const id = `${Date.now()}-${Math.random()}`;
    try {
      await importRecipes(backup(shared, id), () => {
        showToast(t('recipeLinkAdded'));
        router.replace({ pathname: '/recipe/[id]', params: { id } });
      });
    } catch { /* A failed save is shown by the storage guard and can be retried there. */ }
    saving.current = false;
  }

  return (
    // As in the recipe form: iOS insets the scroll view, Android makes room for the keyboard here.
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'android' ? 'padding' : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.recipeContent} onLayout={event => { contentY.current = event.nativeEvent.layout.y; }}>
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
              accessibilityRole="button" accessibilityLabel={t('close')}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <Text style={styles.choiceKicker}>{t('addByLink')}</Text>
          <Text accessibilityRole="header" style={styles.recipeTitle}>{t('importLinkTitle')}</Text>

          <TextInput
            value={text}
            // A new address cancels a load still running for the old one.
            onChangeText={value => { if (loading) stopLoading(); setText(value); setError(''); setNotice(''); }}
            placeholder={t('importLinkPlaceholder')}
            placeholderTextColor={colors.muted}
            selectionColor={colors.text}
            accessibilityLabel={t('importLinkLabel')}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            onLayout={event => { fieldY.current = event.nativeEvent.layout.y; }}
            style={[styles.field, styles.fieldMultiline, styles.fieldCapped, { marginTop: 20 }]}
          />
          {!!error && <Text key={shown} onLayout={() => reveal(fieldY.current - 20)} accessibilityRole="alert" style={[styles.settingsHint, { color: colors.danger }]}>{error}</Text>}
          {!!notice && <Text accessibilityLiveRegion="polite" style={styles.settingsHint}>{notice}</Text>}
          {loading ? (
            <View testID="recipe-site-loading" style={styles.choiceActions}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.muted} />
                <Text style={[styles.settingsHint, { marginTop: 0 }]}>{t('siteLoading')}</Text>
              </View>
              <Pressable onPress={() => load.current?.controller.abort()} style={({ pressed }) => [styles.choiceSecondary, pressed && { backgroundColor: colors.cardPressed }]} accessibilityRole="button">
                <Text style={styles.choiceSecondaryText}>{t('cancel')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.choiceActions}>
              <Pressable onPress={show} style={({ pressed }) => [styles.choiceSecondary, pressed && { backgroundColor: colors.cardPressed }]} accessibilityRole="button">
                <Text style={styles.choiceSecondaryText}>{t('importLinkShow')}</Text>
              </Pressable>
            </View>
          )}

          {site && <View key={shown} testID="recipe-site-preview" style={{ marginTop: 28 }} onLayout={event => reveal(event.nativeEvent.layout.y)}>
            {/* What happens to it comes first: added as new, checked first, or already in the book. */}
            <Text style={[styles.settingsHint, { marginTop: 0 }]}>{siteDuplicate ? t('recipeLinkDuplicate') : whole ? t('siteCompleteHint') : t('sitePartialEditHint')}</Text>
            {site.status === 'partial' && <View testID="recipe-site-problems" style={{ marginTop: 8 }}>
              <Text style={[styles.settingsHint, { marginTop: 0, color: colors.text }]}>{t('sitePartialHint')}</Text>
              {site.problems.map((problem, index) => (
                <Text key={`${problem.field}-${problem.problem}-${index}`} style={[styles.settingsHint, { marginTop: 4 }]}>• {say(problemMessage(problem))}</Text>
              ))}
            </View>}
            <Text style={[styles.settingsHint, { marginTop: 8, marginBottom: 12 }]}>{t('siteSource', { host: site.host })}</Text>
            <SharedRecipeView recipe={site.draft} />
            {(adding === 'failed' || adding === 'idConflict') && <Text accessibilityRole="alert" style={[styles.settingsHint, { color: colors.danger }]}>{t(adding === 'failed' ? 'siteSaveFailed' : 'recipeIdConflict')}</Text>}
            <View style={styles.choiceActions}>
              {siteDuplicate ? (
                <Pressable onPress={() => router.replace({ pathname: '/recipe/[id]', params: { id: siteDuplicate } })} style={({ pressed }) => [styles.choicePrimary, pressed && styles.pressed]} accessibilityRole="button">
                  <Text style={styles.choicePrimaryText}>{t('openRecipeAction')}</Text>
                </Pressable>
              ) : whole && (
                <Pressable onPress={() => void addSite()} disabled={adding === 'saving'} style={({ pressed }) => [styles.choicePrimary, (pressed || adding === 'saving') && styles.pressed]}
                  accessibilityRole="button" accessibilityState={{ disabled: adding === 'saving', busy: adding === 'saving' }}>
                  <Text style={styles.choicePrimaryText}>{adding === 'saving' ? t('siteSaving') : t('backupConfirm')}</Text>
                </Pressable>
              )}
              <Pressable onPress={editSite} disabled={adding === 'saving'} style={({ pressed }) => [styles.choiceSecondary, pressed && { backgroundColor: colors.cardPressed }]} accessibilityRole="button">
                <Text style={styles.choiceSecondaryText}>{t('edit')}</Text>
              </Pressable>
            </View>
          </View>}

          {shared && <View key={shown} testID="recipe-link-preview" style={{ marginTop: 28 }} onLayout={event => reveal(event.nativeEvent.layout.y)}>
            {/* What happens to this recipe comes first, above the recipe itself. */}
            <Text style={[styles.settingsHint, { marginTop: 0, marginBottom: 12 }]}>{duplicate ? t('recipeLinkDuplicate') : t('recipeLinkHint')}</Text>
            <SharedRecipeView recipe={shared} />
            <View style={styles.choiceActions}>
              {!duplicate && (
                <Pressable onPress={() => void add()} style={({ pressed }) => [styles.choicePrimary, pressed && styles.pressed]} accessibilityRole="button">
                  <Text style={styles.choicePrimaryText}>{t('backupConfirm')}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.choiceSecondary, pressed && { backgroundColor: colors.cardPressed }]} accessibilityRole="button">
                <Text style={styles.choiceSecondaryText}>{t('cancel')}</Text>
              </Pressable>
            </View>
          </View>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

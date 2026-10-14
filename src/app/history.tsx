import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRecipes } from '@/context/recipes-context';
import { useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';
import { cookingHistoryDateLabel, ratingEmoji, ratingLabel } from '@/utils/recipes';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, language, t } = useSettings();
  const { getRecipeMeta, recipes } = useRecipes();
  const styles = useStyles();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const recipe = recipes.find((item) => item.id === first(params.id));

  if (!recipe) return <View style={styles.screen} />;

  const cookings = getRecipeMeta(recipe.id).cookings;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('back')}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.bigTitle}>{t('cookingHistory')}</Text>
        <Text style={styles.subtitle}>{recipe.title}</Text>

        <View style={[styles.group, { marginTop: 24 }]}>
          {cookings.map((cooking, index) => (
            <View key={cooking.id} style={styles.historyRow}>
              {index > 0 && <View style={styles.separator} />}
              <Text style={styles.historyDate}>
                {cookingHistoryDateLabel(cooking.cookedAt, language)}
              </Text>
              {cooking.rating && (
                <Text style={styles.historyRating}>
                  {ratingEmoji(cooking.rating)} {ratingLabel(cooking.rating, t)}
                </Text>
              )}
              {cooking.note && <Text style={styles.historyNote}>«{cooking.note}»</Text>}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

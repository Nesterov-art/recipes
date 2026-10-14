import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CookingRating } from '@/constants/recipes';
import { useRecipes } from '@/context/recipes-context';
import { useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function CookScreen() {
  const insets = useSafeAreaInsets();
  const { colors, t } = useSettings();
  const { recipes, recordCooking } = useRecipes();
  const styles = useStyles();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const recipe = recipes.find((item) => item.id === first(params.id));
  const [rating, setRating] = useState<CookingRating | undefined>();
  const [note, setNote] = useState('');

  const ratings: { value: CookingRating; emoji: string; label: string }[] = [
    { value: 'disliked', emoji: '😕', label: t('ratingDisliked') },
    { value: 'good', emoji: '🙂', label: t('ratingGood') },
    { value: 'great', emoji: '🤤', label: t('ratingGreat') },
  ];

  if (!recipe) return <View style={styles.screen} />;

  function handleSave() {
    recordCooking(recipe!.id, { rating, note });
    router.back();
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
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
            accessibilityLabel={t('close')}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.bigTitle}>{t('cookedTitle')}</Text>
        <Text style={styles.subtitle}>{recipe.title}</Text>

        <Text style={styles.fieldLabel}>{t('rateResult')}</Text>
        <Text style={styles.groupTextMuted}>{t('ratingOptional')}</Text>
        <View style={styles.ratingRow}>
          {ratings.map((item) => {
            const active = rating === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => setRating(active ? undefined : item.value)}
                style={({ pressed }) => [
                  styles.ratingChoice,
                  active && styles.choiceActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={styles.ratingEmoji}>{item.emoji}</Text>
                <Text style={[styles.ratingText, active && styles.ratingTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>{t('personalNote')}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('notePlaceholder')}
          placeholderTextColor={colors.muted}
          selectionColor={colors.text}
          style={[styles.field, styles.fieldMultiline]}
          multiline
          scrollEnabled={false}
        />
        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [styles.primaryButton, pressed && { transform: [{ scale: 0.98 }] }]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>{t('saveCooking')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/context/settings-context';
import { useShopping } from '@/context/shopping-context';
import { useStyles } from '@/styles';
import type { ShoppingItem } from '@/utils/shopping';

export default function ShoppingScreen() {
  const insets = useSafeAreaInsets();
  const { colors, t } = useSettings();
  const {
    addItem,
    clearCompleted,
    items,
    removeItem,
    reorderItems,
    toggleItem,
    updateItem,
  } = useShopping();
  const styles = useStyles();
  const [value, setValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const swipeableRefs = useRef(new Map<string, SwipeableMethods>());
  const hasCompleted = items.some((item) => item.checked);

  function closeSwipeables(exceptId?: string) {
    swipeableRefs.current.forEach((swipeable, id) => {
      if (id !== exceptId) swipeable.close();
    });
  }

  function handleAdd() {
    if (draggingId) return;
    if (addItem(value)) setValue('');
  }

  function startEditing(id: string, text: string) {
    if (draggingId) return;
    closeSwipeables();
    setEditingId(id);
    setEditingValue(text);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingValue('');
  }

  function saveEditing() {
    if (!editingId || !updateItem(editingId, editingValue)) return;
    cancelEditing();
  }

  function renderItem({ item, drag, isActive }: RenderItemParams<ShoppingItem>) {
    const interactionsDisabled = draggingId !== null;
    const gesturesDisabled = interactionsDisabled || editingId !== null;

    return (
      <ReanimatedSwipeable
        ref={(swipeable) => {
          if (swipeable) swipeableRefs.current.set(item.id, swipeable);
          else swipeableRefs.current.delete(item.id);
        }}
        enabled={!gesturesDisabled && !isActive}
        friction={1.5}
        rightThreshold={48}
        dragOffsetFromRightEdge={18}
        overshootRight={false}
        containerStyle={styles.shoppingCard}
        onSwipeableWillOpen={() => closeSwipeables(item.id)}
        renderRightActions={(_progress, _translation, swipeable) => (
          <Pressable
            onPress={() => {
              swipeable.close();
              removeItem(item.id);
            }}
            style={({ pressed }) => [styles.shoppingSwipeDelete, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('delete')}
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={styles.shoppingSwipeDeleteText}>{t('delete')}</Text>
          </Pressable>
        )}
      >
        <View style={styles.shoppingRow}>
          {editingId === item.id ? (
            <View style={styles.shoppingEditRow}>
              <TextInput
                autoFocus
                value={editingValue}
                onChangeText={setEditingValue}
                onSubmitEditing={saveEditing}
                placeholder={t('shoppingPlaceholder')}
                placeholderTextColor={colors.muted}
                selectionColor={colors.text}
                returnKeyType="done"
                style={styles.shoppingEditInput}
              />
              <Pressable
                onPress={saveEditing}
                hitSlop={6}
                style={({ pressed }) => [styles.shoppingEditButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('save')}
              >
                <Ionicons name="checkmark" size={21} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={cancelEditing}
                hitSlop={6}
                style={({ pressed }) => [styles.shoppingEditButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('cancel')}
              >
                <Ionicons name="close" size={21} color={colors.muted} />
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable
                onPress={() => toggleItem(item.id)}
                disabled={interactionsDisabled}
                hitSlop={6}
                style={({ pressed }) => [styles.shoppingCheckbox, pressed && styles.pressed]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.checked, disabled: interactionsDisabled }}
              >
                <Ionicons
                  name={item.checked ? 'checkmark-circle' : 'ellipse-outline'}
                  size={23}
                  color={item.checked ? colors.text : colors.muted}
                />
              </Pressable>
              <Pressable
                onLongPress={drag}
                delayLongPress={350}
                disabled={isActive || gesturesDisabled}
                style={({ pressed }) => [styles.shoppingDragArea, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={item.text}
                accessibilityHint={t('shoppingItemGestureHint')}
              >
                <Text style={[styles.shoppingText, item.checked && styles.shoppingTextChecked]}>
                  {item.text}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => startEditing(item.id, item.text)}
                disabled={interactionsDisabled}
                hitSlop={6}
                style={({ pressed }) => [styles.shoppingRowAction, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('edit')}
              >
                <Ionicons name="pencil-outline" size={19} color={colors.muted} />
              </Pressable>
            </>
          )}
        </View>
      </ReanimatedSwipeable>
    );
  }

  const header = (
    <View>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('back')}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      </View>
      <Text style={styles.bigTitle}>{t('shoppingList')}</Text>
      <View style={styles.shoppingInputRow}>
        <TextInput
          value={value}
          onChangeText={setValue}
          onSubmitEditing={handleAdd}
          placeholder={t('shoppingPlaceholder')}
          placeholderTextColor={colors.muted}
          selectionColor={colors.text}
          returnKeyType="done"
          style={styles.shoppingInput}
        />
        <Pressable
          onPress={handleAdd}
          disabled={draggingId !== null}
          style={({ pressed }) => [styles.addItemButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('addItem')}
        >
          <Ionicons name="add" size={26} color={colors.accentText} />
        </Pressable>
      </View>
      <Pressable
        onPress={() => router.push('/shopping-matches')}
        disabled={draggingId !== null}
        style={({ pressed }) => [styles.shoppingMatchesButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t('whatCanCook')}
      >
        <Ionicons name="restaurant-outline" size={21} color={colors.text} />
        <Text style={styles.shoppingMatchesButtonText}>{t('whatCanCook')}</Text>
        <Ionicons name="chevron-forward" size={19} color={colors.muted} />
      </Pressable>
    </View>
  );

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.screen}>
      <DraggableFlatList
        containerStyle={styles.shoppingList}
        style={styles.shoppingList}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragBegin={(index) => {
          closeSwipeables();
          setDraggingId(items[index]?.id ?? null);
        }}
        onDragEnd={({ data }) => {
          reorderItems(data.map((item) => item.id));
          setDraggingId(null);
        }}
        autoscrollThreshold={72}
        autoscrollSpeed={110}
        activationDistance={10}
        ListHeaderComponent={header}
        ListEmptyComponent={(
          <View>
            <Text style={styles.empty}>{t('shoppingEmpty')}</Text>
            <Text style={[styles.empty, { marginTop: 4 }]}>{t('shoppingEmptyHint')}</Text>
          </View>
        )}
        ListFooterComponent={hasCompleted ? (
          <Pressable
            onPress={clearCompleted}
            disabled={draggingId !== null}
            style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.deleteText}>{t('clearCompleted')}</Text>
          </Pressable>
        ) : null}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </Animated.View>
  );
}

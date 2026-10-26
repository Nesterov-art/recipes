import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/context/settings-context';
import { useShopping } from '@/context/shopping-context';
import { useStyles } from '@/styles';
import { keyboardDismissOnDrag } from '@/utils/keyboard-dismiss';
import { orderShoppingItems, type ShoppingItem } from '@/utils/shopping';

// Gesture Handler 3.3 on web drops the Swipeable's touchAction="pan-y" whenever it
// resets a gesture config and leaves touch-action: none on the rows, so a touch that
// starts on a row cannot scroll the list. Restore the pan-y the library intends.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = '[data-testid="shopping-swipeable"] * { touch-action: pan-y !important; }';
  document.head.appendChild(style);
}

export default function ShoppingScreen() {
  const insets = useSafeAreaInsets();
  const { colors, shoppingCompletedBehavior, t } = useSettings();
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
  const touchDragActive = useRef(false);
  const swipeableRefs = useRef(new Map<string, SwipeableMethods>());
  const suppressRowActionsUntil = useRef(0);
  const saving = useRef(false);
  const hasCompleted = items.some((item) => item.checked);
  const displayedItems = useMemo(
    () => orderShoppingItems(items, shoppingCompletedBehavior === 'moveDown'),
    [items, shoppingCompletedBehavior],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Safari/Chromium otherwise start native scrolling and send pointercancel
    // after the long press has already activated DraggableFlatList. A dynamic
    // touch-action change is too late for the current touch sequence. Cancel
    // only active drag moves, leaving ordinary touch scrolling untouched.
    const preventDragScroll = (event: TouchEvent) => {
      if (touchDragActive.current && event.cancelable) event.preventDefault();
    };
    const release = () => { touchDragActive.current = false; };
    window.addEventListener('touchmove', preventDragScroll, { passive: false });
    window.addEventListener('touchend', release);
    window.addEventListener('touchcancel', release);
    return () => {
      window.removeEventListener('touchmove', preventDragScroll);
      window.removeEventListener('touchend', release);
      window.removeEventListener('touchcancel', release);
    };
  }, []);

  function closeSwipeables(exceptId?: string) {
    swipeableRefs.current.forEach((swipeable, id) => {
      if (id !== exceptId) swipeable.close();
    });
  }

  async function handleAdd() {
    if (draggingId || saving.current) return;
    saving.current = true;
    const submitted = value;
    await addItem(submitted, () => setValue(current => current === submitted ? '' : current));
    saving.current = false;
  }

  function startEditing(id: string, text: string) {
    if (draggingId) return;
    closeSwipeables(id);
    // Restore the full card before autoFocus can make Safari pan to the field.
    swipeableRefs.current.get(id)?.reset();
    setEditingId(id);
    setEditingValue(text);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingValue('');
  }

  async function saveEditing() {
    if (!editingId || saving.current) return;
    saving.current = true;
    await updateItem(editingId, editingValue, cancelEditing);
    saving.current = false;
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
        testID="shopping-swipeable"
        enabled={!gesturesDisabled && !isActive}
        friction={1.5}
        rightThreshold={48}
        // Gesture Handler 3 takes a signed offset: -18 matches the former 18 px edge offset.
        dragOffsetFromRight={-18}
        overshootRight={false}
        containerStyle={styles.shoppingCard}
        childrenContainerStyle={styles.shoppingSwipeContent}
        onSwipeableWillOpen={() => closeSwipeables(item.id)}
        renderRightActions={(_progress, _translation, swipeable) => (
          <View style={styles.shoppingSwipeActions} testID="shopping-swipe-actions">
          <GesturePressable
            onPress={() => {
              if (Date.now() >= suppressRowActionsUntil.current) startEditing(item.id, item.text);
            }}
            disabled={gesturesDisabled}
            style={({ pressed }) => [styles.shoppingSwipeAction, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('edit')}
          >
            <View style={[styles.shoppingSwipeActionCircle, styles.shoppingSwipeEditCircle]}>
              <Ionicons name="pencil-outline" size={21} color={colors.text} />
            </View>
            <Text style={styles.shoppingSwipeActionText}>{t('edit')}</Text>
          </GesturePressable>
          <GesturePressable
            disabled={gesturesDisabled}
            onPress={() => {
              // Keep the release that confirmed deletion from landing on the
              // actions of the row that immediately moves into its place.
              suppressRowActionsUntil.current = Date.now() + 500;
              cancelEditing();
              swipeable.close();
              requestAnimationFrame(() => removeItem(item.id));
            }}
            style={({ pressed }) => [styles.shoppingSwipeAction, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('delete')}
          >
            <View style={[styles.shoppingSwipeActionCircle, styles.shoppingSwipeDeleteCircle]}>
              <Ionicons name="trash-outline" size={23} color="#FFFFFF" />
            </View>
            <Text style={styles.shoppingSwipeActionText}>{t('delete')}</Text>
          </GesturePressable>
          </View>
        )}
      >
        <View style={styles.shoppingRow} testID="shopping-row">
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
                onPress={() => {
                  if (Date.now() >= suppressRowActionsUntil.current) toggleItem(item.id);
                }}
                disabled={interactionsDisabled}
                hitSlop={6}
                style={({ pressed }) => [styles.shoppingCheckbox, pressed && styles.pressed]}
                accessibilityRole="checkbox"
                accessibilityLabel={item.text}
                aria-checked={item.checked}
                accessibilityState={{ checked: item.checked, disabled: interactionsDisabled }}
              >
                <Ionicons
                  name={item.checked ? 'checkmark-circle' : 'ellipse-outline'}
                  size={23}
                  color={item.checked ? colors.text : colors.muted}
                />
              </Pressable>
              <Pressable
                testID="shopping-drag"
                onLongPress={() => { if (!draggingId) drag(); }}
                delayLongPress={350}
                disabled={editingId !== null || (interactionsDisabled && !isActive)}
                style={({ pressed }) => [styles.shoppingDragArea, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={item.text}
                accessibilityHint={t('shoppingItemGestureHint')}
              >
                <Text style={[styles.shoppingText, item.checked && styles.shoppingTextChecked]}>
                  {item.text}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </ReanimatedSwipeable>
    );
  }

  const header = (
    <View>
      <Text accessibilityRole="header" style={styles.bigTitle}>{t('shoppingList')}</Text>
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
    <View style={styles.screen}>
      <DraggableFlatList
        containerStyle={styles.shoppingList}
        style={styles.shoppingList}
        data={displayedItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragBegin={(index) => {
          touchDragActive.current = true;
          closeSwipeables();
          setDraggingId(displayedItems[index]?.id ?? null);
        }}
        onDragEnd={({ data }) => {
          touchDragActive.current = false;
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
        ) : undefined}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 16,
          // The tab bar below already covers the bottom safe area.
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissOnDrag}
      />
    </View>
  );
}

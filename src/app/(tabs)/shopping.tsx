import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MONOREC_THEMES } from '@/constants/theme';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useShopping } from '@/context/shopping-context';
import { useStyles } from '@/styles';
import { commitDroppedOrder, HOLD_DROPPED_ORDER } from '@/utils/drop-commit';
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

// Large text moves the amount under the product name.
const STACKED_FONT_SCALE = 1.35;
// Working column on tablets and desktop, as in Settings.
const COLUMN_MAX_WIDTH = 680;

// Display only: the stored text is "<name> — <amount or note>". Show the amount
// apart from the name; anything else is shown as stored.
function splitItemText(item: ShoppingItem) {
  const prefix = `${item.name} — `;
  return item.text.startsWith(prefix)
    ? { title: item.name, detail: item.text.slice(prefix.length) }
    : { title: item.text, detail: '' };
}

// Mirrors the Swipeable's own offset into the card, so the card can make room for
// the actions instead of sliding its name and amount out of sight.
function OffsetMirror({ from, to }: { from: SharedValue<number>; to: SharedValue<number> }) {
  useAnimatedReaction(() => from.get(), (value) => { to.set(value); });
  return null;
}

export default function ShoppingScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><ShoppingContent /></PaletteProvider>;
}

function ShoppingContent() {
  const insets = useSafeAreaInsets();
  const { fontScale: systemFontScale } = useWindowDimensions();
  const { colors, fontScale, shoppingCompletedBehavior, t } = useSettings();
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
  const [openId, setOpenId] = useState<string | null>(null);
  // The open card, readable without waiting for a render.
  const openIdRef = useRef<string | null>(null);
  const touchDragActive = useRef(false);
  const swipeableRefs = useRef(new Map<string, SwipeableMethods>());
  const suppressRowActionsUntil = useRef(0);
  // The card a touch started on; a touch anywhere else closes open actions.
  const touchedCardId = useRef<string | null>(null);
  const saving = useRef(false);
  const hasCompleted = items.some((item) => item.checked);
  const allCompleted = items.length > 0 && items.every((item) => item.checked);
  const canAdd = value.trim() !== '' && draggingId === null;
  const stackedDetail = fontScale * systemFontScale >= STACKED_FONT_SCALE;
  // Web only: the dropped order, shown until the regular save publishes it (or fails
  // and the saved order returns), so the list does not flash back on release.
  const [droppedOrder, setDroppedOrder] = useState<ShoppingItem[] | null>(null);
  const savedOrder = useMemo(
    () => orderShoppingItems(items, shoppingCompletedBehavior === 'moveDown'),
    [items, shoppingCompletedBehavior],
  );
  const displayedItems = droppedOrder ?? savedOrder;

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

  // Only the open card is closed: closing a closed Swipeable still reports a close,
  // and those reports would re-render the list in the middle of a drag.
  const closeOpenCard = useCallback((exceptId?: string | null) => {
    const open = openIdRef.current;
    if (open !== null && open !== exceptId) swipeableRefs.current.get(open)?.close();
  }, []);

  const setCardRef = useCallback((id: string, swipeable: SwipeableMethods | null) => {
    if (swipeable) swipeableRefs.current.set(id, swipeable);
    else swipeableRefs.current.delete(id);
  }, []);

  // Cards mark their touches first (events bubble from the card to the screen).
  const markCardTouch = useCallback((id: string) => { touchedCardId.current = id; }, []);
  function handleScreenTouch() {
    closeOpenCard(touchedCardId.current);
    touchedCardId.current = null;
  }

  const handleWillOpen = useCallback((id: string) => {
    closeOpenCard(id);
    openIdRef.current = id;
    setOpenId(id);
  }, [closeOpenCard]);

  const handleWillClose = useCallback((id: string) => {
    if (openIdRef.current !== id) return;
    openIdRef.current = null;
    setOpenId(null);
  }, []);

  async function handleAdd() {
    // An empty field has nothing to add; the button is disabled for it as well.
    if (!canAdd || saving.current) return;
    saving.current = true;
    const submitted = value;
    await addItem(submitted, () => setValue(current => current === submitted ? '' : current));
    saving.current = false;
  }

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditingValue('');
  }, []);

  const handleEdit = useCallback((id: string, text: string) => {
    if (touchDragActive.current || Date.now() < suppressRowActionsUntil.current) return;
    closeOpenCard(id);
    // Restore the full card before autoFocus can make Safari pan to the field.
    swipeableRefs.current.get(id)?.reset();
    openIdRef.current = null;
    setOpenId(null);
    setEditingId(id);
    setEditingValue(text);
  }, [closeOpenCard]);

  const handleDelete = useCallback((id: string) => {
    // Keep the release that confirmed deletion from landing on the
    // actions of the row that immediately moves into its place.
    suppressRowActionsUntil.current = Date.now() + 500;
    cancelEditing();
    swipeableRefs.current.get(id)?.close();
    openIdRef.current = null;
    setOpenId(null);
    requestAnimationFrame(() => removeItem(id));
  }, [cancelEditing, removeItem]);

  const handleToggle = useCallback((id: string) => {
    if (Date.now() >= suppressRowActionsUntil.current) toggleItem(id);
  }, [toggleItem]);

  const saveEditing = useCallback(async () => {
    if (!editingId || saving.current) return;
    saving.current = true;
    await updateItem(editingId, editingValue, cancelEditing);
    saving.current = false;
  }, [cancelEditing, editingId, editingValue, updateItem]);

  // Stable while a card is dragged, so only the lifted card re-renders: re-rendering
  // every card under a native drag makes their animated offsets flicker.
  const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<ShoppingItem>) => (
    <ShoppingCard
      item={item}
      drag={drag}
      isActive={isActive}
      open={openId === item.id}
      editing={editingId === item.id}
      editingValue={editingId === item.id ? editingValue : ''}
      anyEditing={editingId !== null}
      stackedDetail={stackedDetail}
      onTouch={markCardTouch}
      setRef={setCardRef}
      onWillOpen={handleWillOpen}
      onWillClose={handleWillClose}
      onToggle={handleToggle}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onEditingValue={setEditingValue}
      onSaveEditing={saveEditing}
      onCancelEditing={cancelEditing}
    />
  ), [
    cancelEditing, editingId, editingValue, handleDelete, handleEdit, handleToggle, handleWillClose,
    handleWillOpen, markCardTouch, openId, saveEditing, setCardRef, stackedDetail,
  ]);

  // The gap above the first card belongs to the header: every list cell then has the
  // same height, which the drag needs to move the other cards without jumps.
  const header = (
    <View style={styles.shoppingHeader}>
      <Text accessibilityRole="header" style={styles.settingsTitle}>{t('shoppingList')}</Text>
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
          disabled={!canAdd}
          style={({ pressed }) => [
            styles.addItemButton,
            !canAdd && styles.addItemButtonDisabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('addItem')}
          accessibilityState={{ disabled: !canAdd }}
        >
          <Ionicons name="add" size={26} color={canAdd ? colors.accentText : colors.muted} />
        </Pressable>
      </View>
      <Pressable
        onPress={() => router.push('/shopping-matches')}
        disabled={draggingId !== null}
        style={({ pressed }) => [styles.shoppingMatchesButton, pressed && styles.settingsRowPressed]}
        accessibilityRole="button"
        accessibilityLabel={t('whatCanCook')}
      >
        <View style={styles.settingsRowIcon}>
          <Ionicons name="restaurant-outline" size={20} color={colors.text} />
        </View>
        <Text style={styles.shoppingMatchesButtonText}>{t('whatCanCook')}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );

  return (
    <View
      style={styles.screen}
      onTouchStart={handleScreenTouch}
      // A mouse or pen on web; touches are handled above.
      onPointerDown={Platform.OS === 'web' ? (event) => { if (event.nativeEvent.pointerType !== 'touch') handleScreenTouch(); } : undefined}
    >
      <DraggableFlatList
        containerStyle={styles.shoppingList}
        style={styles.shoppingList}
        data={displayedItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragBegin={(index) => {
          touchDragActive.current = true;
          closeOpenCard();
          setDraggingId(displayedItems[index]?.id ?? null);
        }}
        onDragEnd={({ data }) => {
          touchDragActive.current = false;
          commitDroppedOrder(() => {
            if (HOLD_DROPPED_ORDER) setDroppedOrder(data);
            setDraggingId(null);
          });
          const saved = reorderItems(data.map((item) => item.id));
          if (HOLD_DROPPED_ORDER) void saved.finally(() => setDroppedOrder(null));
        }}
        onScrollBeginDrag={() => closeOpenCard()}
        autoscrollThreshold={72}
        autoscrollSpeed={110}
        // 10 px keeps taps and scrolling apart from a drag. On web, once the long press
        // has picked a card up, it follows from the first pixel instead of catching up
        // 10 px at once. Native keeps one value: changing it reconfigures the gesture
        // in the middle of the touch.
        activationDistance={Platform.OS === 'web' && draggingId ? 1 : 10}
        ListHeaderComponent={header}
        ListEmptyComponent={(
          <View style={[styles.homeEmpty, { marginTop: 0 }]}>
            <Ionicons name="basket-outline" size={28} color={colors.muted} />
            <Text style={styles.homeEmptyTitle}>{t('shoppingEmpty')}</Text>
            <Text style={styles.homeEmptyText}>{t('shoppingEmptyHint')}</Text>
          </View>
        )}
        ListFooterComponent={hasCompleted ? (
          <View style={styles.shoppingFooter}>
            {allCompleted && (
              <View style={styles.homeEmpty}>
                <Ionicons name="checkmark-done-outline" size={28} color={colors.muted} />
                <Text style={styles.homeEmptyTitle}>{t('shoppingAllDoneTitle')}</Text>
                <Text style={styles.homeEmptyText}>{t('shoppingAllDoneHint')}</Text>
              </View>
            )}
            <Pressable
              onPress={clearCompleted}
              disabled={draggingId !== null}
              style={({ pressed }) => [styles.shoppingClearButton, pressed && { backgroundColor: colors.cardPressed }]}
              accessibilityRole="button"
            >
              <Text style={styles.shoppingClearText}>{t('clearCompleted')}</Text>
            </Pressable>
          </View>
        ) : undefined}
        contentContainerStyle={{
          width: '100%',
          maxWidth: COLUMN_MAX_WIDTH,
          alignSelf: 'center',
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

type ShoppingCardProps = {
  item: ShoppingItem;
  drag: () => void;
  isActive: boolean;
  open: boolean;
  editing: boolean;
  editingValue: string;
  anyEditing: boolean;
  stackedDetail: boolean;
  onTouch: (id: string) => void;
  setRef: (id: string, swipeable: SwipeableMethods | null) => void;
  onWillOpen: (id: string) => void;
  onWillClose: (id: string) => void;
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onEditingValue: (value: string) => void;
  onSaveEditing: () => void;
  onCancelEditing: () => void;
};

// Memoized: a card re-renders only when its own props change. While a card is
// dragged its cells are not touchable, so nothing here depends on the drag state;
// the swipe gesture is never reconfigured in the middle of a touch.
const ShoppingCard = memo(function ShoppingCard(props: ShoppingCardProps) {
  const { item, isActive, open, editing, anyEditing, stackedDetail } = props;
  const { colors, t } = useSettings();
  const styles = useStyles();
  const swipeable = useRef<SwipeableMethods | null>(null);
  const offset = useSharedValue(0);
  // The card content keeps its place and narrows by the width the actions take.
  const contentStyle = useAnimatedStyle(() => ({ marginLeft: Math.max(0, -offset.get()) }));
  const { title, detail } = splitItemText(item);
  const touch = () => props.onTouch(item.id);
  const edit = () => props.onEdit(item.id, item.text);
  const remove = () => props.onDelete(item.id);

  return (
    <View testID="shopping-card" onTouchStart={touch} onPointerDown={Platform.OS === 'web' ? touch : undefined}>
      <ReanimatedSwipeable
        ref={(methods) => {
          swipeable.current = methods;
          props.setRef(item.id, methods);
        }}
        testID="shopping-swipeable"
        enabled={!anyEditing}
        friction={1.5}
        rightThreshold={36}
        // Gesture Handler 3 takes a signed offset: -18 matches the former 18 px edge offset.
        dragOffsetFromRight={-18}
        overshootRight={false}
        containerStyle={styles.shoppingSwipeRow}
        onSwipeableWillOpen={() => props.onWillOpen(item.id)}
        onSwipeableWillClose={() => props.onWillClose(item.id)}
        renderRightActions={(_progress, translation) => (
          <View
            style={styles.shoppingSwipeActions}
            testID="shopping-swipe-actions"
            // Closed actions sit under the card: hidden from screen readers, which use
            // the card's own actions instead. Keyboard focus on web opens the card.
            accessibilityElementsHidden={!open}
            importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
            onFocus={Platform.OS === 'web' ? () => swipeable.current?.openRight() : undefined}
          >
            <OffsetMirror from={translation} to={offset} />
            <GesturePressable
              onPress={edit}
              disabled={anyEditing}
              style={({ pressed }) => [styles.shoppingSwipeAction, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('edit')}
            >
              <View style={[styles.shoppingSwipeActionCircle, styles.shoppingSwipeEditCircle]}>
                <Ionicons name="pencil-outline" size={18} color={colors.text} />
              </View>
            </GesturePressable>
            <GesturePressable
              onPress={remove}
              disabled={anyEditing}
              style={({ pressed }) => [styles.shoppingSwipeAction, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('delete')}
            >
              <View style={[styles.shoppingSwipeActionCircle, styles.shoppingSwipeDeleteCircle]}>
                <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
              </View>
            </GesturePressable>
          </View>
        )}
      >
        <Animated.View style={contentStyle}>
          <View style={[styles.shoppingRow, isActive && styles.shoppingRowActiveContent]} testID="shopping-row">
            {editing ? (
              <View style={styles.shoppingEditRow}>
                <TextInput
                  autoFocus
                  value={props.editingValue}
                  onChangeText={props.onEditingValue}
                  onSubmitEditing={props.onSaveEditing}
                  placeholder={t('shoppingPlaceholder')}
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.text}
                  returnKeyType="done"
                  style={styles.shoppingEditInput}
                />
                <Pressable
                  onPress={props.onSaveEditing}
                  style={({ pressed }) => [styles.shoppingEditButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t('save')}
                >
                  <Ionicons name="checkmark" size={22} color={colors.text} />
                </Pressable>
                <Pressable
                  onPress={props.onCancelEditing}
                  style={({ pressed }) => [styles.shoppingEditButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t('cancel')}
                >
                  <Ionicons name="close" size={22} color={colors.muted} />
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={() => props.onToggle(item.id)}
                  style={({ pressed }) => [styles.shoppingCheckbox, pressed && styles.pressed]}
                  accessibilityRole="checkbox"
                  accessibilityLabel={item.text}
                  aria-checked={item.checked}
                  accessibilityState={{ checked: item.checked }}
                >
                  <Ionicons
                    name={item.checked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={item.checked ? colors.text : colors.muted}
                  />
                </Pressable>
                <Pressable
                  testID="shopping-drag"
                  // A second long press during a drag is ignored by the list itself.
                  onLongPress={props.drag}
                  delayLongPress={350}
                  disabled={anyEditing}
                  style={[styles.shoppingDragArea, stackedDetail && styles.shoppingDragAreaStacked]}
                  accessibilityRole="button"
                  accessibilityLabel={item.text}
                  accessibilityHint={t('shoppingItemGestureHint')}
                  // Edit and delete without the swipe gesture: VoiceOver, TalkBack, Switch Control.
                  accessibilityActions={[{ name: 'edit', label: t('edit') }, { name: 'delete', label: t('delete') }]}
                  onAccessibilityAction={(event) => {
                    if (event.nativeEvent.actionName === 'edit') edit();
                    if (event.nativeEvent.actionName === 'delete') remove();
                  }}
                >
                  <Text style={[styles.shoppingText, item.checked && styles.shoppingTextChecked]}>
                    {title}
                  </Text>
                  {detail !== '' && (
                    <Text
                      style={[
                        styles.shoppingDetail,
                        stackedDetail && styles.shoppingDetailStacked,
                        item.checked && styles.shoppingTextChecked,
                      ]}
                    >
                      {detail}
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </Animated.View>
      </ReanimatedSwipeable>
    </View>
  );
});

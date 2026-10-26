import { flushSync } from 'react-dom';

// On web DraggableFlatList does not hold the drag offsets over the reorder: the new
// order is committed by React while Reanimated still shows the old offsets until its
// next frame, so the dropped card flashes far from its place. Commit the order
// synchronously and drop the stale offsets of the cards until Reanimated has reset them.
const DROPPING_CLASS = 'shopping-dropping';

// The saved order arrives after an asynchronous write; until then show the dropped one.
export const HOLD_DROPPED_ORDER = true;

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `.${DROPPING_CLASS} div:has(> [data-testid="shopping-card"]) { transform: none !important; }`;
  document.head.appendChild(style);
}

export function commitDroppedOrder(apply: () => void) {
  const root = document.documentElement;
  flushSync(apply);
  root.classList.add(DROPPING_CLASS);
  // Reanimated applies the reset offsets on its next frames; keep the override until then.
  requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    root.classList.remove(DROPPING_CLASS);
  })));
}

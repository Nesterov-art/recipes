// Native DraggableFlatList holds each cell's last offset until its next layout, so the
// dropped order needs no holding on screen: the saved order arrives and lays the
// cards out where they already are. Extra renders around the drop would only fight it.
export const HOLD_DROPPED_ORDER = false;

export function commitDroppedOrder(apply: () => void) {
  apply();
}

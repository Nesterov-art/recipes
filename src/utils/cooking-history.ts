import type { RecipeMetaById } from '@/constants/recipes';

export type HistoryEntry = { id: string; recipeId: string; cookedAt: string; note?: string };
export type HistoryMonth = { key: string; year: number; month: number; entries: HistoryEntry[] };
// Rows of the virtualized history list. `first`/`last` round the card corners of a month.
export type HistoryRow =
  | { type: 'month'; key: string; year: number; month: number; count: number }
  | { type: 'entry'; key: string; entry: HistoryEntry; first: boolean; last: boolean };

function timeOf(cookedAt: string) {
  const time = new Date(cookedAt).getTime();
  return Number.isNaN(time) ? -Infinity : time;
}

// One list over the existing per-recipe cookings, newest first. Only a view:
// the stored entries, their ratings and notes stay as they are.
export function historyEntries(recipeMeta: RecipeMetaById, recipeId?: string): HistoryEntry[] {
  const timed: { entry: HistoryEntry; time: number }[] = [];
  for (const [id, meta] of Object.entries(recipeMeta)) {
    if (recipeId !== undefined && id !== recipeId) continue;
    for (const cooking of meta.cookings) {
      const entry = { id: cooking.id, recipeId: id, cookedAt: cooking.cookedAt, ...(cooking.note ? { note: cooking.note } : {}) };
      // Parsed once per entry, not on every comparison: a large history has tens of thousands.
      timed.push({ entry, time: timeOf(cooking.cookedAt) });
    }
  }
  return timed.sort((a, b) => b.time - a.time).map(item => item.entry);
}

// Groups by the local calendar month; entries with an unreadable date go last, under key ''.
export function groupHistoryByMonth(entries: HistoryEntry[]): HistoryMonth[] {
  const months: HistoryMonth[] = [];
  for (const entry of entries) {
    const date = new Date(entry.cookedAt);
    const valid = !Number.isNaN(date.getTime());
    const year = valid ? date.getFullYear() : 0;
    const month = valid ? date.getMonth() : 0;
    const key = valid ? `${year}-${String(month + 1).padStart(2, '0')}` : '';
    const last = months.at(-1);
    if (last && last.key === key) last.entries.push(entry);
    else months.push({ key, year, month, entries: [entry] });
  }
  return months;
}

export function historyRows(months: HistoryMonth[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const { key, year, month, entries } of months) {
    rows.push({ type: 'month', key, year, month, count: entries.length });
    entries.forEach((entry, index) => rows.push({
      // Cooking ids are unique per recipe only.
      type: 'entry', key: `${entry.recipeId}/${entry.id}`, entry, first: index === 0, last: index === entries.length - 1,
    }));
  }
  return rows;
}

import type { RecipeMetaById } from '@/constants/recipes';

export type HistoryEntry = { id: string; recipeId: string; cookedAt: string; note?: string };
export type HistoryMonth = { key: string; year: number; month: number; entries: HistoryEntry[] };

function timeOf(entry: HistoryEntry) {
  const time = new Date(entry.cookedAt).getTime();
  return Number.isNaN(time) ? -Infinity : time;
}

// One list over the existing per-recipe cookings, newest first. Only a view:
// the stored entries, their ratings and notes stay as they are.
export function historyEntries(recipeMeta: RecipeMetaById, recipeId?: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const [id, meta] of Object.entries(recipeMeta)) {
    if (recipeId !== undefined && id !== recipeId) continue;
    for (const cooking of meta.cookings) {
      entries.push({ id: cooking.id, recipeId: id, cookedAt: cooking.cookedAt, ...(cooking.note ? { note: cooking.note } : {}) });
    }
  }
  return entries.sort((a, b) => timeOf(b) - timeOf(a));
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

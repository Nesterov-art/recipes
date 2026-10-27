import type { Recipe, RecipeMetaById } from '../constants/recipes.ts';
import type { Profile } from './profile-backup.ts';
import { decodeRaw, PROFILE_KEYS, type RawProfile } from './profile-transaction.ts';
import type { ReadEntry, StorageAdapter } from './safe-storage.ts';
import { journalSettled, PROFILE_JOURNAL_KEY, PROFILE_JOURNAL_V2_KEY } from './storage-coordination.ts';
import { bookConfig } from './storage-models.ts';

// Reads what can be read for a blocked profile, writes nothing. A normal backup is offered
// only for a profile whose every key is readable and valid with no unfinished restore.
export type EmergencyCapture = {
  capturedAt: string; entries: Record<string, ReadEntry>; errors: Record<string, string>;
  settled: boolean; profile?: Profile; book?: { recipes: Recipe[]; recipeMeta: RecipeMetaById };
};
export async function captureEmergency(storage: StorageAdapter, keys: readonly string[]): Promise<EmergencyCapture> {
  const entries: Record<string, ReadEntry> = {};
  const errors: Record<string, string> = {};
  for (const key of [...keys, PROFILE_JOURNAL_KEY, PROFILE_JOURNAL_V2_KEY]) {
    try { entries[key] = { raw: await storage.getItem(key) }; } catch (error) {
      entries[key] = { raw: null, error: true };
      errors[key] = error instanceof Error ? error.message : String(error);
    }
  }
  const settled = !entries[PROFILE_JOURNAL_KEY].error && journalSettled(entries[PROFILE_JOURNAL_KEY].raw, 1)
    && !entries[PROFILE_JOURNAL_V2_KEY].error && journalSettled(entries[PROFILE_JOURNAL_V2_KEY].raw, 2);
  const book = bookConfig().decode(Object.fromEntries(PROFILE_KEYS.map(key => [key, entries[key] ?? { raw: null }])));
  let profile: Profile | undefined;
  if (settled && keys.every(key => !entries[key].error)) {
    try { profile = decodeRaw(Object.fromEntries(PROFILE_KEYS.map(key => [key, entries[key]?.raw ?? null])) as RawProfile); } catch { /* Diagnostic only. */ }
  }
  return {
    capturedAt: new Date().toISOString(), entries, errors, settled, profile,
    // A single key is consistent by itself, even when the journal state is unknown.
    ...(book.data && !book.issue && !entries['recipe-book-v1'].error ? { book: book.data } : {}),
  };
}
export const emergencyComplete = (capture: EmergencyCapture) => !!capture.profile && !Object.keys(capture.errors).length;
export function emergencyDiagnostic(capture: EmergencyCapture, store?: string) {
  return JSON.stringify({
    format: 'monorec-emergency-diagnostic', version: 1, capturedAt: capture.capturedAt,
    complete: emergencyComplete(capture),
    notice: 'Diagnostic file, not a profile backup. It cannot be loaded with Restore profile.',
    unreadable: Object.keys(capture.errors), errors: capture.errors, journalsSettled: capture.settled,
    entries: capture.entries, ...(store ? { store } : {}),
  });
}

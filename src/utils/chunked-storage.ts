import { StorageSpaceError, type StorageAdapter } from './safe-storage.ts';
import { utf8Length } from './utf8.ts';

// Native-only layout (stage 7.2). Android reads one SQLite row through a ~2 MiB CursorWindow,
// so a logical value is stored as small parts plus a manifest. The manifest write is the
// only commit point: parts of a new generation are written and verified before it, and
// parts of the previous generation stay untouched until after it.
export type RawStorage = StorageAdapter & {
  removeItem: (key: string) => Promise<void>;
  getAllKeys: () => Promise<readonly string[]>;
};
type Part = { length: number; sum: string };
export type Generation = { id: string; length: number; sum: string; inline?: string; parts?: Part[] };
export type Manifest = { format: 'monorec-value'; version: 2; current: Generation | null; prev: Generation | null };
export type Staged = { key: string; expected: string | null; raw: string; written: string[] };
export type Pins = Set<string> | 'all';

export const PART_BYTES = 256 * 1024;
const INLINE_BYTES = 32 * 1024;
// Room checks (Android): a save briefly holds the previous, current and new value of its key.
// A growing save may reach 90% of the database limit, a shrinking one 97% (SQLite adds about
// 1% of pages and index). Below 70% the stored total is not re-read; above 75% a warning is due.
// Values up to ROOM_RESERVE are not checked: they always fit beside it.
export type Room = { budget: number; onLow?: () => void };
const ROOM_RESERVE = 64 * 1024;
const GROW_SHARE = 0.9, SHRINK_SHARE = 0.97, QUICK_SHARE = 0.7, LOW_SHARE = 0.75;
const PREFIX = 'mr2:';
// Written over a legacy key once its value is served from a manifest: old code then reads
// an unsupported value instead of stale data, and new code never mistakes it for data.
export const LEGACY_FENCE = 'monorec-storage-v2';
export const isFence = (raw: string | null) => raw !== null && raw.startsWith(LEGACY_FENCE);
export const manifestKey = (key: string) => `${PREFIX}${key}`;
const partKey = (key: string, id: string, index: number) => `${PREFIX}${key}#${id}.${index}`;
const PART = /^([a-z0-9]+)\.(\d+)$/;

export class StorageIntegrityError extends Error {}

export function checksum(text: string) {
  // cyrb53: detects damaged or mixed parts; not a security measure.
  let h1 = 0xdeadbeef ^ text.length, h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
export function splitUtf8(text: string, limit = PART_BYTES) {
  const parts: string[] = [];
  let start = 0, bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const pair = c >= 0xd800 && c <= 0xdbff && i + 1 < text.length;
    const size = c < 0x80 ? 1 : c < 0x800 ? 2 : pair ? 4 : 3;
    if (bytes + size > limit) { parts.push(text.slice(start, i)); start = i; bytes = 0; }
    bytes += size;
    if (pair) i++;
  }
  parts.push(text.slice(start));
  return parts;
}
function validGeneration(value: unknown): value is Generation {
  const gen = value as Generation;
  return !!gen && typeof gen.id === 'string' && /^[a-z0-9]+$/.test(gen.id) && Number.isInteger(gen.length)
    && typeof gen.sum === 'string' && (typeof gen.inline === 'string') !== Array.isArray(gen.parts)
    && (!gen.parts || gen.parts.every(part => Number.isInteger(part?.length) && typeof part.sum === 'string'));
}
export function parseManifest(raw: string): Manifest {
  let value: Manifest;
  try { value = JSON.parse(raw); } catch { throw new StorageIntegrityError('Unreadable manifest'); }
  if (value?.format !== 'monorec-value' || value.version !== 2
    || !(value.current === null || validGeneration(value.current)) || !(value.prev === null || validGeneration(value.prev))) {
    throw new StorageIntegrityError('Unsupported manifest');
  }
  return value;
}
export function manifestIds(raw: string | null) {
  if (raw === null) return [];
  const manifest = parseManifest(raw);
  return [manifest.current?.id, manifest.prev?.id].filter((id): id is string => !!id);
}

export class ChunkedStorage {
  private queues = new Map<string, Promise<unknown>>();
  readonly raw: RawStorage;
  private pins: () => Promise<Pins>;
  private room?: Room;
  // Upper bound of the stored bytes: an exact count plus what this instance wrote since.
  // Removals are not subtracted; anything else that writes makes it unknown again.
  private known?: number;
  constructor(raw: RawStorage, pins: () => Promise<Pins> = async () => new Set(), room?: Room) {
    this.raw = raw;
    this.pins = pins;
    this.room = room;
  }
  private serial<T>(key: string, task: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(key) ?? Promise.resolve()).catch(() => {}).then(task);
    this.queues.set(key, run);
    return run;
  }
  async readManifest(key: string) {
    const raw = await this.raw.getItem(manifestKey(key));
    return raw === null ? null : parseManifest(raw);
  }
  getItem = (key: string) => this.serial(key, () => this.read(key));
  setItem = (key: string, value: string) => this.serial(key, async () => {
    try {
      const bytes = await this.checkRoom(key, value);
      await this.commit(await this.write(key, value));
      if (this.known !== undefined) this.known += bytes + Math.ceil(bytes / PART_BYTES) * 64 + 2048;
    } catch (error) {
      if (!(error instanceof StorageSpaceError)) this.known = undefined;
      throw error;
    }
  });
  removeItem = (key: string) => this.serial(key, async () => { await this.commit(await this.write(key, null)); });
  // Transactions stage several keys, record them in a journal, then switch the manifests.
  // Their writes are not counted, so the stored total is read again afterwards.
  stage = (key: string, value: string | null) => this.serial(key, () => { this.known = undefined; return this.write(key, value); });
  switch = (staged: Staged) => this.serial(staged.key, () => this.commit(staged));
  discard = (staged: Staged) => this.serial(staged.key, () => this.remove(staged.written));
  // Sets a manifest back to an exact earlier raw value (null: back to the legacy key).
  restoreManifest = (key: string, raw: string | null, allowed: (string | null)[]) => this.serial(key, async () => {
    this.known = undefined;
    const current = await this.raw.getItem(manifestKey(key));
    if (current === raw) return;
    if (!allowed.includes(current)) throw new StorageIntegrityError('Unexpected manifest');
    if (raw === null) await this.raw.removeItem(manifestKey(key));
    else await this.raw.setItem(manifestKey(key), raw);
    if (await this.raw.getItem(manifestKey(key)) !== raw) throw new StorageIntegrityError('Manifest verification');
  });
  collect = (key: string) => this.serial(key, () => this.sweep(key));
  async collectAll() {
    const keys = new Set((await this.raw.getAllKeys()).filter(key => key.startsWith(PREFIX) && key.includes('#'))
      .map(key => key.slice(PREFIX.length, key.lastIndexOf('#'))));
    for (const key of keys) {
      try { await this.collect(key); } catch { /* An unreadable manifest keeps every part of its key. */ }
    }
  }
  // Sum of stored bytes of the rows `include` selects; an unreadable row counts as the
  // largest readable one could be.
  async usage(include: (key: string) => boolean = () => true) {
    let total = 0;
    for (const key of await this.raw.getAllKeys()) {
      if (!include(key)) continue;
      try { total += utf8Length(key) + utf8Length(await this.raw.getItem(key) ?? ''); } catch { total += 2 * 1024 * 1024; }
    }
    return total;
  }
  // Refuses a save that would not fit before any part is written; returns its size.
  private async checkRoom(key: string, value: string) {
    const bytes = utf8Length(value);
    if (!this.room || bytes <= ROOM_RESERVE) return bytes;
    const { budget, onLow } = this.room;
    if (this.known !== undefined && this.known + bytes + ROOM_RESERVE <= budget * QUICK_SHARE) return bytes;
    this.known = await this.usage();
    const peak = this.known + bytes + ROOM_RESERVE;
    const current = (await this.readManifest(key))?.current;
    const share = current && value.length <= current.length ? SHRINK_SHARE : GROW_SHARE;
    if (peak > budget * share) throw new StorageSpaceError(`No room to save ${key}`);
    if (peak > budget * LOW_SHARE) onLow?.();
    return bytes;
  }
  private async read(key: string) {
    const manifest = await this.readManifest(key);
    if (!manifest) {
      const legacy = await this.raw.getItem(key);
      if (isFence(legacy)) throw new StorageIntegrityError(`Manifest of ${key} is missing`);
      return legacy;
    }
    return manifest.current ? this.assemble(key, manifest.current) : null;
  }
  async assemble(key: string, gen: Generation) {
    let text = gen.inline;
    if (text === undefined) {
      const parts: string[] = [];
      for (const [index, part] of gen.parts!.entries()) {
        const raw = await this.raw.getItem(partKey(key, gen.id, index));
        if (raw === null || raw.length !== part.length || checksum(raw) !== part.sum) throw new StorageIntegrityError(`Damaged part ${index} of ${key}`);
        parts.push(raw);
      }
      text = parts.join('');
    }
    if (text.length !== gen.length || checksum(text) !== gen.sum) throw new StorageIntegrityError(`Damaged value of ${key}`);
    return text;
  }
  private async write(key: string, value: string | null): Promise<Staged> {
    const expected = await this.raw.getItem(manifestKey(key));
    const previous = expected === null ? null : parseManifest(expected);
    const written: string[] = [];
    let current: Generation | null = null;
    if (value !== null) {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      current = { id, length: value.length, sum: checksum(value) };
      if (utf8Length(value) <= INLINE_BYTES) current.inline = value;
      else {
        const parts = splitUtf8(value);
        current.parts = parts.map(part => ({ length: part.length, sum: checksum(part) }));
        try {
          for (const [index, part] of parts.entries()) {
            written.push(partKey(key, id, index));
            await this.raw.setItem(partKey(key, id, index), part);
          }
          for (const [index, part] of parts.entries()) {
            if (await this.raw.getItem(partKey(key, id, index)) !== part) throw new StorageIntegrityError('Part verification');
          }
        } catch (error) {
          await this.remove(written);
          throw error;
        }
      }
    }
    const manifest: Manifest = { format: 'monorec-value', version: 2, current, prev: previous?.current ?? null };
    return { key, expected, raw: JSON.stringify(manifest), written };
  }
  private async commit(staged: Staged) {
    try {
      if (await this.raw.getItem(manifestKey(staged.key)) !== staged.expected) throw new StorageIntegrityError('Manifest changed');
      await this.raw.setItem(manifestKey(staged.key), staged.raw); // Commit point.
    } catch (error) {
      // A write that reports an error may still have landed; only the stored manifest decides.
      const stored = await this.raw.getItem(manifestKey(staged.key)).catch(() => undefined);
      if (stored !== staged.raw) {
        if (stored !== undefined) await this.remove(staged.written);
        throw error;
      }
    }
    if (await this.raw.getItem(manifestKey(staged.key)) !== staged.raw) throw new StorageIntegrityError('Manifest verification');
    await this.sweep(staged.key).catch(() => {}); // Leftovers are collected on a later start.
  }
  private async remove(keys: string[]) {
    for (const key of keys) await this.raw.removeItem(key).catch(() => {});
  }
  // Removes only parts of this key that no manifest or unfinished journal references.
  private async sweep(key: string) {
    const pins = await this.pins();
    if (pins === 'all') return;
    const keep = new Set([...manifestIds(await this.raw.getItem(manifestKey(key))), ...pins]);
    const prefix = `${PREFIX}${key}#`;
    for (const stored of await this.raw.getAllKeys()) {
      if (!stored.startsWith(prefix)) continue;
      const match = PART.exec(stored.slice(prefix.length));
      if (match && !keep.has(match[1])) await this.raw.removeItem(stored);
    }
  }
}

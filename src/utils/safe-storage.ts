import { assertProfileReady, ProfileRecoveryRequired, withProfileLock } from './storage-coordination.ts';

// No React/native dependencies: the production persistence path is unit-testable.
export type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};
export type ReadEntry = { raw: string | null; error?: boolean };
export type StorageIssue = 'read' | 'invalid' | 'unsupported' | 'write' | 'conflict' | 'recovery' | 'mirror' | 'profile';
export type LoadResult<T> = {
  data?: T;
  issue?: StorageIssue;
  recovery?: T;
};
type Snapshot<T> = {
  data: T; loaded: boolean; initialized: boolean; saving: boolean; issue?: StorageIssue; canRecover: boolean;
};
export type StoreConfig<T> = {
  key: string; keys: string[]; empty: T;
  decode: (entries: Record<string, ReadEntry>) => LoadResult<T>;
  encode: (data: T) => Record<string, string>;
};

const queues = new Map<string, Promise<unknown>>();
function exclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    // Current web tabs cooperate. CAS below also detects changes from older clients.
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request(`recipes-storage:${key}`, task);
    }
    return task();
  });
  queues.set(key, run);
  return run;
}

export class SafeStore<T> {
  private state: Snapshot<T>;
  private listeners = new Set<() => void>();
  private entries: Record<string, ReadEntry> = {};
  private recovery?: T;
  private pending?: { data: T; after?: () => void; checkSources: boolean };
  private mirrors: Record<string, string> = {};
  private tail: Promise<unknown> = Promise.resolve();
  constructor(privateStorage: StorageAdapter, config: StoreConfig<T>) {
    this.storage = privateStorage;
    this.config = config;
    this.state = { data: config.empty, loaded: false, initialized: false, saving: false, canRecover: false };
  }
  private storage: StorageAdapter;
  private config: StoreConfig<T>;
  getSnapshot = () => this.state;
  whenIdle = () => this.tail;
  healthy = () => this.state.initialized && !this.state.issue && !this.pending;
  exportRecovery = () => JSON.stringify({
    format: 'recipes-storage-recovery', version: 1, capturedAt: new Date().toISOString(),
    entries: this.entries,
    ...(this.pending ? { pending: this.config.encode(this.pending.data) } : {}),
  });
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<Snapshot<T>>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private enqueue<R extends boolean | void>(task: () => Promise<R>): Promise<R | false> {
    const next = this.tail.catch(() => {}).then(() => withProfileLock(async () => {
      await assertProfileReady(this.storage);
      return exclusive(this.config.key, task);
    })).catch(error => {
      this.publish({ issue: error instanceof ProfileRecoveryRequired ? 'profile' : 'read', saving: false });
      return false as const;
    });
    this.tail = next;
    return next;
  }
  load = () => this.enqueue(async () => {
    // Never discard an unsaved operation merely because Retry was clicked.
    if (this.pending) return;
    this.mirrors = {};
    this.publish({ saving: true });
    const pairs = await Promise.all(this.config.keys.map(async key => {
      try { return [key, { raw: await this.storage.getItem(key) }] as const; }
      catch { return [key, { raw: null, error: true }] as const; }
    }));
    this.entries = Object.fromEntries(pairs);
    const result = this.config.decode(this.entries);
    this.recovery = result.recovery;
    this.publish({
      ...(result.data !== undefined ? { data: result.data } : {}),
      loaded: result.data !== undefined, saving: false,
      issue: result.issue, canRecover: result.recovery !== undefined,
    });
    // Only a successful validated read can initialize/migrate data or mirrors.
    if (result.data !== undefined && !result.issue) await this.commit(result.data);
  });
  update = (updater: (data: T) => T, after?: () => void): Promise<boolean> => this.enqueue(async () => {
    if (!this.state.loaded || this.pending || this.state.issue === 'conflict') return false;
    return this.commit(updater(this.state.data), after);
  });
  private async commit(data: T, after?: () => void, checkSources = false): Promise<boolean> {
    const encoded = this.config.encode(data);
    const key = this.config.key;
    const expected = this.entries[key];
    this.publish({ saving: true });
    try {
      const sources = checkSources || expected?.raw === null ? Object.entries(this.entries) : [[key, expected] as const];
      for (const [source, original] of sources) {
        if (!original || original.error || await this.storage.getItem(source) !== original.raw) {
          this.pending = { data, after, checkSources };
          this.publish({ issue: 'conflict', saving: false });
          return false;
        }
      }
      if (encoded[key] !== expected.raw) await this.storage.setItem(key, encoded[key]);
      this.entries[key] = { raw: encoded[key] };
    } catch {
      this.pending = { data, after, checkSources };
      this.publish({ issue: 'write', saving: false });
      return false;
    }
    // Authoritative commit succeeded. A mirror failure must never reapply an add.
    this.pending = undefined;
    this.publish({ data, loaded: true, issue: undefined });
    for (const [mirror, raw] of Object.entries(encoded)) {
      if (mirror === key) continue;
      const previous = this.entries[mirror];
      // Unreadable/invalid mirrors are deliberately excluded by the decoder.
      if (!previous || previous.error) continue;
      try {
        if (await this.storage.getItem(mirror) !== previous.raw) throw new Error('mirror conflict');
        if (raw !== previous.raw) await this.storage.setItem(mirror, raw);
        this.entries[mirror] = { raw };
        delete this.mirrors[mirror];
      } catch { this.mirrors[mirror] = raw; }
    }
    this.publish({ saving: false, initialized: true, issue: Object.keys(this.mirrors).length ? 'mirror' : undefined });
    after?.();
    return true;
  }
  retry = () => this.enqueue(async () => {
    if (this.pending) return this.commit(this.pending.data, this.pending.after, this.pending.checkSources);
    if (this.state.issue === 'mirror') return this.commit(this.state.data);
    return false;
  });
  private async archive(value: unknown) {
    const key = `storage-recovery-v1:${this.config.key}:${Date.now()}:${Math.random()}`;
    const raw = JSON.stringify(value);
    await this.storage.setItem(key, raw);
    if (await this.storage.getItem(key) !== raw) throw new Error('archive verification');
  }
  reread = async () => {
    const allowed = await this.enqueue(async () => {
      if (!this.pending) return true;
      if (this.state.issue !== 'conflict') return false;
      // A conflicting draft must not replace newer data or disappear on reread.
      try {
        await this.archive({ pending: this.config.encode(this.pending.data), sources: this.entries });
        this.pending = undefined;
        return true;
      } catch { this.publish({ issue: 'write' }); return false; }
    });
    if (allowed) await this.load();
  };
  recover = () => this.enqueue(async () => {
    if (this.recovery === undefined) return false;
    try {
      // Preserve every original byte before replacing a damaged canonical snapshot.
      for (const [key, entry] of Object.entries(this.entries)) {
        if (entry.error || await this.storage.getItem(key) !== entry.raw) {
          this.publish({ issue: 'conflict' }); return false;
        }
      }
      await this.archive(this.entries);
      const data = this.recovery;
      if (await this.commit(data, undefined, true)) { this.recovery = undefined; this.publish({ canRecover: false }); return true; }
    } catch { this.publish({ issue: 'recovery' }); }
    return false;
  });
}

export function parseEntry(entry: ReadEntry): unknown {
  if (entry.error) throw new Error('read');
  return entry.raw === null ? undefined : JSON.parse(entry.raw);
}
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function supported(value: unknown) {
  return !record(value) || ((!('version' in value) || value.version === 1)
    && (!('schemaVersion' in value) || value.schemaVersion === 1));
}

import { supabase, isSupabaseConfigured } from "./supabase";
import type { CollectionName } from "./collections";

/**
 * Document-oriented data access layer, the TypeScript counterpart of the .NET
 * `IDataService`. A "collection" is a Supabase table of (id, data jsonb); a
 * "document" is one row's jsonb payload with its `id` merged in.
 *
 * Every write updates a session cache immediately and pushes to Supabase
 * best-effort, so the UI stays responsive and works offline / in demo mode.
 */

type Doc = { id: string } & Record<string, unknown>;

/**
 * Whether reads/writes should stay local. Driven purely by the browser's
 * connectivity: when offline we serve from the cache and queue writes rather
 * than hitting (and hanging on) Supabase; when back online we load live data
 * and flush the queue automatically.
 */
export function isEffectivelyOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

const mem = new Map<string, { value: unknown; expires: number }>();
const TTL = 5 * 60 * 1000;
const CACHE_PREFIX = "data_cache:";

function memGet<T>(key: string, opts: { ignoreExpiry?: boolean } = {}): T | undefined {
  let e = mem.get(key);
  if (!e) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (raw) {
        e = JSON.parse(raw) as { value: unknown; expires: number };
        mem.set(key, e);
      }
    } catch {
      // corrupt/unavailable localStorage entry — treat as a cache miss
    }
  }
  if (!e) return undefined;
  if (opts.ignoreExpiry || Date.now() < e.expires) return e.value as T;
  mem.delete(key);
  localStorage.removeItem(CACHE_PREFIX + key);
  return undefined;
}
function memSet(key: string, value: unknown) {
  const entry = { value, expires: Date.now() + TTL };
  mem.set(key, entry);
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // storage full/unavailable — the in-memory cache still works for this session
  }
}

const warned = new Set<string>();
function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

/** Merge the row's primary key into its jsonb payload. */
function hydrate<T extends Doc>(row: { id: string; data: unknown }): T {
  const data = (row.data ?? {}) as Record<string, unknown>;
  return { ...data, id: row.id } as T;
}

export async function getCollection<T extends Doc>(
  collection: CollectionName,
  opts: { cache?: boolean } = {}
): Promise<T[]> {
  const key = `col:${collection}`;
  const offline = isEffectivelyOffline();
  if (opts.cache !== false || offline) {
    const cached = memGet<T[]>(key, { ignoreExpiry: offline });
    if (cached) return cached;
  }
  if (!isSupabaseConfigured || offline) return [];

  const { data, error } = await supabase
    .from(collection)
    .select("id,data,updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    // A not-yet-created table is an expected "feature not set up" state, not an
    // error — return empty quietly (warn once) instead of spamming the console.
    if (error.code === "PGRST205" || /find the table/i.test(error.message)) {
      warnOnce(collection, `[data] table "${collection}" not found — treating as empty.`);
      return [];
    }
    console.error(`[data] getCollection(${collection}) failed:`, error.message);
    return memGet<T[]>(key) ?? [];
  }
  const rows = (data ?? []).map((r) => hydrate<T>(r as { id: string; data: unknown }));
  memSet(key, rows);
  return rows;
}

export async function getDocument<T extends Doc>(
  collection: CollectionName,
  id: string
): Promise<T | null> {
  if (!isSupabaseConfigured || isEffectivelyOffline()) {
    const cached = memGet<T[]>(`col:${collection}`, { ignoreExpiry: true });
    return cached?.find((d) => d.id === id) ?? null;
  }
  const { data, error } = await supabase
    .from(collection)
    .select("id,data,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // Fall back to the cached collection so a dropped connection still resolves.
    console.error(`[data] getDocument(${collection}/${id}) failed:`, error.message);
    const cached = memGet<T[]>(`col:${collection}`, { ignoreExpiry: true });
    return cached?.find((d) => d.id === id) ?? null;
  }
  return data ? hydrate<T>(data as { id: string; data: unknown }) : null;
}

export async function upsertDocument<T extends Doc>(
  collection: CollectionName,
  doc: T
): Promise<T> {
  const id = doc.id || crypto.randomUUID();
  const record = { ...doc, id };
  const { id: _omit, ...payload } = record;
  void _omit;

  // Optimistically reflect the write in the cache, then either push now or queue.
  const key = `col:${collection}`;
  const cached = memGet<T[]>(key, { ignoreExpiry: true }) ?? [];
  memSet(key, [record, ...cached.filter((d) => d.id !== id)]);

  if (isEffectivelyOffline() || !isSupabaseConfigured) {
    if (isSupabaseConfigured) enqueueWrite({ type: "upsert", collection, doc: record, queuedAt: Date.now() });
    return record;
  }

  const { error } = await supabase
    .from(collection)
    .upsert({ id, data: payload, updated_at: new Date().toISOString() });
  if (error) {
    // Push failed (e.g. connection dropped mid-request) — queue it for later sync.
    console.error(`[data] upsert(${collection}/${id}) failed, queuing:`, error.message);
    enqueueWrite({ type: "upsert", collection, doc: record, queuedAt: Date.now() });
  }
  return record;
}

export async function deleteDocument(
  collection: CollectionName,
  id: string
): Promise<void> {
  // Optimistically drop it from the cache, then either push now or queue.
  const key = `col:${collection}`;
  const cached = memGet<Doc[]>(key, { ignoreExpiry: true });
  if (cached) memSet(key, cached.filter((d) => d.id !== id));

  if (!isSupabaseConfigured) return;
  if (isEffectivelyOffline()) {
    enqueueWrite({ type: "delete", collection, id, queuedAt: Date.now() });
    return;
  }

  const { error } = await supabase.from(collection).delete().eq("id", id);
  if (error) {
    // Delete failed (e.g. connection dropped mid-request) — queue it for later sync.
    console.error(`[data] delete(${collection}/${id}) failed, queuing:`, error.message);
    enqueueWrite({ type: "delete", collection, id, queuedAt: Date.now() });
  }
}

/*
 * Offline write queue — writes made while offline are recorded here (persisted
 * to localStorage so they survive a reload) and replayed against Supabase
 * once offline mode is switched off.
 */

type QueueOp =
  | { type: "upsert"; collection: CollectionName; doc: Doc; queuedAt: number }
  | { type: "delete"; collection: CollectionName; id: string; queuedAt: number };

const QUEUE_KEY = "offline_write_queue";

function opId(op: QueueOp): string {
  return op.type === "upsert" ? op.doc.id : op.id;
}

function loadQueue(): QueueOp[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueueOp[];
  } catch {
    return [];
  }
}
function saveQueue(queue: QueueOp[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // storage full/unavailable — the queued write still applied to the local cache
  }
}

/** Replace any earlier queued op for the same document with the latest one. */
function enqueueWrite(op: QueueOp) {
  const queue = loadQueue().filter((o) => !(o.collection === op.collection && opId(o) === opId(op)));
  queue.push(op);
  saveQueue(queue);
}

/** Number of writes made offline that are still waiting to reach Supabase. */
export function pendingSyncCount(): number {
  return loadQueue().length;
}

/**
 * Replay queued offline writes against Supabase in order. Ops that fail
 * (e.g. still no connection) stay queued for the next sync attempt.
 */
export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  const queue = loadQueue();
  if (queue.length === 0 || !isSupabaseConfigured) return { synced: 0, failed: 0 };

  const remaining: QueueOp[] = [];
  let synced = 0;

  for (const op of queue) {
    try {
      if (op.type === "upsert") {
        const { id, ...payload } = op.doc;
        const { error } = await supabase
          .from(op.collection)
          .upsert({ id, data: payload, updated_at: new Date().toISOString() });
        if (error) throw error;
      } else {
        const { error } = await supabase.from(op.collection).delete().eq("id", op.id);
        if (error) throw error;
      }
      synced++;
      mem.delete(`col:${op.collection}`);
      localStorage.removeItem(CACHE_PREFIX + `col:${op.collection}`);
    } catch (e) {
      console.error(`[data] sync failed for ${op.type} ${op.collection}/${opId(op)}:`, e);
      remaining.push(op);
    }
  }

  saveQueue(remaining);
  return { synced, failed: remaining.length };
}

/*
 * Auto-sync — when the browser regains connectivity, replay the queue without
 * waiting for the user to toggle Offline mode off. Subscribers (e.g. the app
 * shell) are notified so they can refresh their queries and surface a toast.
 */

export type SyncResult = { synced: number; failed: number };

const syncListeners = new Set<(result: SyncResult) => void>();

/** Subscribe to auto-sync completions; returns an unsubscribe function. */
export function onOfflineSync(listener: (result: SyncResult) => void): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

let syncing = false;

/** Sync the queue (guarding against overlap) and notify subscribers if anything changed. */
async function autoSync() {
  if (syncing || isEffectivelyOffline() || pendingSyncCount() === 0) return;
  syncing = true;
  try {
    const result = await syncOfflineQueue();
    if (result.synced > 0 || result.failed > 0) {
      syncListeners.forEach((l) => l(result));
    }
  } finally {
    syncing = false;
  }
}

/*
 * Connectivity notifications — subscribers are told when the browser loses or
 * regains its network connection so the UI can surface a toast and reflect the
 * live status (e.g. the Settings connection card).
 */

const connectivityListeners = new Set<(online: boolean) => void>();

/** Subscribe to online/offline transitions; returns an unsubscribe function. */
export function onConnectivityChange(listener: (online: boolean) => void): () => void {
  connectivityListeners.add(listener);
  return () => connectivityListeners.delete(listener);
}

let initialized = false;

/**
 * Register connectivity listeners: notify subscribers on online/offline
 * transitions and flush the write queue automatically on reconnect. Idempotent.
 */
export function initOfflineAutoSync() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("online", () => {
    connectivityListeners.forEach((l) => l(true));
    void autoSync();
  });
  window.addEventListener("offline", () => {
    connectivityListeners.forEach((l) => l(false));
  });
  // Catch anything already queued from a previous session where we're online now.
  if (navigator.onLine) void autoSync();
}

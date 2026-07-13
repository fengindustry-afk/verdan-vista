import { supabase, isSupabaseConfigured } from "./supabase";
import { Collections, type CollectionName } from "./collections";

/**
 * Document-oriented data access layer, the TypeScript counterpart of the .NET
 * `IDataService`. A "collection" is a Supabase table of (id, data jsonb); a
 * "document" is one row's jsonb payload with its `id` merged in.
 *
 * Every write updates a session cache immediately and pushes to Supabase
 * best-effort, so the UI stays responsive and works offline / in demo mode.
 */

type Doc = { id: string };

/**
 * Thrown when a write is rejected by the backend's row-level security / auth —
 * i.e. the current session isn't allowed to write (e.g. demo/anon session, or a
 * Viewer). Unlike a dropped connection this is NOT retryable, so such writes are
 * never queued; callers that opt in (`throwOnUnauthorized`) get this to surface
 * an honest "not saved" message instead of a false success.
 */
export class WriteNotAuthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteNotAuthorizedError";
  }
}

// Postgres 42501 = insufficient_privilege (RLS); PGRST301 = PostgREST JWT/auth.
const AUTH_ERROR = /42501|PGRST301|row-level security|permission denied|not authoriz|\bJWT\b|forbidden/i;
function isAuthError(error: { code?: string; message?: string }): boolean {
  return AUTH_ERROR.test(error.code ?? "") || AUTH_ERROR.test(error.message ?? "");
}

/**
 * Whether reads/writes should stay local. Driven by connectivity: the browser's
 * own `navigator.onLine` flag plus a heartbeat that catches "connected but the
 * backend is unreachable" (dead link). When offline we serve from the cache and
 * queue writes rather than hitting (and hanging on) Supabase; when back online we
 * load live data and flush the queue automatically.
 */
export function isEffectivelyOffline(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return backendReachable === false;
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

/**
 * Drop all cached collection data. Called on logout so a shared browser doesn't
 * serve the previous user's cached rows to the next session (reads now fall back
 * to cache when there's no authenticated session, so stale data must be cleared).
 */
export function clearDataCache() {
  for (const k of [...mem.keys()]) {
    if (k.startsWith("col:")) mem.delete(k);
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    // localStorage unavailable — the in-memory cache was already cleared above
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

  // Ensure the persisted auth session is fully restored before issuing the read.
  // supabase-js loads (and, if the access token expired, refreshes) the session
  // asynchronously on reload. A read that races ahead of that — or hits an
  // intermittently failed token refresh, or a cross-tab auth-lock timeout — is
  // sent with only the anon key. RLS requires an authenticated JWT to read, so
  // it answers with *zero rows* (a successful, non-error empty response). Caching
  // that anon-empty would blank the UI until the cache expired, even though the
  // user is a valid admin: the "data comes and goes across reloads" bug. When we
  // can't confirm an authenticated session, serve the cache instead of issuing
  // (and then caching) an anon read.
  let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] = null;
  try {
    session = (await supabase.auth.getSession()).data.session;
  } catch {
    // getSession can reject transiently (e.g. cross-tab lock timeout) — treat as
    // "not ready" and fall back to cache rather than firing an anon read.
  }
  if (!session) {
    return memGet<T[]>(key, { ignoreExpiry: true }) ?? [];
  }

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
  // This read ran under a confirmed authenticated session, so an empty result is
  // a genuine "collection is empty" and is safe to cache.
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
  doc: T,
  opts: { queueOnError?: boolean; throwOnUnauthorized?: boolean } = {}
): Promise<T> {
  // `queueOnError: false` is for best-effort writes (e.g. the edit-history log)
  // that must never pile up in — and endlessly retry through — the offline queue
  // if the push fails; the optimistic cache update still happens.
  const queueOnError = opts.queueOnError !== false;
  const id = doc.id || crypto.randomUUID();
  const record = { ...doc, id };
  const { id: _omit, ...payload } = record;
  void _omit;

  // Optimistically reflect the write in the cache, then either push now or queue.
  const key = `col:${collection}`;
  const cached = memGet<T[]>(key, { ignoreExpiry: true }) ?? [];
  memSet(key, [record, ...cached.filter((d) => d.id !== id)]);

  if (isEffectivelyOffline() || !isSupabaseConfigured) {
    if (isSupabaseConfigured && queueOnError) enqueueWrite({ type: "upsert", collection, doc: record, queuedAt: Date.now() });
    return record;
  }

  const { error } = await supabase
    .from(collection)
    .upsert({ id, data: payload, updated_at: new Date().toISOString() });
  if (error) {
    if (isAuthError(error)) {
      // Rejected by RLS/auth — retrying won't help until the session/role changes,
      // so DON'T queue it (that would retry forever). Roll back the optimistic cache
      // entry so the UI doesn't show a row that isn't really stored.
      const rolledBack = (memGet<T[]>(key, { ignoreExpiry: true }) ?? []).filter((d) => d.id !== id);
      memSet(key, rolledBack);
      console.warn(`[data] upsert(${collection}/${id}) rejected (not authorized):`, error.message);
      if (opts.throwOnUnauthorized) throw new WriteNotAuthorizedError(error.message);
    } else if (queueOnError) {
      // Push failed (e.g. connection dropped mid-request) — queue it for later sync.
      console.error(`[data] upsert(${collection}/${id}) failed, queuing:`, error.message);
      enqueueWrite({ type: "upsert", collection, doc: record, queuedAt: Date.now() });
    } else {
      console.warn(`[data] upsert(${collection}/${id}) failed (not queued):`, error.message);
    }
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
 * Connectivity notifications — subscribers are told when we lose or regain a
 * usable connection to the backend so the UI can surface a toast and reflect the
 * live status (e.g. the Settings connection card). Connectivity is derived from
 * both the browser's `online`/`offline` events and a periodic heartbeat that
 * catches a "connected but backend unreachable" (dead link) situation.
 */

const connectivityListeners = new Set<(online: boolean) => void>();

/** Subscribe to online/offline transitions; returns an unsubscribe function. */
export function onConnectivityChange(listener: (online: boolean) => void): () => void {
  connectivityListeners.add(listener);
  return () => connectivityListeners.delete(listener);
}

/** Last known backend reachability; `null` until the first heartbeat resolves. */
let backendReachable: boolean | null = null;
let lastNotifiedOnline = true;

/** Central place to apply a connectivity transition: dedupe, notify, and sync on recovery. */
function setConnectivity(online: boolean) {
  backendReachable = online;
  if (online === lastNotifiedOnline) return;
  lastNotifiedOnline = online;
  connectivityListeners.forEach((l) => l(online));
  if (online) void autoSync();
}

const HEARTBEAT_TABLE = Collections.feedstock;
const HEARTBEAT_INTERVAL = 60_000;
const HEARTBEAT_TIMEOUT = 6_000;

/**
 * Cheap reachability probe: a HEAD-only request against one table (no rows, no
 * COUNT — just "did the backend answer"), with a hard timeout so a dead link
 * resolves quickly instead of hanging. A "table not found" style error still
 * means the backend answered, so it counts as online.
 */
async function checkHeartbeat() {
  if (!isSupabaseConfigured) return;
  // The browser already knows it's offline — trust that and skip the probe.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setConnectivity(false);
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT);
  let reachable = false;
  try {
    const { error } = await supabase
      .from(HEARTBEAT_TABLE)
      .select("id", { head: true })
      .limit(1)
      .abortSignal(controller.signal);
    reachable = !error || error.code === "PGRST205" || /find the table/i.test(error.message);
  } catch {
    reachable = false;
  } finally {
    clearTimeout(timer);
  }
  setConnectivity(reachable);
  // Retry any queued writes whenever we can reach the backend (no-op if empty).
  if (reachable) void autoSync();
}

let initialized = false;

/**
 * Register connectivity detection: browser online/offline events plus a periodic
 * backend heartbeat. Transitions notify subscribers and flush the write queue on
 * reconnect. The poll is skipped while the tab is hidden (and runs once on
 * becoming visible again) to avoid needless background requests. Idempotent.
 */
export function initOfflineAutoSync() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("online", () => {
    // Confirm the backend is actually reachable before declaring us online.
    void checkHeartbeat();
  });
  window.addEventListener("offline", () => setConnectivity(false));
  // Re-probe as soon as the user returns to the tab (it may have been offline while hidden).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkHeartbeat();
  });
  // Kick off an immediate probe, then poll only while the tab is visible. Also
  // flushes any queue left from a previous session once the first probe confirms
  // we're online.
  void checkHeartbeat();
  setInterval(() => {
    if (document.visibilityState === "visible") void checkHeartbeat();
  }, HEARTBEAT_INTERVAL);
}

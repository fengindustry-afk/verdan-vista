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

const mem = new Map<string, { value: unknown; expires: number }>();
const TTL = 5 * 60 * 1000;

function memGet<T>(key: string): T | undefined {
  const e = mem.get(key);
  if (e && Date.now() < e.expires) return e.value as T;
  if (e) mem.delete(key);
  return undefined;
}
function memSet(key: string, value: unknown) {
  mem.set(key, { value, expires: Date.now() + TTL });
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
  if (opts.cache !== false) {
    const cached = memGet<T[]>(key);
    if (cached) return cached;
  }
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from(collection)
    .select("id,data,updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
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
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from(collection)
    .select("id,data,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`[data] getDocument(${collection}/${id}) failed:`, error.message);
    return null;
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

  mem.delete(`col:${collection}`);

  if (isSupabaseConfigured) {
    const { error } = await supabase
      .from(collection)
      .upsert({ id, data: payload, updated_at: new Date().toISOString() });
    if (error) {
      console.error(`[data] upsert(${collection}/${id}) failed:`, error.message);
    }
  }
  return record;
}

export async function deleteDocument(
  collection: CollectionName,
  id: string
): Promise<void> {
  mem.delete(`col:${collection}`);
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from(collection).delete().eq("id", id);
  if (error) console.error(`[data] delete(${collection}/${id}) failed:`, error.message);
}

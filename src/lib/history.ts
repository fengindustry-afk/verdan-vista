/**
 * Immutable edit-history log. Every create / update / delete made through the
 * app's mutation hooks appends a row to the shared `edit_history` collection.
 * Rows are only ever appended — never updated or deleted — so the log is an
 * append-only audit of who changed what, when, with a field-level before→after
 * diff. It is the generic counterpart to the feedstock custody `AuditLog`,
 * covering every other collection (trees, readings, scans, work-process entries,
 * costs, users, locations, …).
 */

import { upsertDocument, getCollection } from "./data";
import { Collections, type CollectionName } from "./collections";
import { parseRole, roleDisplayName } from "./rbac";
import type { UserProfile } from "./types";

export type HistoryAction = "create" | "update" | "delete";

export interface FieldChange {
  Field: string;
  Before: string | null;
  After: string | null;
}

/** One immutable entry in the edit-history log (jsonb payload of an edit_history row). */
export interface HistoryEntry {
  id: string;
  /** Which collection the changed document lives in. */
  Collection: CollectionName;
  /** The changed document's id. */
  DocumentId: string;
  Action: HistoryAction;
  /** Human label for the record at the time of the change (e.g. batch title). */
  Label: string;
  Actor: string;
  Role: string;
  Timestamp: string;
  /** Per-field before→after diff (empty for pure creates/deletes). */
  Changes: FieldChange[];
}

/**
 * Fields that change on their own (timestamps, ids, computed values) and would
 * only add noise to the diff — excluded from change detection and display.
 */
const IGNORED_FIELDS = new Set([
  "id",
  "Id",
  "updated_at",
  "UpdatedAt",
  "LastLoginAt",
]);

/** Collections whose writes are NOT tracked (the log itself). */
const UNTRACKED: ReadonlySet<string> = new Set<string>([Collections.editHistory]);

export function isTracked(collection: CollectionName): boolean {
  return !UNTRACKED.has(collection);
}

/** Read the current signed-in user straight from the session store (framework-free). */
function currentActor(): { actor: string; role: string } {
  try {
    const raw = localStorage.getItem("ct_user");
    if (raw) {
      const u = JSON.parse(raw) as UserProfile;
      return {
        actor: u.FullName || u.Email || "Unknown",
        role: roleDisplayName[parseRole(u.Role)],
      };
    }
  } catch {
    /* fall through to anonymous */
  }
  return { actor: "Unknown", role: "—" };
}

/** Stable, human-readable rendering of a single field value for the diff. */
function display(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Best-effort human label for the changed document (its title/name/code/id). */
function labelFor(doc: Record<string, unknown> | undefined, id: string): string {
  if (!doc) return id;
  for (const key of ["Title", "Name", "FullName", "TreeCode", "StageTitle", "Batch", "BatchId"]) {
    const v = doc[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return id;
}

/** Shallow field-level diff between two document payloads (ignoring noisy keys). */
export function diffDocs(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): FieldChange[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: FieldChange[] = [];
  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    const b = display(before?.[key]);
    const a = display(after?.[key]);
    if (b !== a) changes.push({ Field: key, Before: b, After: a });
  }
  return changes;
}

/**
 * Append one immutable history entry describing a change. No-ops for untracked
 * collections and for updates that changed nothing. Never throws — history is
 * best-effort and must not break the underlying write.
 */
export async function recordEdit(opts: {
  collection: CollectionName;
  documentId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}): Promise<void> {
  const { collection, documentId, before, after } = opts;
  if (!isTracked(collection)) return;

  const action: HistoryAction = !before ? "create" : !after ? "delete" : "update";
  const changes = action === "update" ? diffDocs(before, after) : [];
  if (action === "update" && changes.length === 0) return; // nothing meaningful changed

  const { actor, role } = currentActor();
  const id = `hist_${crypto.randomUUID()}`;
  const entry: HistoryEntry = {
    id,
    Collection: collection,
    DocumentId: documentId,
    Action: action,
    Label: labelFor(after ?? before, documentId),
    Actor: actor,
    Role: role,
    Timestamp: new Date().toISOString(),
    Changes: changes,
  };

  try {
    // Best-effort: never queue/retry a failed history write (e.g. before the
    // edit_history table exists) — it must not pollute the offline write queue.
    await upsertDocument<HistoryEntry>(Collections.editHistory, entry, { queueOnError: false });
  } catch (e) {
    console.error("[history] failed to record edit:", e);
  }
}

/** All history entries, newest first. */
export async function getHistory(): Promise<HistoryEntry[]> {
  const rows = await getCollection<HistoryEntry>(Collections.editHistory);
  return rows.sort((a, b) => (a.Timestamp < b.Timestamp ? 1 : -1));
}

export function formatHistoryTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

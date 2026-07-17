/**
 * Reads files that were shared into the installed PWA via the Web Share Target
 * API. The service worker (public/sw.js) receives the OS share POST and writes
 * the file to IndexedDB; this module is the app-side half of that contract.
 *
 * Keep the DB name / store / key in lockstep with public/sw.js.
 */

const SHARE_DB = "esterra-share";
const SHARE_STORE = "inbox";
const PENDING_KEY = "pending";

export type SharedItem = {
  id: string;
  file: Blob;
  name: string;
  type: string;
  ts: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SHARE_DB, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(SHARE_STORE)) {
        open.result.createObjectStore(SHARE_STORE, { keyPath: "id" });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

/** Returns the pending shared file, or null if nothing has been shared. */
export async function readPendingShare(): Promise<SharedItem | null> {
  if (!("indexedDB" in globalThis)) return null;
  const db = await openDb();
  try {
    return await new Promise<SharedItem | null>((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, "readonly");
      const req = tx.objectStore(SHARE_STORE).get(PENDING_KEY);
      req.onsuccess = () => resolve((req.result as SharedItem) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Clears the pending shared file once it has been routed to a destination. */
export async function clearPendingShare(): Promise<void> {
  if (!("indexedDB" in globalThis)) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, "readwrite");
      tx.objectStore(SHARE_STORE).delete(PENDING_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Rehydrates a stored item as a real File so dialogs can treat it like an upload. */
export function toFile(item: SharedItem): File {
  return new File([item.file], item.name, { type: item.type });
}

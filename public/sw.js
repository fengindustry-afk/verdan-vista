/*
 * Esterra service worker — DELIBERATELY MINIMAL.
 *
 * Its ONLY job is to receive files shared into the installed PWA via the Web
 * Share Target API and stash them so the app can pick them up. It does NOT
 * precache the app shell, cache API/auth responses, or intercept any other
 * request — every non-share fetch falls through to the browser's normal
 * network handling. This is intentional: a prior caching change caused a
 * production data-loss incident, so this worker is scoped as narrowly as
 * possible to stay well clear of that failure mode.
 *
 * Contract with the app (src/lib/shareInbox.ts): a shared file is written to
 * IndexedDB db "esterra-share", store "inbox", under the key id "pending".
 */

const SHARE_DB = "esterra-share";
const SHARE_STORE = "inbox";
const SHARE_ROUTE = "/share-target";

// Activate immediately so sharing works right after the first install.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** Persist the shared file record to IndexedDB (shared with the page). */
function putPendingShare(record) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SHARE_DB, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(SHARE_STORE)) {
        open.result.createObjectStore(SHARE_STORE, { keyPath: "id" });
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(SHARE_STORE, "readwrite");
      tx.objectStore(SHARE_STORE).put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only the Share Target POST is handled here. Everything else is left to the
  // browser (no respondWith == default network fetch, no caching side effects).
  if (request.method === "POST" && url.pathname === SHARE_ROUTE) {
    event.respondWith(
      (async () => {
        try {
          const form = await request.formData();
          const file = form.get("file");
          if (file && typeof file !== "string" && file.size > 0) {
            await putPendingShare({
              id: "pending",
              file,
              name: file.name || "shared-file",
              type: file.type || "application/octet-stream",
              ts: Date.now(),
            });
          }
        } catch (err) {
          // Swallow and still redirect — the chooser will show an empty state
          // rather than leaving the user on a broken POST response.
          // eslint-disable-next-line no-console
          console.warn("[sw] share intake failed:", err);
        }
        // 303 forces the follow-up to be a GET of the chooser route.
        return Response.redirect(`${SHARE_ROUTE}?shared=1`, 303);
      })(),
    );
  }
});

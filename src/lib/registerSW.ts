/**
 * Registers the minimal share-target service worker (public/sw.js).
 *
 * The worker only handles the Web Share Target POST; it never caches app or API
 * responses (see the header comment in public/sw.js for the rationale). Sharing
 * into the app only works once the PWA is installed on a secure origin, but
 * registering on localhost is harmless and lets the flow be tested locally.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Non-fatal: the app works fully without it, only share-target intake is lost.
      console.warn("[sw] registration failed:", err);
    });
  });
}

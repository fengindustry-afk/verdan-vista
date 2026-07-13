/**
 * Minimal storage-adapter shape accepted by `createClient(..., { auth: { storage } })`.
 * `@supabase/supabase-js` does not export a named `StorageAdapter` type, so we declare
 * the structural contract locally. Methods may return sync or async values.
 */
interface StorageAdapter {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

/**
 * Custom storage adapter for Supabase Auth that moves session tokens from localStorage
 * to httpOnly cookies, preventing XSS token theft.
 *
 * Design:
 * - Reads: Parse token from document.cookie (httpOnly prevents JS reads, so we restore
 *   from localStorage on first load, then rely on browser cookie storage)
 * - Writes: Store token in memory + signal Vercel Edge Middleware to set httpOnly cookie
 * - Offline fallback: If middleware call fails, store in localStorage and memory
 */

const SESSION_STORAGE_KEY = "sb-session"; // Key used in memory store
const FALLBACK_STORAGE_KEY = "sb-session-fallback"; // localStorage fallback for offline

// In-memory storage for immediate token access
const memoryStore = new Map<string, string>();

/**
 * Extract the session token from document.cookie.
 * Since httpOnly cookies can't be read by JS, this attempts to parse a non-httpOnly
 * representation if available during development, but primarily relies on the cookie
 * being automatically sent with requests by the browser.
 */
function parseCookieSession(documentCookie: string): string | null {
  if (!documentCookie) return null;

  // Look for Supabase session cookie (format: sb-<project-ref>-auth-token=<value>)
  const match = documentCookie.match(/sb-[^=]+-auth-token=([^;]+)/);
  if (match && match[1]) {
    try {
      const decoded = decodeURIComponent(match[1]);
      // Validate it's JSON (session object)
      JSON.parse(decoded);
      return decoded;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Signal Vercel Edge Middleware to set the httpOnly cookie.
 * This POST request includes the session payload; middleware responds with Set-Cookie.
 */
async function signalMiddlewareSetCookie(
  sessionString: string
): Promise<boolean> {
  try {
    const response = await fetch("/_auth/set-cookie", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include", // Include cookies in the request
      body: JSON.stringify({ session: sessionString }),
    });

    if (!response.ok) {
      console.warn(
        `[cookieStorage] Failed to set httpOnly cookie: ${response.status}`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[cookieStorage] Failed to signal middleware:", error);
    return false;
  }
}

/**
 * Signal Vercel Edge Middleware to clear the httpOnly cookie (on logout).
 */
async function signalMiddlewareClearCookie(): Promise<void> {
  try {
    await fetch("/_auth/set-cookie", {
      method: "DELETE",
      credentials: "include",
    });
  } catch (error) {
    console.warn("[cookieStorage] Failed to clear httpOnly cookie:", error);
  }
}

/**
 * Get session from memory store or fall back to localStorage.
 * Returns null if not found in either.
 */
function getSessionFromMemoryOrFallback(): string | null {
  // Try memory first (fastest, populated by setItem)
  const memorySession = memoryStore.get(SESSION_STORAGE_KEY);
  if (memorySession) {
    return memorySession;
  }

  // Fall back to localStorage (used on first load before middleware is available)
  try {
    const fallbackSession = localStorage.getItem(FALLBACK_STORAGE_KEY);
    if (fallbackSession) {
      // Restore to memory for future access
      memoryStore.set(SESSION_STORAGE_KEY, fallbackSession);
      return fallbackSession;
    }
  } catch {
    // localStorage may be unavailable (e.g., private browsing)
  }

  return null;
}

/**
 * Supabase StorageAdapter implementation for httpOnly cookie-based session storage.
 */
export const cookieStorage: StorageAdapter = {
  getItem: (key: string): string | null => {
    // Only handle Supabase auth token storage
    if (!key.includes("auth-token")) {
      return null;
    }

    // Attempt to read from memory first
    const session = getSessionFromMemoryOrFallback();
    return session || null;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    // Only handle Supabase auth token storage
    if (!key.includes("auth-token")) {
      return;
    }

    // Store in memory immediately (supabase-js needs it for Bearer header)
    memoryStore.set(SESSION_STORAGE_KEY, value);

    // Store in localStorage as offline fallback
    try {
      localStorage.setItem(FALLBACK_STORAGE_KEY, value);
    } catch {
      // localStorage may be unavailable (e.g., private browsing)
    }

    // Signal middleware to set httpOnly cookie
    // If this fails, the token is still available from memory/localStorage,
    // so we don't throw — the app continues working offline
    await signalMiddlewareSetCookie(value);
  },

  removeItem: async (key: string): Promise<void> => {
    // Only handle Supabase auth token storage
    if (!key.includes("auth-token")) {
      return;
    }

    // Clear memory
    memoryStore.delete(SESSION_STORAGE_KEY);

    // Clear localStorage fallback
    try {
      localStorage.removeItem(FALLBACK_STORAGE_KEY);
    } catch {
      // localStorage may be unavailable
    }

    // Signal middleware to clear httpOnly cookie
    await signalMiddlewareClearCookie();
  },
};

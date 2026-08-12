import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The demo login path. Its whole point is that the app stays usable with no
 * backend, so establishing the session must not depend on the profile-row sync
 * that follows it.
 *
 * Rendered with react-dom directly rather than @testing-library/react: that
 * package is installed but its @testing-library/dom peer is not, so renderHook
 * can't load.
 */

/** Resolves only when the test says so — stands in for a slow/hanging network. */
let releaseUpsert: () => void = () => {};
const upsertDocument = vi.fn(
  () => new Promise<unknown>((resolve) => { releaseUpsert = () => resolve({}); })
);

vi.mock("./data", () => ({
  upsertDocument: (...args: unknown[]) => upsertDocument(...(args as [])),
  findDocumentByField: vi.fn(async () => null),
  clearDataCache: vi.fn(),
}));

vi.mock("./supabase", () => ({
  isSupabaseConfigured: false,
  supabase: { auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() } },
}));

const { AuthProvider, useAuth } = await import("./auth");

let container: HTMLDivElement;
let root: Root;

/** Mount AuthProvider and hand back the live context value. */
function mountAuth() {
  const ref: { current: ReturnType<typeof useAuth> | null } = { current: null };
  function Probe() {
    ref.current = useAuth();
    return null;
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    root.render(
      <QueryClientProvider client={qc}>
        <AuthProvider><Probe /></AuthProvider>
      </QueryClientProvider>
    );
  });
  return ref;
}

describe("demoLogin", () => {
  beforeEach(() => {
    localStorage.clear();
    upsertDocument.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("persists the session before the profile sync resolves", async () => {
    const auth = mountAuth();

    // Fire and deliberately do NOT await: the upsert is still in flight.
    let done!: Promise<unknown>;
    act(() => {
      done = auth.current!.demoLogin("demo.admin@carbontracker.app");
    });

    // Signed in already, with the sync still hanging. Under the old ordering
    // (await upsert, then setItem) this is where a reload lost the session —
    // and where Playwright's storageState came out signed-out.
    expect(upsertDocument).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("ct_user")!).Role).toBe("Admin");
    expect(auth.current!.user?.Role).toBe("Admin");

    releaseUpsert();
    await act(async () => { await done; });
  });

  it("keeps the session when the profile sync fails outright", async () => {
    upsertDocument.mockImplementationOnce(() => Promise.reject(new Error("network down")));
    const auth = mountAuth();

    await act(async () => {
      await auth.current!.demoLogin("demo.viewer@carbontracker.app");
    });

    expect(localStorage.getItem("ct_user")).toBeTruthy();
    expect(auth.current!.user?.Role).toBe("Viewer");
  });
});

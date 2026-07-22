import { describe, it, expect, vi, afterEach } from "vitest";
import { loadImage } from "./treeScanAI";

const ok = () => new Response("x", { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("loadImage", () => {
  it("retries a transient failure on the same source", async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);

    expect((await loadImage(["signed-url"])).size).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to the next source when the first is CORS-blocked", async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("cors"))
      .mockRejectedValueOnce(new TypeError("cors"))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);

    expect((await loadImage(["signed-url", "data:base64"])).size).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(3); // two attempts on the URL, one on base64
  });

  it("does not retry a 404 but does move to the next source", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);

    expect((await loadImage(["gone", "data:base64"])).size).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports the first real reason when every source fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(loadImage(["a", "b"])).rejects.toThrow("image request returned 403");
  });
});

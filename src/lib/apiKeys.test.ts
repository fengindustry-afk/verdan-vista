import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, keyIsLive } from "./apiKeys";
import type { ApiKey } from "./types";

const key = (over: Partial<ApiKey> = {}): ApiKey =>
  ({ id: "k", Label: "test", KeyHash: "h", ...over }) as ApiKey;

describe("generateApiKey", () => {
  it("is 256 bits of hex behind a recognisable prefix", () => {
    const k = generateApiKey();
    expect(k).toMatch(/^esterra_[0-9a-f]{64}$/);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 200 }, generateApiKey));
    expect(seen.size).toBe(200);
  });
});

describe("hashApiKey", () => {
  it("is stable for the same key and different for another", async () => {
    const a = await hashApiKey("esterra_abc");
    expect(await hashApiKey("esterra_abc")).toBe(a);
    expect(await hashApiKey("esterra_abd")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    // The stored value must not contain the key it came from.
    expect(a).not.toContain("abc");
  });
});

describe("keyIsLive", () => {
  const now = Date.parse("2026-07-21T00:00:00Z");

  it("accepts an unexpired key", () => {
    expect(keyIsLive(key({ ExpiresAt: "2026-10-01T00:00:00Z" }), now)).toBe(true);
  });

  it("rejects one past its expiry", () => {
    expect(keyIsLive(key({ ExpiresAt: "2026-07-20T23:59:59Z" }), now)).toBe(false);
  });

  it("rejects a revoked key even while unexpired", () => {
    expect(keyIsLive(key({ ExpiresAt: "2026-10-01T00:00:00Z", Revoked: true }), now)).toBe(false);
  });

  it("treats a key with no expiry as live", () => {
    expect(keyIsLive(key(), now)).toBe(true);
  });
});

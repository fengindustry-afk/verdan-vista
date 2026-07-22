import { describe, it, expect } from "vitest";
import { classifyAiError } from "./aiErrors";

/** Strings the providers and the edge function actually emit. */
const cases: [string, string, string][] = [
  ["Gemini quota", "All providers failed — Gemini 429: RESOURCE_EXHAUSTED quota exceeded", "quota"],
  ["Groq quota", "Groq 429: rate_limit_exceeded, insufficient_quota for this org", "quota"],
  ["Gemini overload", "Gemini 503: The model is overloaded. Please try again later.", "busy"],
  ["Groq capacity", "Groq 503: service is currently over capacity", "busy"],
  ["bad key", "Groq 401: invalid_api_key provided", "auth"],
  ["no session", "Not signed in", "signin"],
  ["no config", "Supabase not configured", "unconfigured"],
  ["edge unreachable", "Failed to send a request to the Edge Function", "unreachable"],
  ["dropped connection", "TypeError: Failed to fetch", "unreachable"],
  ["client timeout", "signal is aborted without reason", "timeout"],
  ["oversized image", "Image too large", "too-large"],
  ["garbled reply", "Unexpected analysis response", "bad-response"],
];

describe("classifyAiError", () => {
  for (const [name, raw, kind] of cases) {
    it(`reads ${name} as "${kind}"`, () => {
      expect(classifyAiError(new Error(raw)).kind).toBe(kind);
    });
  }

  it("says out of quota in plain words", () => {
    const e = classifyAiError(new Error("Gemini 429: RESOURCE_EXHAUSTED"));
    expect(e.message).toBe("AI out of quota — the daily limit is used up");
  });

  it("prefers quota over a generic rate limit when both appear", () => {
    // A 429 body often mentions both; the exhausted plan is the actionable one.
    expect(classifyAiError(new Error("429 rate limit reached, quota exceeded")).kind).toBe("quota");
  });

  it("reads an image failure as an image failure, not an AI timeout", () => {
    const e = classifyAiError(new Error("image download timed out"));
    expect(e.kind).toBe("image");
    expect(e.message).toBe("AI skipped — image download timed out");
  });

  it("names the subject in every message, so no caller needs to prefix one", () => {
    for (const [, raw] of cases) {
      expect(classifyAiError(new Error(raw)).message).toMatch(/^(AI|Sign in|Image|Offline)/);
    }
  });

  it("keeps the raw text in detail for the console", () => {
    expect(classifyAiError(new Error("Groq 401: invalid_api_key")).detail)
      .toBe("Groq 401: invalid_api_key");
  });

  it("never returns an empty message", () => {
    expect(classifyAiError(new Error("")).message).toBe("AI failed for an unknown reason");
    expect(classifyAiError(undefined).message).toBe("AI failed for an unknown reason");
  });
});

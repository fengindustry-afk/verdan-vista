import { describe, it, expect } from "vitest";
import { parseNumeric } from "./useNumericField";

describe("parseNumeric", () => {
  it("parses small and long decimals without losing precision", () => {
    expect(parseNumeric("0.0005")).toBe(0.0005);
    expect(parseNumeric("0.172131")).toBe(0.172131);
    expect(parseNumeric("1234.5")).toBe(1234.5);
  });

  it("treats in-progress decimal text as zero rather than rejecting it", () => {
    expect(parseNumeric("0.")).toBe(0);
    expect(parseNumeric("0.0")).toBe(0);
  });

  it("returns null for blank or unparseable input", () => {
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric("   ")).toBeNull();
    expect(parseNumeric("-")).toBeNull();
    expect(parseNumeric("abc")).toBeNull();
  });
});

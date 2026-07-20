import { useState } from "react";

/**
 * Number inputs backed by numeric state eat in-progress text: typing "0." parses
 * to 0 and renders back as "0", so decimals can never be entered. This keeps the
 * raw string the user typed and only reports the parsed number alongside it.
 */
/** Parses input text to a number, treating blank and in-progress text as "no value". */
export function parseNumeric(text: string): number | null {
  return text.trim() === "" || Number.isNaN(Number(text)) ? null : Number(text);
}

export function useNumericField() {
  const [raw, setRaw] = useState<Record<string, string>>({});

  /** What the input should show: the in-progress text, else the stored value. */
  const display = (key: string, value: unknown) =>
    raw[key] ?? (value == null ? "" : String(value));

  /** Wraps a change handler, caching the raw text and passing on the parsed number. */
  const onChange =
    (key: string, commit: (value: number | null) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setRaw((r) => ({ ...r, [key]: text }));
      commit(parseNumeric(text));
    };

  /** Drop cached text so the fields re-read from state (e.g. when a dialog reopens). */
  const reset = () => setRaw({});

  return { display, onChange, reset };
}

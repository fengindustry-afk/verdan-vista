/**
 * Theming — the web port of the mobile app's ThemeService
 * (carbon-tracker-dotnet/Services/ThemeService.cs).
 *
 * A "theme set" is a named pair of Light + Dark palettes. The dark-mode toggle
 * flips Light/Dark *within* the active set; the set picker swaps the whole
 * palette pair. Each palette is defined with the same source keys the mobile
 * app uses, then mapped onto the web's `--foo` HSL CSS variables so every
 * existing `hsl(var(--foo))` reference re-themes automatically.
 */

export type ThemeMode = "light" | "dark";

/** Source palette — mirrors the mobile ThemeService keys. */
interface Palette {
  Background: string;
  Surface: string;
  SurfaceLighter: string;
  Foreground: string;
  Border: string;
  Muted: string;
  BrandHeading: string;
  Primary: string;
  /** Deep brand band used for the sidebar / nav (mobile "HouseGreen"). */
  HouseGreen: string;
}

export interface ThemeSet {
  id: string;
  label: string;
  description: string;
  light: Palette;
  dark: Palette;
}

/** Ordered list of selectable theme sets. Add a new one here — nothing else changes. */
export const THEME_SETS: ThemeSet[] = [
  {
    id: "verdant",
    label: "Verdant",
    description: "Emerald on space-black — the default Esterra web look.",
    dark: {
      Background: "#080A0F", Surface: "#12141B", SurfaceLighter: "#1E2029",
      Foreground: "#E6EBF1", Border: "#262933", Muted: "#808B99",
      BrandHeading: "#46CD92", Primary: "#27A878", HouseGreen: "#0D0F15",
    },
    light: {
      Background: "#F4F7FB", Surface: "#FFFFFF", SurfaceLighter: "#EBF0F5",
      Foreground: "#0E1726", Border: "#DDE4EC", Muted: "#5B6675",
      BrandHeading: "#1E9C6B", Primary: "#17915F", HouseGreen: "#0E2A20",
    },
  },
  {
    id: "esterra",
    label: "Esterra",
    description: "Leaf brand — warm cream (light) or deep forest green (dark).",
    dark: {
      Background: "#0E2A20", Surface: "#143A2C", SurfaceLighter: "#1C4838",
      Foreground: "#EAF3EC", Border: "#2C5C3F", Muted: "#9DB6AB",
      BrandHeading: "#9CE86B", Primary: "#82C341", HouseGreen: "#14432E",
    },
    light: {
      Background: "#F3F0E6", Surface: "#FFFFFF", SurfaceLighter: "#EEEADD",
      Foreground: "#13291F", Border: "#DCD9C7", Muted: "#5A7A64",
      BrandHeading: "#2E6B37", Primary: "#3E8E28", HouseGreen: "#14432E",
    },
  },
  {
    id: "classic",
    label: "Classic HUD",
    description: "Holographic cyan on space-black — the original HUD theme.",
    dark: {
      Background: "#05080F", Surface: "#0C1424", SurfaceLighter: "#142033",
      Foreground: "#E6F1FF", Border: "#1C3A45", Muted: "#8CA3C0",
      BrandHeading: "#5EE9FF", Primary: "#22D3EE", HouseGreen: "#0B1220",
    },
    light: {
      Background: "#EEF3FA", Surface: "#FFFFFF", SurfaceLighter: "#F4F7FB",
      Foreground: "#0B1220", Border: "#CBD9E6", Muted: "#5A6B80",
      BrandHeading: "#0E7C93", Primary: "#0891B2", HouseGreen: "#0B1220",
    },
  },
  {
    id: "violet",
    label: "Violet",
    description: "Soft indigo — a calm neutral alternative.",
    dark: {
      Background: "#0B0B0F", Surface: "#17171F", SurfaceLighter: "#22222D",
      Foreground: "#F2F2F5", Border: "#2E2E3A", Muted: "#A0A0AC",
      BrandHeading: "#C9B6FF", Primary: "#8B77F0", HouseGreen: "#1E1830",
    },
    light: {
      Background: "#F6F6F8", Surface: "#FFFFFF", SurfaceLighter: "#EFEFF3",
      Foreground: "#111114", Border: "#E2E2E8", Muted: "#5C5C68",
      BrandHeading: "#6C4BD8", Primary: "#6C4BD8", HouseGreen: "#241B3A",
    },
  },
];

export const DEFAULT_SET = "esterra";
export const DEFAULT_MODE: ThemeMode = "light";
const SET_KEY = "theme_set";
const MODE_KEY = "theme_mode";

// ---- hex → HSL-triplet ("H S% L%") for `hsl(var(--x))` variables -----------

interface Hsl { h: number; s: number; l: number }

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6); // drop leading alpha if 8-digit
  const int = parseInt(h, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case rn: h = ((gn - bn) / d) % 6; break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const triplet = (hex: string): string => {
  const { h, s, l } = hexToHsl(hex);
  return `${h} ${s}% ${l}%`;
};

/** Perceived luminance 0–1, to pick readable text over a fill. */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** A readable foreground (near-white or near-black) for a given fill color. */
const contrastTriplet = (hex: string): string =>
  luminance(hex) > 0.6 ? "222 20% 8%" : "0 0% 100%";

/** A softer, muted readable foreground for a given fill color (labels, not headlines). */
const mutedContrastTriplet = (hex: string): string =>
  luminance(hex) > 0.6 ? "222 15% 30%" : "210 10% 65%";

/** Maps a source palette to the full set of web CSS variables. */
function toCssVars(p: Palette): Record<string, string> {
  return {
    "--background": triplet(p.Background),
    "--foreground": triplet(p.Foreground),
    "--card": triplet(p.Surface),
    "--card-foreground": triplet(p.Foreground),
    "--popover": triplet(p.Surface),
    "--popover-foreground": triplet(p.Foreground),
    "--primary": triplet(p.Primary),
    "--primary-foreground": contrastTriplet(p.Primary),
    "--secondary": triplet(p.SurfaceLighter),
    "--secondary-foreground": triplet(p.Foreground),
    "--muted": triplet(p.SurfaceLighter),
    "--muted-foreground": triplet(p.Muted),
    "--accent": triplet(p.SurfaceLighter),
    "--accent-foreground": triplet(p.Foreground),
    "--border": triplet(p.Border),
    "--input": triplet(p.Border),
    "--ring": triplet(p.Primary),
    "--sidebar-background": triplet(p.HouseGreen),
    // HouseGreen stays dark in both light and dark mode (it's a fixed brand
    // band), so its text must contrast against itself, not against the
    // mode-flipping main Foreground/Muted tones.
    "--sidebar-foreground": mutedContrastTriplet(p.HouseGreen),
    "--sidebar-primary": triplet(p.Primary),
    "--sidebar-primary-foreground": contrastTriplet(p.Primary),
    "--sidebar-accent": triplet(p.SurfaceLighter),
    "--sidebar-accent-foreground": contrastTriplet(p.HouseGreen),
    "--sidebar-border": triplet(p.Border),
    "--sidebar-ring": triplet(p.Primary),
    // Custom brand tokens used by gradients / stat badges.
    "--emerald": triplet(p.Primary),
    "--mint": triplet(p.BrandHeading),
    "--lime": triplet(p.BrandHeading),
    "--surface-glass": triplet(p.Surface),
  };
}

export function getThemeSet(id: string): ThemeSet {
  return THEME_SETS.find((t) => t.id === id) ?? THEME_SETS[0];
}

/** Applies a theme set + mode by writing CSS variables onto <html>. */
export function applyTheme(setId: string, mode: ThemeMode): void {
  const set = getThemeSet(setId);
  const palette = mode === "dark" ? set.dark : set.light;
  const root = document.documentElement;
  const vars = toCssVars(palette);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.classList.toggle("dark", mode === "dark");
  root.classList.toggle("light", mode === "light");
  root.style.colorScheme = mode;
}

export function getStoredTheme(): { setId: string; mode: ThemeMode } {
  const setId = localStorage.getItem(SET_KEY) ?? DEFAULT_SET;
  const mode = (localStorage.getItem(MODE_KEY) as ThemeMode) ?? DEFAULT_MODE;
  return { setId: getThemeSet(setId).id, mode: mode === "light" ? "light" : "dark" };
}

export function storeTheme(setId: string, mode: ThemeMode): void {
  localStorage.setItem(SET_KEY, setId);
  localStorage.setItem(MODE_KEY, mode);
}

/** Preview swatches for the settings picker (in the current mode). */
export function swatches(set: ThemeSet, mode: ThemeMode): string[] {
  const p = mode === "dark" ? set.dark : set.light;
  return [p.Background, p.Surface, p.Primary, p.BrandHeading];
}

export const MAIL_LABEL_MAX_PER_USER = 20;

/** Normalize #rgb to #rrggbb for storage and HTML color inputs. */
export function expandHexColor(hex: string): string {
  const h = hex.trim();
  if (h.length === 4 && h.startsWith("#")) {
    const s = h.slice(1);
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toLowerCase();
  }
  return h.toLowerCase();
}

/** 6-char hex for `<input type="color">` (falls back if invalid). */
export function hexForColorInput(hex: string, fallback = "#3b82f6"): string {
  const e = expandHexColor(hex);
  return /^#[0-9a-f]{6}$/.test(e) ? e : fallback;
}

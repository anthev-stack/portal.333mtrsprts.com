/**
 * Turn stored paths like `/uploads/…` into absolute URLs when `NEXT_PUBLIC_APP_URL`
 * is set (helps preloads and any edge cases where the browser resolves relative URLs oddly).
 */
export function absolutePublicAssetUrl(
  path: string | null | undefined,
): string | undefined {
  if (path == null) return undefined;
  const s = path.trim();
  if (!s) return undefined;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  const base =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL
      ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
      : "";
  if (s.startsWith("/") && base) return `${base}${s}`;
  return s;
}

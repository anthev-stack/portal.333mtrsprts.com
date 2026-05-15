/**
 * Turn stored paths like `/uploads/…` into absolute URLs when helpful.
 * Prefer the browser origin on the client so avatars work even if `NEXT_PUBLIC_APP_URL`
 * was wrong at build time (broken images → initials).
 */
export function absolutePublicAssetUrl(
  path: string | null | undefined,
): string | undefined {
  if (path == null) return undefined;
  const s = path.trim();
  if (!s) return undefined;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;

  let base = "";
  if (typeof window !== "undefined") {
    base = window.location.origin;
  } else if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL) {
    base = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (s.startsWith("/") && base) return `${base}${s}`;
  return s;
}

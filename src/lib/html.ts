/** Plain-text-ish preview from HTML (notifications, validation). */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** True if editor HTML has visible text or an embedded image (e.g. GIF). */
export function htmlHasMeaningfulBody(html: string): boolean {
  if (/<img\b/i.test(html)) return true;
  return stripHtml(html).length > 0;
}

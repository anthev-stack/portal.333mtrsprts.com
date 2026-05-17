import { buildWebsiteJsonLd } from "@/lib/site-metadata";

export function SiteJsonLd() {
  const jsonLd = buildWebsiteJsonLd();
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

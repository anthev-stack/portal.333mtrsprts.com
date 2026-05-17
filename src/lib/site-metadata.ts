import type { Metadata } from "next";

export const SITE_NAME = "333 Motorsport Staff Portal";
export const SITE_SHORT_NAME = "333 Staff Portal";

/** Shown in search snippets and link previews (iMessage, WhatsApp, Slack, etc.). */
export const SITE_DESCRIPTION =
  "Official staff portal for 333 Motorsport. Sign in to access the team feed, jobs, internal mail, knowledge base, forms, and customer care. For authorized employees only.";

/** Shorter line for OG images and compact previews. */
export const SITE_DESCRIPTION_SHORT =
  "Sign in for team feed, jobs, mail, knowledge base, and customer care.";

export const SITE_KEYWORDS = [
  "333 Motorsport",
  "333 Motorsports",
  "staff portal",
  "employee portal",
  "internal portal",
  "team portal",
];

export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

const faviconIcons: Metadata["icons"] = {
  icon: [
    {
      url: "/images/favicon/favicon-16x16.png",
      sizes: "16x16",
      type: "image/png",
    },
    {
      url: "/images/favicon/favicon-32x32.png",
      sizes: "32x32",
      type: "image/png",
    },
  ],
  shortcut: "/images/favicon/favicon.ico",
  apple: "/images/favicon/apple-touch-icon.png",
};

/** Root metadata: SEO, Open Graph, and Twitter cards for link unfurling. */
export function buildSiteMetadata(): Metadata {
  const siteUrl = getSiteUrl();

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: SITE_NAME,
      template: `%s · ${SITE_SHORT_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_SHORT_NAME,
    keywords: SITE_KEYWORDS,
    authors: [{ name: "333 Motorsport" }],
    creator: "333 Motorsport",
    publisher: "333 Motorsport",
    category: "business",
    alternates: {
      canonical: "/",
    },
    openGraph: {
      type: "website",
      locale: "en_AU",
      url: siteUrl,
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
    },
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
    icons: faviconIcons,
    manifest: "/images/favicon/site.webmanifest",
    other: {
      "apple-mobile-web-app-title": SITE_SHORT_NAME,
    },
  };
}

export function buildWebsiteJsonLd() {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: SITE_SHORT_NAME,
    description: SITE_DESCRIPTION,
    url: siteUrl,
    inLanguage: "en-AU",
    publisher: {
      "@type": "Organization",
      name: "333 Motorsport",
    },
  };
}

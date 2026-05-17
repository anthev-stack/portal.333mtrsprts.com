import { Cormorant, Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteJsonLd } from "@/components/site-json-ld";
import { buildSiteMetadata } from "@/lib/site-metadata";

const cormorant = Cormorant({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-heading",
  display: "swap",
});

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = buildSiteMetadata();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${cormorant.variable} ${roboto.variable} ${robotoMono.variable} h-full font-sans antialiased`}
    >
      <body className="min-h-dvh font-sans">
        <SiteJsonLd />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

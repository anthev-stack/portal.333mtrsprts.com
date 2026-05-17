import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: "Sign in",
  description: SITE_DESCRIPTION,
  openGraph: {
    title: `Sign in · ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    title: `Sign in · ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

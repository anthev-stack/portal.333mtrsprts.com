"use client";

import { usePathname } from "next/navigation";

/** Mail uses full main width so labels can sit in the side gutter; inner content stays max-w-5xl like other pages. */
export function PortalMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const mailFullWidth = pathname === "/mail";

  if (mailFullWidth) {
    return (
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="min-w-0 flex-1 p-4 md:p-8">{children}</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-8">{children}</div>
    </main>
  );
}

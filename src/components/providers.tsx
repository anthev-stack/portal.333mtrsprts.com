"use client";

import { AppThemeProvider } from "@/components/theme/app-theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <AppThemeProvider>
        {children}
        <Toaster richColors position="top-center" />
      </AppThemeProvider>
    </TooltipProvider>
  );
}

import { cn } from "@/lib/utils";

export function PortalLogo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-bold tracking-tight shadow-sm",
        className,
      )}
      aria-hidden
    >
      333
    </div>
  );
}

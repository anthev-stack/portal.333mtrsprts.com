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

export function PortalThemeLogo({
  className,
  imgClassName,
}: {
  className?: string;
  imgClassName?: string;
}) {
  const img = cn(
    "h-auto w-auto max-h-7 max-w-[min(28vw,140px)] object-contain object-left",
    imgClassName,
  );
  return (
    <span
      className={cn(
        "inline-flex h-9 shrink-0 items-center justify-center px-0.5",
        className,
      )}
    >
      <img
        src="/images/logo-black.png"
        alt=""
        width={140}
        height={40}
        className={cn(img, "dark:hidden")}
      />
      <img
        src="/images/logo-white.png"
        alt=""
        width={140}
        height={40}
        className={cn(img, "hidden dark:block")}
      />
    </span>
  );
}

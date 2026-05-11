"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { useAppTheme } from "@/components/theme/app-theme-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PortalSidebar } from "@/components/portal/sidebar";
import { SearchCommand } from "@/components/portal/search-command";

type Me = {
  name: string;
  imageUrl: string | null;
  internalEmail: string;
  role: "STAFF" | "ADMIN";
};

export function PortalTopBar({ initialMe }: { initialMe: Me | null }) {
  const router = useRouter();
  const { theme, setTheme } = useAppTheme();
  const [me, setMe] = useState<Me | null>(initialMe);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setMe(initialMe);
  }, [initialMe]);

  useEffect(() => {
    if (initialMe) return;
    void (async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { user: Me };
      setMe(data.user);
    })();
  }, [initialMe]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const initials =
    me?.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "?";

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
            <span className="sr-only">Open navigation</span>
          </Button>
          <SheetContent side="left" className="w-72 p-0">
            {me && (
              <PortalSidebar
                role={me.role}
                onNavigate={() => setMobileOpen(false)}
              />
            )}
          </SheetContent>
        </Sheet>

        <Button
          variant="outline"
          className="hidden h-9 flex-1 items-center justify-start gap-2 text-muted-foreground md:flex md:max-w-md"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="size-4" />
          Search
          <kbd className="pointer-events-none ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline">
            ⌘K
          </kbd>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="size-5" />
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="size-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "default" }),
                "h-9 gap-2 px-2",
              )}
            >
              <Avatar className="size-8">
                <AvatarImage
                  key={me?.imageUrl ?? "no-photo"}
                  src={
                    me?.imageUrl && me.imageUrl.trim().length > 0
                      ? me.imageUrl.trim()
                      : undefined
                  }
                  alt=""
                />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium lg:inline">
                {me?.name ?? "Account"}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => void logout()}>
                <LogOut className="mr-2 size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

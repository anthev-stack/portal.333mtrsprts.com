"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/home";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ internalEmail: email, password }),
      });
      const raw = await res.text();
      let data: { error?: string } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as { error?: string };
        } catch {
          /* not JSON (e.g. HTML error page) */
        }
      }
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" && data.error.trim()
            ? data.error.trim()
            : `Could not sign in (HTTP ${res.status}).`,
        );
        return;
      }
      router.replace(next.startsWith("/") ? next : "/home");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-background to-muted/40 p-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="mb-8 flex w-full flex-col items-center gap-4 text-center">
          <div className="flex h-20 w-full max-w-[220px] items-center justify-center">
            <img
              src="/images/logo-black.png"
              alt=""
              className="mx-auto max-h-20 w-auto max-w-full object-contain dark:hidden"
              width={220}
              height={80}
            />
            <img
              src="/images/logo-white.png"
              alt=""
              className="mx-auto hidden max-h-20 w-auto max-w-full object-contain dark:block"
              width={220}
              height={80}
            />
          </div>
          <div className="flex w-full justify-center px-2">
            <p className="m-0 max-w-full text-center text-5xl font-semibold leading-none tracking-tight sm:text-6xl md:text-7xl">
              MOTORSPORTS
            </p>
          </div>
        </div>
        <Card className="border-border/80 shadow-lg shadow-black/5">
          <CardHeader className="items-center space-y-2 text-center">
            <CardTitle className="text-xl font-semibold tracking-tight">
              STAFF PORTAL
            </CardTitle>
            <CardDescription>
              Sign in with your internal work email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@333mtrsprts.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Contact an administrator if you need help accessing your account. Internal use only.
        </p>
      </motion.div>
    </div>
  );
}

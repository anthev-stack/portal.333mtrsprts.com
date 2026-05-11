import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { COOKIE_NAME, signSessionToken } from "@/lib/jwt";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  internalEmail: z.string().email().min(3),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limited = rateLimit(`login:${ip}`, 20, 15 * 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil(limited.retryAfterMs / 1000)) },
      },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = parsed.data.internalEmail.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { internalEmail: email },
  });
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  let token: string;
  try {
    token = await signSessionToken({
      sub: user.id,
      role: user.role,
      internalEmail: user.internalEmail,
    });
  } catch (e) {
    console.error("login signSessionToken", e);
    const msg = e instanceof Error ? e.message : "Could not create session";
    return NextResponse.json(
      {
        error:
          msg.includes("JWT_SECRET") || msg.includes("32")
            ? "Server misconfigured: set JWT_SECRET (32+ characters) in .env or .env.local"
            : "Could not create session. Try again or contact an administrator.",
      },
      { status: 500 },
    );
  }

  const res = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      internalEmail: user.internalEmail,
    },
  });

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}

import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { COOKIE_NAME, verifySessionToken } from "@/lib/jwt";

export type SessionUser = {
  id: string;
  role: Role;
  internalEmail: string;
};

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  return {
    id: payload.sub,
    role: payload.role,
    internalEmail: payload.internalEmail,
  };
}

import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { AccountStatus } from "@prisma/client";
import { COOKIE_NAME, verifySessionToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

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

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      role: true,
      internalEmail: true,
      accountStatus: true,
    },
  });
  if (!user || user.accountStatus !== AccountStatus.ACTIVE) {
    return null;
  }

  return {
    id: user.id,
    role: user.role,
    internalEmail: user.internalEmail,
  };
}

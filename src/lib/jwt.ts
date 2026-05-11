import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

const COOKIE_NAME = "portal_session";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string;
  role: Role;
  internalEmail: string;
};

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    role: payload.role,
    internalEmail: payload.internalEmail,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES ?? "7d")
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const sub = payload.sub;
    const role = payload.role as Role | undefined;
    const internalEmail = payload.internalEmail as string | undefined;
    if (!sub || !role || !internalEmail) return null;
    return { sub, role, internalEmail };
  } catch {
    return null;
  }
}

export { COOKIE_NAME };

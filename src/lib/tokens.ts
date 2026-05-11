import { createHash, randomBytes } from "crypto";

export function generatePlainToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

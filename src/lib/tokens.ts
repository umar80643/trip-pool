import { randomBytes } from "crypto";

/**
 * A high-entropy, URL-safe token for anything where the token itself is the
 * only thing standing between a stranger and access or account control —
 * invite links, password resets, email verification. Deliberately not using
 * Prisma's default cuid() for these: a cuid is a collision-resistant
 * identifier (it embeds a timestamp/counter/host fingerprint), not a secret
 * designed to resist guessing — fine for a primary key, not for a bearer
 * token.
 */
export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

/** @deprecated use generateSecureToken — kept as an alias so existing call sites don't need to change. */
export const generateInviteToken = generateSecureToken;

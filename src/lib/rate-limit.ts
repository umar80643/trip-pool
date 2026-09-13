/**
 * A minimal in-memory rate limiter for auth-sensitive endpoints (login,
 * signup, invite acceptance) where brute-forcing or credential stuffing is
 * the main risk. Intentionally simple: a fixed-window counter per key.
 *
 * Known limitation: state lives in this process's memory, so it resets on
 * restart and isn't shared across multiple server instances. That's fine
 * for a single-node deployment (this app's custom server is already
 * single-instance — see src/server/dev-server.js) but if you scale out
 * horizontally, swap this for a shared store (Redis `INCR` + `EXPIRE` is
 * the standard approach) so limits apply across all instances.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

// Avoid unbounded memory growth from unique keys (e.g. many distinct IPs).
const MAX_TRACKED_KEYS = 50_000;

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

/** Best-effort client IP from standard proxy headers, falling back to a constant so unattributable requests still share one (conservative) bucket. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

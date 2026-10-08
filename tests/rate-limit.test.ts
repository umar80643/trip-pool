import { describe, it, expect, vi, afterEach } from "vitest";
import { rateLimit, clientIp } from "@/lib/rate-limit";

describe("rateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit, then blocks", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).allowed).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    const key = `test-${Math.random()}`;
    expect(rateLimit(key, 1, 1000).allowed).toBe(true);
    expect(rateLimit(key, 1, 1000).allowed).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rateLimit(key, 1, 1000).allowed).toBe(true);
  });

  it("tracks independent keys separately", () => {
    expect(rateLimit("a", 1, 60_000).allowed).toBe(true);
    expect(rateLimit("b", 1, 60_000).allowed).toBe(true);
    expect(rateLimit("a", 1, 60_000).allowed).toBe(false);
  });
});

describe("clientIp", () => {
  it("takes the first address from x-forwarded-for", () => {
    const req = new Request("https://example.com", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    const withRealIp = new Request("https://example.com", { headers: { "x-real-ip": "9.9.9.9" } });
    expect(clientIp(withRealIp)).toBe("9.9.9.9");

    const withNeither = new Request("https://example.com");
    expect(clientIp(withNeither)).toBe("unknown");
  });
});

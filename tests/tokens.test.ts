import { describe, it, expect } from "vitest";
import { generateSecureToken } from "@/lib/tokens";

describe("generateSecureToken", () => {
  it("produces a URL-safe string (no +, /, or = padding)", () => {
    const token = generateSecureToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("has enough length to reflect 32 bytes of entropy", () => {
    // base64url of 32 bytes is 43 chars (no padding).
    expect(generateSecureToken().length).toBe(43);
  });

  it("is different on every call", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSecureToken()));
    expect(tokens.size).toBe(100);
  });
});

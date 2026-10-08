import { describe, it, expect } from "vitest";
import { isPollClosed } from "@/lib/polls";

const NOW = new Date("2026-06-10T12:00:00.000Z");

describe("isPollClosed", () => {
  it("is open when neither closedAt nor closesAt is set", () => {
    expect(isPollClosed({ closedAt: null, closesAt: null }, NOW)).toBe(false);
  });

  it("is closed once manually closed, regardless of closesAt", () => {
    expect(isPollClosed({ closedAt: NOW, closesAt: null }, NOW)).toBe(true);
  });

  it("is closed once the scheduled closesAt has passed", () => {
    expect(isPollClosed({ closedAt: null, closesAt: new Date("2026-06-10T11:00:00.000Z") }, NOW)).toBe(true);
  });

  it("is still open before the scheduled closesAt", () => {
    expect(isPollClosed({ closedAt: null, closesAt: new Date("2026-06-10T13:00:00.000Z") }, NOW)).toBe(false);
  });

  it("treats closesAt exactly equal to now as closed", () => {
    expect(isPollClosed({ closedAt: null, closesAt: NOW }, NOW)).toBe(true);
  });

  it("accepts closesAt/closedAt as ISO strings, not just Date objects", () => {
    expect(isPollClosed({ closedAt: null, closesAt: "2026-06-10T11:00:00.000Z" }, NOW)).toBe(true);
  });
});

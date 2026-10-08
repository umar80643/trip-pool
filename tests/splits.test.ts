import { describe, it, expect } from "vitest";
import { computeSplits } from "@/lib/splits";

describe("computeSplits", () => {
  it("equal split of $10 among 3 people sums exactly and distributes the odd cent", () => {
    const result = computeSplits(1000, "equal", [
      { userId: "a" },
      { userId: "b" },
      { userId: "c" },
    ]);
    expect(result.reduce((a, s) => a + s.amountCents, 0)).toBe(1000);
    expect(result.map((r) => r.amountCents)).toEqual([334, 333, 333]);
  });

  it("exact split must sum to the total", () => {
    expect(() =>
      computeSplits(1000, "exact", [
        { userId: "a", value: 400 },
        { userId: "b", value: 400 },
      ])
    ).toThrow(/must sum to the expense total/);

    const ok = computeSplits(1000, "exact", [
      { userId: "a", value: 700 },
      { userId: "b", value: 300 },
    ]);
    expect(ok).toEqual([
      { userId: "a", amountCents: 700 },
      { userId: "b", amountCents: 300 },
    ]);
  });

  it("percentage split allocates leftover cents fairly and sums exactly", () => {
    // 33.33 / 33.33 / 33.34 on $10.00 -> should still sum to 1000
    const result = computeSplits(1000, "percentage", [
      { userId: "a", value: 33.33 },
      { userId: "b", value: 33.33 },
      { userId: "c", value: 33.34 },
    ]);
    expect(result.reduce((a, s) => a + s.amountCents, 0)).toBe(1000);
  });

  it("rejects percentages that don't sum to 100", () => {
    expect(() =>
      computeSplits(1000, "percentage", [
        { userId: "a", value: 50 },
        { userId: "b", value: 40 },
      ])
    ).toThrow(/must sum to 100/);
  });

  it("shares split of 2:1:1 gives the double-share person roughly double", () => {
    const result = computeSplits(1200, "shares", [
      { userId: "a", value: 2 },
      { userId: "b", value: 1 },
      { userId: "c", value: 1 },
    ]);
    expect(result.reduce((a, s) => a + s.amountCents, 0)).toBe(1200);
    const byId = Object.fromEntries(result.map((r) => [r.userId, r.amountCents]));
    expect(byId.a).toBe(600);
    expect(byId.b).toBe(300);
    expect(byId.c).toBe(300);
  });

  it("rejects a non-positive total", () => {
    expect(() => computeSplits(0, "equal", [{ userId: "a" }])).toThrow();
    expect(() => computeSplits(-100, "equal", [{ userId: "a" }])).toThrow();
  });

  it("rejects an empty participant list", () => {
    expect(() => computeSplits(1000, "equal", [])).toThrow(/at least one participant/);
  });
});

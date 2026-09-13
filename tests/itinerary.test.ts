import { describe, it, expect } from "vitest";
import { dateKey, tripDays, nextOrder, InvalidDateRangeError } from "@/lib/itinerary";

describe("dateKey", () => {
  it("formats a date as YYYY-MM-DD in UTC", () => {
    expect(dateKey(new Date("2026-06-09T23:30:00.000Z"))).toBe("2026-06-09");
  });
});

describe("tripDays", () => {
  it("returns a single day when start equals end", () => {
    expect(tripDays(new Date("2026-06-09"), new Date("2026-06-09"))).toEqual(["2026-06-09"]);
  });

  it("returns every calendar day inclusive of both ends", () => {
    expect(tripDays(new Date("2026-06-09"), new Date("2026-06-12"))).toEqual([
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
    ]);
  });

  it("handles a range spanning a month boundary", () => {
    expect(tripDays(new Date("2026-06-29"), new Date("2026-07-02"))).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
    ]);
  });

  it("throws InvalidDateRangeError when end is before start", () => {
    expect(() => tripDays(new Date("2026-06-12"), new Date("2026-06-09"))).toThrow(InvalidDateRangeError);
  });

  it("throws InvalidDateRangeError for an implausibly long range", () => {
    expect(() => tripDays(new Date("2026-01-01"), new Date("2028-01-01"))).toThrow(InvalidDateRangeError);
  });
});

describe("nextOrder", () => {
  it("returns 0 for an empty day", () => {
    expect(nextOrder([])).toBe(0);
  });

  it("returns one past the current max", () => {
    expect(nextOrder([0, 1, 2])).toBe(3);
  });

  it("handles out-of-order input", () => {
    expect(nextOrder([5, 1, 3])).toBe(6);
  });
});

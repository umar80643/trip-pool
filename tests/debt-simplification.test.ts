import { describe, it, expect } from "vitest";
import {
  simplifyDebts,
  assertValidBalances,
  BalanceSumError,
  computeBalances,
  computeDetailedDebts,
  Balance,
} from "@/lib/debt-simplification";
import { distributeEqually, distributeByWeights, dollarsToCents, centsToDollars } from "@/lib/money";

function sumSettlements(userId: string, settlements: { from: string; to: string; amountCents: number }[]) {
  let net = 0;
  for (const s of settlements) {
    if (s.from === userId) net -= s.amountCents;
    if (s.to === userId) net += s.amountCents;
  }
  return net;
}

describe("simplifyDebts", () => {
  it("returns no settlements when all balances are zero", () => {
    const balances: Balance[] = [
      { userId: "a", amountCents: 0 },
      { userId: "b", amountCents: 0 },
      { userId: "c", amountCents: 0 },
    ];
    expect(simplifyDebts(balances)).toEqual([]);
  });

  it("returns no settlements for an empty group", () => {
    expect(simplifyDebts([])).toEqual([]);
  });

  it("handles one creditor, multiple debtors", () => {
    // a is owed 100, b and c each owe 50
    const balances: Balance[] = [
      { userId: "a", amountCents: 10000 },
      { userId: "b", amountCents: -5000 },
      { userId: "c", amountCents: -5000 },
    ];
    const settlements = simplifyDebts(balances);
    expect(settlements).toHaveLength(2);
    expect(settlements.every((s) => s.to === "a")).toBe(true);
    expect(sumSettlements("a", settlements)).toBe(10000);
    expect(sumSettlements("b", settlements)).toBe(-5000);
    expect(sumSettlements("c", settlements)).toBe(-5000);
  });

  it("handles one debtor, multiple creditors", () => {
    // a owes 100 total, split between b (owed 70) and c (owed 30)
    const balances: Balance[] = [
      { userId: "a", amountCents: -10000 },
      { userId: "b", amountCents: 7000 },
      { userId: "c", amountCents: 3000 },
    ];
    const settlements = simplifyDebts(balances);
    expect(settlements).toHaveLength(2);
    expect(settlements.every((s) => s.from === "a")).toBe(true);
    expect(sumSettlements("a", settlements)).toBe(-10000);
    expect(sumSettlements("b", settlements)).toBe(7000);
    expect(sumSettlements("c", settlements)).toBe(3000);
  });

  it("throws BalanceSumError when balances don't sum to zero", () => {
    const balances: Balance[] = [
      { userId: "a", amountCents: 10000 },
      { userId: "b", amountCents: -5000 }, // missing 5000 somewhere — bug upstream
    ];
    expect(() => simplifyDebts(balances)).toThrow(BalanceSumError);
    expect(() => assertValidBalances(balances)).toThrow(/sum to zero/);
  });

  it("throws when a balance is not an integer number of cents", () => {
    const balances: Balance[] = [
      { userId: "a", amountCents: 100.5 },
      { userId: "b", amountCents: -100.5 },
    ];
    expect(() => simplifyDebts(balances)).toThrow(/integer number of cents/);
  });

  it("ignores members who are already settled (zero balance)", () => {
    const balances: Balance[] = [
      { userId: "a", amountCents: 5000 },
      { userId: "b", amountCents: -5000 },
      { userId: "settled", amountCents: 0 },
    ];
    const settlements = simplifyDebts(balances);
    expect(settlements).toEqual([{ from: "b", to: "a", amountCents: 5000 }]);
  });

  it("produces at most n-1 settlements for a larger group with exact amounts", () => {
    // 6 people, balances chosen to sum to zero exactly.
    const balances: Balance[] = [
      { userId: "u1", amountCents: 12345 },
      { userId: "u2", amountCents: 6789 },
      { userId: "u3", amountCents: -2000 },
      { userId: "u4", amountCents: -9000 },
      { userId: "u5", amountCents: -4134 },
      { userId: "u6", amountCents: -4000 },
    ];
    const total = balances.reduce((a, b) => a + b.amountCents, 0);
    expect(total).toBe(0);

    const settlements = simplifyDebts(balances);
    expect(settlements.length).toBeLessThanOrEqual(balances.length - 1);

    // Verify every member nets out to their original balance.
    for (const b of balances) {
      expect(sumSettlements(b.userId, settlements)).toBe(b.amountCents);
    }
  });

  it("stress test: random balances (10+ people) always net out and use <= n-1 settlements", () => {
    for (let trial = 0; trial < 25; trial++) {
      const n = 10 + Math.floor(Math.random() * 6); // 10-15 people
      const raw = Array.from({ length: n }, () => Math.floor(Math.random() * 20000) - 10000);
      // Force the last entry to make the sum exactly zero.
      const sumSoFar = raw.slice(0, -1).reduce((a, b) => a + b, 0);
      raw[n - 1] = -sumSoFar;

      const balances: Balance[] = raw.map((amountCents, i) => ({ userId: `u${i}`, amountCents }));
      const settlements = simplifyDebts(balances);

      const nonZero = balances.filter((b) => b.amountCents !== 0).length;
      expect(settlements.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));

      for (const b of balances) {
        expect(sumSettlements(b.userId, settlements)).toBe(b.amountCents);
      }

      // No settlement should ever be zero or negative.
      for (const s of settlements) {
        expect(s.amountCents).toBeGreaterThan(0);
      }
    }
  });

  it("handles a single pair (classic two-person split)", () => {
    const balances: Balance[] = [
      { userId: "a", amountCents: 2500 },
      { userId: "b", amountCents: -2500 },
    ];
    expect(simplifyDebts(balances)).toEqual([{ from: "b", to: "a", amountCents: 2500 }]);
  });
});

describe("computeBalances", () => {
  it("nets paid vs owed vs confirmed settlements", () => {
    const balances = computeBalances({
      userIds: ["a", "b", "c"],
      expenses: [{ paidById: "a", amountCents: 3000 }],
      splits: [
        { userId: "a", amountCents: 1000 },
        { userId: "b", amountCents: 1000 },
        { userId: "c", amountCents: 1000 },
      ],
      settlements: [
        { fromUserId: "b", toUserId: "a", amountCents: 1000, settledAt: new Date() },
        // unsettled — should be ignored
        { fromUserId: "c", toUserId: "a", amountCents: 1000, settledAt: null },
      ],
    });

    const byId = Object.fromEntries(balances.map((b) => [b.userId, b.amountCents]));
    // a: paid 3000 (+3000), owes 1000 (-1000), then received a confirmed
    // settlement of 1000 from b, which reduces what a is still owed (-1000)
    // -> net = 3000 - 1000 - 1000 = 1000
    expect(byId.a).toBe(1000);
    // b: owes 1000 (-1000), then pays the confirmed settlement of 1000,
    // which reduces b's debt (+1000) -> net = -1000 + 1000 = 0
    expect(byId.b).toBe(0);
    // c: owes 1000, unsettled payment ignored -> net = -1000
    expect(byId.c).toBe(-1000);

    // Sanity: whatever computeBalances produces must still satisfy the
    // invariant simplifyDebts requires (sum to zero) given a closed ledger
    // of confirmed settlements only affecting two parties symmetrically.
    expect(byId.a + byId.b + byId.c).toBe(0);
  });
});

describe("computeDetailedDebts", () => {
  it("excludes the payer's own split and non-positive splits", () => {
    const debts = computeDetailedDebts({
      expenses: [{ id: "e1", paidById: "a", description: "Dinner" }],
      splits: [
        { expenseId: "e1", userId: "a", amountCents: 1000 },
        { expenseId: "e1", userId: "b", amountCents: 1000 },
        { expenseId: "e1", userId: "c", amountCents: 0 },
      ],
    });
    expect(debts).toEqual([
      { from: "b", to: "a", amountCents: 1000, expenseId: "e1", description: "Dinner" },
    ]);
  });
});

describe("money helpers", () => {
  it("distributes an equal split without losing or gaining cents", () => {
    const parts = distributeEqually(1000, 3); // $10.00 / 3
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });

  it("distributes weighted splits (shares) exactly", () => {
    // $10.00 split 2:1:1
    const parts = distributeByWeights(1000, [2, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts[0]).toBeGreaterThanOrEqual(parts[1]);
  });

  it("round-trips dollars <-> cents", () => {
    expect(dollarsToCents("12.34")).toBe(1234);
    expect(dollarsToCents(0.1)).toBe(10);
    expect(centsToDollars(1234)).toBe("12.34");
    expect(centsToDollars(-1234)).toBe("-12.34");
    expect(centsToDollars(5)).toBe("0.05");
  });
});

import { distributeByWeights, distributeEqually } from "./money";

export type SplitMode = "equal" | "exact" | "percentage" | "shares";

export type SplitParticipant = {
  userId: string;
  // meaning depends on mode:
  //  - equal:      ignored
  //  - exact:      amountCents the participant owes
  //  - percentage: 0-100 (all participants' percentages must sum to 100)
  //  - shares:     relative weight, e.g. 2 for someone eating 2x, 1 for others
  value?: number;
};

export type ComputedSplit = { userId: string; amountCents: number };

/**
 * Turns an expense total + a list of participants + a split mode into
 * per-user amountCents that sum EXACTLY to the expense total. This is the
 * only place split math should happen — always store the resulting
 * ExpenseSplit rows, never re-derive them from percentages at read time
 * (percentages of a since-edited expense would drift).
 */
export function computeSplits(
  totalCents: number,
  mode: SplitMode,
  participants: SplitParticipant[]
): ComputedSplit[] {
  if (participants.length === 0) {
    throw new Error("An expense must have at least one participant");
  }
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error("Expense amountCents must be a positive integer");
  }

  switch (mode) {
    case "equal": {
      const parts = distributeEqually(totalCents, participants.length);
      return participants.map((p, i) => ({ userId: p.userId, amountCents: parts[i] }));
    }

    case "exact": {
      const amounts = participants.map((p) => p.value ?? 0);
      if (amounts.some((a) => !Number.isInteger(a) || a < 0)) {
        throw new Error("Exact split amounts must be non-negative integer cents");
      }
      const sum = amounts.reduce((a, b) => a + b, 0);
      if (sum !== totalCents) {
        throw new Error(
          `Exact split amounts (${sum}) must sum to the expense total (${totalCents})`
        );
      }
      return participants.map((p, i) => ({ userId: p.userId, amountCents: amounts[i] }));
    }

    case "percentage": {
      const pcts = participants.map((p) => p.value ?? 0);
      const sum = pcts.reduce((a, b) => a + b, 0);
      // Allow tiny float slop from UI input (e.g. 33.33 * 3 = 99.99) but
      // require it to round to 100 within a hundredth of a percent.
      if (Math.abs(sum - 100) > 0.05) {
        throw new Error(`Percentages must sum to 100 (got ${sum})`);
      }
      const parts = distributeByWeights(totalCents, pcts);
      return participants.map((p, i) => ({ userId: p.userId, amountCents: parts[i] }));
    }

    case "shares": {
      const weights = participants.map((p) => p.value ?? 1);
      if (weights.some((w) => w <= 0)) {
        throw new Error("Shares must be positive numbers");
      }
      const parts = distributeByWeights(totalCents, weights);
      return participants.map((p, i) => ({ userId: p.userId, amountCents: parts[i] }));
    }

    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown split mode: ${_exhaustive}`);
    }
  }
}

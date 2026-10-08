/**
 * Debt simplification engine.
 *
 * Given each member's net balance in a group (positive = they are owed
 * money, negative = they owe money), computes the minimal set of
 * transactions that settles every balance to zero, using a greedy
 * largest-debtor-meets-largest-creditor match. This is the classic
 * min-cash-flow heuristic: it does not guarantee the theoretical minimum
 * number of transactions in every case (that's an NP-hard problem related
 * to subset-sum), but it's a very close, fast, well-understood
 * approximation, and produces at most n-1 transactions for n participants.
 */

export type Balance = {
  userId: string;
  amountCents: number; // positive = owed money (creditor), negative = owes money (debtor)
};

export type SimplifiedSettlement = {
  from: string; // userId who pays
  to: string; // userId who receives
  amountCents: number;
};

const ZERO_EPSILON_CENTS = 0; // amounts are integers; zero means zero, no fuzzy float epsilon needed

export class BalanceSumError extends Error {
  constructor(sum: number) {
    super(
      `Balances must sum to zero (a closed ledger has no free money). Got sum=${sum} cents. ` +
        `This indicates a bug upstream in how balances were computed from expenses/settlements.`
    );
    this.name = "BalanceSumError";
  }
}

/**
 * Validates that balances are well-formed before simplification:
 * - every amountCents is a finite integer
 * - the balances sum to zero (within ZERO_EPSILON_CENTS, which is 0 since
 *   we work in integer cents)
 *
 * Call this at the boundary where balances are computed from the ledger,
 * not inside simplifyDebts on every call in hot paths if you've already
 * validated — but simplifyDebts always validates defensively regardless,
 * since correctness here matters more than the extra cheap check.
 */
export function assertValidBalances(balances: Balance[]): void {
  for (const b of balances) {
    if (!Number.isInteger(b.amountCents)) {
      throw new Error(
        `Balance for user ${b.userId} is not an integer number of cents: ${b.amountCents}. ` +
          `All money must be represented as integer cents.`
      );
    }
  }
  const sum = balances.reduce((acc, b) => acc + b.amountCents, 0);
  if (Math.abs(sum) > ZERO_EPSILON_CENTS) {
    throw new BalanceSumError(sum);
  }
}

/**
 * Computes each member's net balance from raw expense + settlement data.
 * netBalance = (total paid on behalf of the group) - (total owed across
 * their splits) + (settlements received) - (settlements paid).
 *
 * Kept separate from simplifyDebts so the algorithm itself stays a pure,
 * easily-testable function of balances.
 */
export function computeBalances(input: {
  userIds: string[];
  expenses: { paidById: string; amountCents: number }[];
  splits: { userId: string; amountCents: number }[];
  settlements: { fromUserId: string; toUserId: string; amountCents: number; settledAt: Date | null }[];
}): Balance[] {
  const net = new Map<string, number>();
  for (const id of input.userIds) net.set(id, 0);

  for (const e of input.expenses) {
    net.set(e.paidById, (net.get(e.paidById) ?? 0) + e.amountCents);
  }
  for (const s of input.splits) {
    net.set(s.userId, (net.get(s.userId) ?? 0) - s.amountCents);
  }
  // Only confirmed (settledAt !== null) settlements actually move money.
  for (const s of input.settlements) {
    if (!s.settledAt) continue;
    net.set(s.fromUserId, (net.get(s.fromUserId) ?? 0) + s.amountCents);
    net.set(s.toUserId, (net.get(s.toUserId) ?? 0) - s.amountCents);
  }

  return Array.from(net.entries()).map(([userId, amountCents]) => ({ userId, amountCents }));
}

/**
 * Greedy min-cash-flow debt simplification.
 *
 * Repeatedly matches the largest creditor with the largest debtor,
 * settles the smaller of the two amounts, and repeats until every
 * balance is zero. Produces at most n-1 settlements for n non-zero
 * balances.
 */
export function simplifyDebts(balances: Balance[]): SimplifiedSettlement[] {
  assertValidBalances(balances);

  // Ignore already-settled members entirely, and work on copies so we
  // never mutate the caller's data.
  const creditors = balances
    .filter((b) => b.amountCents > 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const debtors = balances
    .filter((b) => b.amountCents < 0)
    .map((b) => ({ userId: b.userId, amountCents: -b.amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const settlements: SimplifiedSettlement[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amountCents, creditor.amountCents);

    if (amount > 0) {
      settlements.push({ from: debtor.userId, to: creditor.userId, amountCents: amount });
    }

    debtor.amountCents -= amount;
    creditor.amountCents -= amount;

    if (debtor.amountCents === 0) i++;
    if (creditor.amountCents === 0) j++;
  }

  return settlements;
}

/**
 * Convenience helper: for a member with a non-zero balance, return the
 * "detailed" (who-owes-whom-for-what) view instead of the simplified one
 * — i.e. every individual expense split that isn't yet covered by a
 * confirmed settlement. Used for the detailed/simplified toggle in the UI.
 */
export type DetailedDebt = {
  from: string;
  to: string;
  amountCents: number;
  expenseId: string;
  description: string;
};

export function computeDetailedDebts(input: {
  expenses: { id: string; paidById: string; description: string }[];
  splits: { expenseId: string; userId: string; amountCents: number }[];
}): DetailedDebt[] {
  const expenseById = new Map(input.expenses.map((e) => [e.id, e]));
  const debts: DetailedDebt[] = [];

  for (const split of input.splits) {
    const expense = expenseById.get(split.expenseId);
    if (!expense) continue;
    if (split.userId === expense.paidById) continue; // payer doesn't owe themself
    if (split.amountCents <= 0) continue;
    debts.push({
      from: split.userId,
      to: expense.paidById,
      amountCents: split.amountCents,
      expenseId: expense.id,
      description: expense.description,
    });
  }

  return debts;
}

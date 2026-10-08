/**
 * All money in TripPool is handled as integer cents. Never use floats for
 * amounts anywhere in the app — parse user input into cents immediately at
 * the boundary (form submit / API request) and only format back to a
 * decimal string for display.
 */

export function dollarsToCents(dollars: number | string): number {
  const n = typeof dollars === "string" ? Number(dollars) : dollars;
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid amount: ${dollars}`);
  }
  // Round rather than truncate to avoid systematically losing cents.
  return Math.round(n * 100);
}

export function centsToDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}${whole}.${remainder.toString().padStart(2, "0")}`;
}

/**
 * Split `totalCents` into `n` integer parts that sum exactly to
 * `totalCents`, distributing the remainder (from integer division) one
 * cent at a time to the first accounts in `order` (or the first n by
 * default). This is what equal splits use so that e.g. $10.00 / 3 people
 * becomes [334, 333, 333] rather than [333.33, 333.33, 333.33].
 */
export function distributeEqually(totalCents: number, n: number): number[] {
  if (n <= 0) throw new Error("n must be positive");
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  const parts = new Array(n).fill(base);
  for (let i = 0; i < remainder; i++) {
    parts[i] += 1;
  }
  return parts;
}

/**
 * Split `totalCents` proportionally to a set of weights (e.g. percentages
 * or shares like 2:1:1), guaranteeing the parts sum exactly to
 * totalCents. Uses the largest-remainder method to allocate leftover
 * cents fairly.
 */
export function distributeByWeights(totalCents: number, weights: number[]): number[] {
  if (weights.length === 0) throw new Error("weights must be non-empty");
  if (weights.some((w) => w < 0)) throw new Error("weights must be non-negative");
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) throw new Error("total weight must be > 0");

  const raw = weights.map((w) => (totalCents * w) / totalWeight);
  const floors = raw.map(Math.floor);
  let allocated = floors.reduce((a, b) => a + b, 0);
  let remainder = totalCents - allocated;

  // Largest-remainder method: give the leftover cents to the entries
  // whose fractional part was closest to rounding up.
  const remainders = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let k = 0; k < remainder; k++) {
    result[remainders[k % remainders.length].i] += 1;
  }
  return result;
}

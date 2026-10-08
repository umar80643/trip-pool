/**
 * A poll is closed if it was manually closed, or its scheduled close time
 * has passed. Kept as a pure function (rather than inline in the route) so
 * both the vote route and the list route agree on the same definition, and
 * so it's testable without a DB.
 */
export function isPollClosed(
  poll: { closedAt: Date | string | null; closesAt: Date | string | null },
  now: Date = new Date()
): boolean {
  if (poll.closedAt) return true;
  if (poll.closesAt && new Date(poll.closesAt) <= now) return true;
  return false;
}

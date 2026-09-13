/**
 * Pure helpers for the itinerary feature — kept separate from the API route
 * so the date-range and ordering logic can be unit tested without a DB.
 */

/** Normalizes a Date to a "YYYY-MM-DD" key, ignoring time-of-day and using UTC
 * so the same trip date lines up the same way regardless of server/browser
 * timezone (this app doesn't need per-timezone itinerary times, just "day 3"). */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class InvalidDateRangeError extends Error {}

/**
 * Returns one "YYYY-MM-DD" key per calendar day from start to end, inclusive.
 * Throws if end is before start, or the range is implausibly long (guards
 * against a fat-fingered year typo generating thousands of day tabs).
 */
export function tripDays(start: Date, end: Date): string[] {
  const startKey = dateKey(start);
  const endKey = dateKey(end);
  if (endKey < startKey) throw new InvalidDateRangeError("Trip end date can't be before the start date.");

  const days: string[] = [];
  const cursor = new Date(startKey + "T00:00:00.000Z");
  const endDate = new Date(endKey + "T00:00:00.000Z");
  const MAX_DAYS = 366;

  while (cursor <= endDate) {
    days.push(dateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (days.length > MAX_DAYS) throw new InvalidDateRangeError("Trip is too long (max 366 days).");
  }
  return days;
}

/** The sort position for a new item appended to the end of a day's list. */
export function nextOrder(existingOrders: number[]): number {
  return existingOrders.length === 0 ? 0 : Math.max(...existingOrders) + 1;
}

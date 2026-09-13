import { centsToDollars } from "./money";

export function formatMoney(cents: number, currency = "USD"): string {
  const abs = Math.abs(cents);
  const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency });
  const value = formatter.format(abs / 100);
  return cents < 0 ? `-${value}` : value;
}

export function formatMoneyFromString(cents: number): string {
  return centsToDollars(cents);
}

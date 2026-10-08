"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { formatMoney } from "@/lib/format";
import { useGroupRealtime } from "@/lib/socket-client";

type PersonRef = { id: string; name: string; avatarUrl: string | null } | undefined;

type BalancesResponse = {
  balances: { userId: string; amountCents: number; user: PersonRef }[];
  simplified: { from: string; to: string; amountCents: number; fromUser: PersonRef; toUser: PersonRef }[];
  detailed: {
    from: string;
    to: string;
    amountCents: number;
    expenseId: string;
    description: string;
    fromUser: PersonRef;
    toUser: PersonRef;
  }[];
};

type Settlement = {
  id: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  settledAt: string | null;
  fromUser: { id: string; name: string };
  toUser: { id: string; name: string };
};

export function BalancesView({
  groupId,
  currency,
  onChanged,
}: {
  groupId: string;
  currency: string;
  onChanged?: () => void;
}) {
  const { data: session } = useSession();
  const [data, setData] = useState<BalancesResponse | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [view, setView] = useState<"simplified" | "detailed">("simplified");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [balancesRes, settlementsRes] = await Promise.all([
      fetch(`/api/groups/${groupId}/balances`),
      fetch(`/api/groups/${groupId}/settlements`),
    ]);
    if (balancesRes.ok) setData(await balancesRes.json());
    if (settlementsRes.ok) setSettlements((await settlementsRes.json()).settlements);
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  useGroupRealtime(groupId, {
    "settlement:created": () => load(),
    "settlement:confirmed": () => load(),
    "settlement:deleted": () => load(),
    "expense:created": () => load(),
    "expense:updated": () => load(),
    "expense:deleted": () => load(),
  });

  async function recordPayment(from: string, to: string, amountCents: number) {
    await fetch(`/api/groups/${groupId}/settlements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromUserId: from, toUserId: to, amountCents }),
    });
    load();
    onChanged?.();
  }

  async function confirmSettlement(id: string) {
    await fetch(`/api/groups/${groupId}/settlements/${id}`, { method: "PATCH" });
    load();
    onChanged?.();
  }

  if (loading) return <p className="text-ink/60">Loading…</p>;
  if (!data) return <p className="tag-negative">Couldn&apos;t load balances.</p>;

  const myId = session?.user?.id;
  const pendingForMe = settlements.filter((s) => !s.settledAt && s.toUserId === myId);

  return (
    <div className="space-y-6">
      {pendingForMe.length > 0 && (
        <div className="card p-4 border-wheat bg-wheat/10 space-y-2">
          <p className="font-medium text-sm">Awaiting your confirmation</p>
          {pendingForMe.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span>
                {s.fromUser.name} says they paid you {formatMoney(s.amountCents, currency)}
              </span>
              <button className="btn-primary text-xs" onClick={() => confirmSettlement(s.id)}>
                Confirm received
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <h3 className="font-medium mb-2">Net balances</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.balances
            .filter((b) => b.amountCents !== 0)
            .map((b) => (
              <div key={b.userId} className="card p-3 flex items-center justify-between">
                <span>{b.user?.name ?? "Unknown"}</span>
                <span className={b.amountCents >= 0 ? "tag-positive" : "tag-negative"}>
                  {b.amountCents >= 0
                    ? `is owed ${formatMoney(b.amountCents, currency)}`
                    : `owes ${formatMoney(-b.amountCents, currency)}`}
                </span>
              </div>
            ))}
          {data.balances.every((b) => b.amountCents === 0) && (
            <p className="text-ink/60 col-span-2">Everyone is settled up. 🎉</p>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">Settle up</h3>
          <div className="flex gap-2 text-sm">
            <button
              className={`px-2 py-1 rounded-sm border ${
                view === "simplified" ? "bg-moss text-paper border-moss" : "border-line text-ink/70"
              }`}
              onClick={() => setView("simplified")}
            >
              Simplified
            </button>
            <button
              className={`px-2 py-1 rounded-sm border ${
                view === "detailed" ? "bg-moss text-paper border-moss" : "border-line text-ink/70"
              }`}
              onClick={() => setView("detailed")}
            >
              Detailed
            </button>
          </div>
        </div>

        {view === "simplified" ? (
          <div className="space-y-2">
            {data.simplified.length === 0 && <p className="text-ink/60">Nothing to settle.</p>}
            {data.simplified.map((s, i) => (
              <div key={i} className="card p-3 flex items-center justify-between">
                <span>
                  <strong>{s.fromUser?.name}</strong> owes <strong>{s.toUser?.name}</strong>
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-display font-semibold">{formatMoney(s.amountCents, currency)}</span>
                  {s.from === myId && (
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => recordPayment(s.from, s.to, s.amountCents)}
                    >
                      Mark as paid
                    </button>
                  )}
                </div>
              </div>
            ))}
            <p className="text-xs text-ink/50">
              {data.simplified.length} transaction{data.simplified.length !== 1 ? "s" : ""} needed to settle
              everyone up — computed by netting all balances and greedily matching the largest debtor with
              the largest creditor.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.detailed.length === 0 && <p className="text-ink/60">No unpaid expense splits.</p>}
            {data.detailed.map((d, i) => (
              <div key={i} className="card p-3 flex items-center justify-between text-sm">
                <span>
                  <strong>{d.fromUser?.name}</strong> owes <strong>{d.toUser?.name}</strong> for{" "}
                  <em>{d.description}</em>
                </span>
                <span className="font-display font-semibold">{formatMoney(d.amountCents, currency)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {settlements.filter((s) => s.settledAt).length > 0 && (
        <div>
          <h3 className="font-medium mb-2">Settlement history</h3>
          <div className="space-y-1 text-sm text-ink/70">
            {settlements
              .filter((s) => s.settledAt)
              .map((s) => (
                <div key={s.id} className="flex items-center justify-between">
                  <span>
                    {s.fromUser.name} → {s.toUser.name}
                  </span>
                  <span>
                    {formatMoney(s.amountCents, currency)} · {new Date(s.settledAt!).toLocaleDateString()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

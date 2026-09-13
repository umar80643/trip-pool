"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { formatMoney } from "@/lib/format";
import { useGroupRealtime } from "@/lib/socket-client";
import { AddExpenseDialog } from "@/components/AddExpenseDialog";
import { InviteDialog } from "@/components/InviteDialog";
import { BalancesView } from "@/components/BalancesView";
import { MembersPanel } from "@/components/MembersPanel";
import { ExploreView } from "@/components/ExploreView";
import { ChatView } from "@/components/ChatView";
import { ItineraryView } from "@/components/ItineraryView";
import { PackingView } from "@/components/PackingView";

type Member = { userId: string; role: string; user: { id: string; name: string; avatarUrl: string | null; email?: string } };
type Group = {
  id: string;
  name: string;
  currency: string;
  members: Member[];
  destinationName: string | null;
  startDate: string | null;
  endDate: string | null;
};
type Expense = {
  id: string;
  amountCents: number;
  description: string;
  category: string;
  date: string;
  splitType: string;
  paidBy: { id: string; name: string };
  splits: { userId: string; amountCents: number; user: { id: string; name: string } }[];
};

type Tab = "itinerary" | "explore" | "packing" | "chat" | "expenses" | "balances" | "members";

export default function GroupPage({ params }: { params: { groupId: string } }) {
  const { data: session } = useSession();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [tab, setTab] = useState<Tab>("itinerary");
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<string | null>(null);

  const loadGroup = useCallback(async () => {
    const res = await fetch(`/api/groups/${params.groupId}`);
    if (res.ok) setGroup((await res.json()).group);
  }, [params.groupId]);

  const loadExpenses = useCallback(async () => {
    const res = await fetch(`/api/groups/${params.groupId}/expenses`);
    if (res.ok) setExpenses((await res.json()).expenses);
  }, [params.groupId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadGroup(), loadExpenses()]).finally(() => setLoading(false));
  }, [loadGroup, loadExpenses]);

  useGroupRealtime(params.groupId, {
    "expense:created": () => loadExpenses(),
    "expense:updated": () => loadExpenses(),
    "expense:deleted": () => loadExpenses(),
    "member:joined": () => loadGroup(),
    "member:removed": () => loadGroup(),
    "group:updated": () => loadGroup(),
    activity: (payload: { userName: string; action: string }) => {
      setActivity(`${payload.userName} ${payload.action}`);
      setTimeout(() => setActivity(null), 3000);
    },
  });

  async function deleteExpense(id: string) {
    if (!confirm("Delete this expense?")) return;
    await fetch(`/api/groups/${params.groupId}/expenses/${id}`, { method: "DELETE" });
    loadExpenses();
  }

  if (loading) return <p className="text-ink/60">Loading…</p>;
  if (!group) return <p className="tag-negative">Group not found, or you don&apos;t have access.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{group.name}</h1>
          <p className="text-sm text-ink/60">
            {group.members.length} member{group.members.length !== 1 ? "s" : ""} · {group.currency}
            {group.destinationName ? ` · ${group.destinationName}` : ""}
            {group.startDate && group.endDate
              ? ` · ${new Date(group.startDate).toLocaleDateString()} – ${new Date(group.endDate).toLocaleDateString()}`
              : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowInvite(true)}>
            Invite
          </button>
          <button className="btn-primary" onClick={() => setShowAddExpense(true)}>
            + Add expense
          </button>
        </div>
      </div>

      {activity && <p className="text-xs text-ink/50 italic">{activity}</p>}

      <div className="border-b border-line flex gap-6 overflow-x-auto">
        {(["itinerary", "explore", "packing", "chat", "expenses", "balances", "members"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 whitespace-nowrap capitalize font-medium ${
              tab === t ? "border-b-2 border-moss text-moss" : "text-ink/50"
            }`}
          >
            {t === "balances" ? "Settle up" : t}
          </button>
        ))}
      </div>

      {tab === "itinerary" && (
        <ItineraryView
          groupId={params.groupId}
          startDate={group.startDate}
          endDate={group.endDate}
          onDatesChanged={loadGroup}
        />
      )}

      {tab === "explore" && (
        <ExploreView groupId={params.groupId} destinationName={group.destinationName} onDestinationChanged={loadGroup} />
      )}

      {tab === "chat" && <ChatView groupId={params.groupId} />}

      {tab === "packing" && <PackingView groupId={params.groupId} />}

      {tab === "expenses" && (
        <div className="space-y-2">
          {expenses.length === 0 && <p className="text-ink/60">No expenses yet. Add the first one.</p>}
          {expenses.map((e) => (
            <div key={e.id} className="card p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{e.description}</p>
                <p className="text-sm text-ink/60">
                  {e.category} · paid by {e.paidBy.name} · {new Date(e.date).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display font-semibold">{formatMoney(e.amountCents, group.currency)}</span>
                {(e.paidBy.id === session?.user?.id ||
                  group.members.find((m) => m.userId === session?.user?.id)?.role === "admin") && (
                  <button
                    className="text-sm text-clay hover:underline"
                    onClick={() => deleteExpense(e.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "balances" && <BalancesView groupId={params.groupId} currency={group.currency} onChanged={loadExpenses} />}

      {tab === "members" && <MembersPanel group={group} onChanged={loadGroup} />}

      {showAddExpense && (
        <AddExpenseDialog
          groupId={params.groupId}
          members={group.members}
          currentUserId={session?.user?.id ?? ""}
          onClose={() => setShowAddExpense(false)}
          onCreated={() => {
            setShowAddExpense(false);
            loadExpenses();
          }}
        />
      )}

      {showInvite && <InviteDialog groupId={params.groupId} onClose={() => setShowInvite(false)} />}
    </div>
  );
}

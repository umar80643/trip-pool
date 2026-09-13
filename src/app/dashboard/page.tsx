"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { formatMoney } from "@/lib/format";
import { NewGroupDialog } from "@/components/NewGroupDialog";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";

type Summary = {
  totalOwedToMeCents: number;
  totalIOweCents: number;
  perGroup: { groupId: string; groupName: string; netCents: number }[];
  spendByCategory: { category: string; amountCents: number }[];
  spendByMonth: { month: string; amountCents: number }[];
};

const CHART_COLORS = ["#2F4F3E", "#B5502F", "#E4C77E", "#7A8B99", "#9C6B4F", "#5C7A6B"];

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewGroup, setShowNewGroup] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/dashboard/summary");
    if (res.ok) setSummary(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-8">
      <EmailVerificationBanner />
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Your dashboard</h1>
        <button className="btn-primary" onClick={() => setShowNewGroup(true)}>
          + New group
        </button>
      </div>

      {loading && <p className="text-ink/60">Loading…</p>}

      {!loading && summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <p className="text-sm text-ink/60 mb-1">You are owed</p>
              <p className="text-2xl font-display font-semibold tag-positive">
                {formatMoney(summary.totalOwedToMeCents)}
              </p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-ink/60 mb-1">You owe</p>
              <p className="text-2xl font-display font-semibold tag-negative">
                {formatMoney(summary.totalIOweCents)}
              </p>
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg font-semibold mb-3">Your groups</h2>
            {summary.perGroup.length === 0 ? (
              <p className="text-ink/60">
                No groups yet.{" "}
                <button className="text-moss font-medium" onClick={() => setShowNewGroup(true)}>
                  Create one
                </button>
                .
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {summary.perGroup.map((g) => (
                  <Link
                    key={g.groupId}
                    href={`/groups/${g.groupId}`}
                    className="card p-4 flex items-center justify-between hover:border-moss transition-colors"
                  >
                    <span className="font-medium">{g.groupName}</span>
                    <span className={g.netCents >= 0 ? "tag-positive" : "tag-negative"}>
                      {g.netCents === 0 ? "settled up" : formatMoney(g.netCents)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {summary.spendByCategory.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card p-5">
                <h3 className="font-medium mb-3">Spend by category</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={summary.spendByCategory}
                      dataKey="amountCents"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(d) => d.category}
                    >
                      {summary.spendByCategory.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="card p-5">
                <h3 className="font-medium mb-3">Spend over time</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={summary.spendByMonth}>
                    <CartesianGrid stroke="#DCD4C7" strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Line type="monotone" dataKey="amountCents" stroke="#2F4F3E" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {showNewGroup && (
        <NewGroupDialog
          onClose={() => setShowNewGroup(false)}
          onCreated={() => {
            setShowNewGroup(false);
            load();
          }}
        />
      )}
    </div>
  );
}

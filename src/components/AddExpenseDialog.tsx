"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { dollarsToCents } from "@/lib/money";

type Member = { userId: string; user: { id: string; name: string } };
type SplitMode = "equal" | "exact" | "percentage" | "shares";

const CATEGORIES = ["General", "Food & Drink", "Transport", "Lodging", "Groceries", "Entertainment", "Utilities"];

export function AddExpenseDialog({
  groupId,
  members,
  currentUserId,
  onClose,
  onCreated,
}: {
  groupId: string;
  members: Member[];
  currentUserId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidById, setPaidById] = useState(currentUserId);
  const [splitType, setSplitType] = useState<SplitMode>("equal");
  const [included, setIncluded] = useState<Set<string>>(new Set(members.map((m) => m.userId)));
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleIncluded(userId: string) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const participantIds = members.map((m) => m.userId).filter((id) => included.has(id));
    if (participantIds.length === 0) {
      setError("Select at least one participant.");
      return;
    }

    let amountCents: number;
    try {
      amountCents = dollarsToCents(amount);
    } catch {
      setError("Enter a valid amount.");
      return;
    }
    if (amountCents <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }

    const participants = participantIds.map((userId) => {
      if (splitType === "equal") return { userId };
      if (splitType === "exact") return { userId, value: dollarsToCents(values[userId] || "0") };
      return { userId, value: Number(values[userId] || (splitType === "shares" ? 1 : 0)) };
    });

    setLoading(true);
    const res = await fetch(`/api/groups/${groupId}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents,
        description,
        category,
        date: new Date(date).toISOString(),
        paidById,
        splitType,
        participants,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't add the expense.");
      return;
    }
    onCreated();
  }

  return (
    <Modal title="Add expense" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="tag-negative text-sm">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">Amount</label>
            <input
              className="input"
              inputMode="decimal"
              placeholder="0.00"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Description</label>
          <input
            className="input"
            required
            placeholder="e.g. Dinner at Taverna"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Paid by</label>
            <select className="input" value={paidById} onChange={(e) => setPaidById(e.target.value)}>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Split</label>
          <div className="flex gap-2 mb-3">
            {(["equal", "exact", "percentage", "shares"] as SplitMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSplitType(mode)}
                className={`text-xs px-2 py-1 rounded border ${
                  splitType === mode ? "bg-moss text-paper border-moss" : "border-line text-ink/70"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={included.has(m.userId)}
                  onChange={() => toggleIncluded(m.userId)}
                />
                <span className="flex-1 text-sm">{m.user.name}</span>
                {splitType !== "equal" && included.has(m.userId) && (
                  <input
                    className="input w-24 text-sm"
                    placeholder={splitType === "exact" ? "0.00" : splitType === "percentage" ? "%" : "shares"}
                    value={values[m.userId] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [m.userId]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <button className="btn-primary w-full" disabled={loading} type="submit">
          {loading ? "Adding…" : "Add expense"}
        </button>
      </form>
    </Modal>
  );
}

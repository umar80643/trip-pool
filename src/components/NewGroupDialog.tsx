"use client";

import { useState } from "react";
import { Modal } from "./Modal";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD"];

export function NewGroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, currency }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Couldn't create the group. Try again.");
      return;
    }
    onCreated();
  }

  return (
    <Modal title="New group" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="tag-negative text-sm">{error}</p>}
        <div>
          <label className="text-sm font-medium block mb-1">Group name</label>
          <input
            className="input"
            required
            placeholder="e.g. Lisbon trip, Apt 4B"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Currency</label>
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary w-full" disabled={loading} type="submit">
          {loading ? "Creating…" : "Create group"}
        </button>
      </form>
    </Modal>
  );
}

"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { useGroupRealtime } from "@/lib/socket-client";

type PackingItem = {
  id: string;
  name: string;
  quantity: number;
  isPacked: boolean;
  assignedTo: { id: string; name: string } | null;
  addedBy: { id: string; name: string };
};

function PackingRow({
  item,
  onToggle,
  onDelete,
}: {
  item: PackingItem;
  onToggle: (id: string, isPacked: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-0">
      <label className="flex items-center gap-2 flex-1 cursor-pointer">
        <input type="checkbox" checked={item.isPacked} onChange={(e) => onToggle(item.id, e.target.checked)} />
        <span className={item.isPacked ? "line-through text-ink/40" : ""}>
          {item.name}
          {item.quantity > 1 && <span className="text-ink/50"> ×{item.quantity}</span>}
        </span>
      </label>
      <button className="text-xs text-clay hover:underline shrink-0" onClick={() => onDelete(item.id)}>
        Remove
      </button>
    </div>
  );
}

function AddItemForm({ onAdd }: { onAdd: (name: string, quantity: number) => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), quantity);
    setName("");
    setQuantity(1);
  }

  return (
    <form onSubmit={submit} className="flex gap-2 pt-2">
      <input className="input text-sm" placeholder="Add an item…" value={name} onChange={(e) => setName(e.target.value)} />
      <input
        type="number"
        min={1}
        max={999}
        className="input text-sm w-16"
        value={quantity}
        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
      />
      <button className="btn-secondary text-sm shrink-0" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}

export function PackingView({ groupId }: { groupId: string }) {
  const [items, setItems] = useState<PackingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/groups/${groupId}/packing`);
    if (res.ok) setItems((await res.json()).items);
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  useGroupRealtime(groupId, {
    "packing:created": () => load(),
    "packing:updated": () => load(),
    "packing:deleted": () => load(),
  });

  async function addItem(isShared: boolean, name: string, quantity: number) {
    const res = await fetch(`/api/groups/${groupId}/packing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, quantity, isShared }),
    });
    if (res.ok) {
      const { item } = await res.json();
      setItems((prev) => [...prev, item]);
    }
  }

  async function toggleItem(id: string, isPacked: boolean) {
    const res = await fetch(`/api/groups/${groupId}/packing/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPacked }),
    });
    if (res.ok) {
      const { item } = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? item : i)));
    }
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/groups/${groupId}/packing/${id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
  }

  if (loading) return <p className="text-ink/60">Loading…</p>;

  const shared = items.filter((i) => i.assignedTo === null);
  const personal = items.filter((i) => i.assignedTo !== null);
  const sharedPacked = shared.filter((i) => i.isPacked).length;
  const personalPacked = personal.filter((i) => i.isPacked).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="card p-4">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="font-display font-semibold">Shared</h3>
          <p className="text-xs text-ink/50">
            {sharedPacked}/{shared.length} packed
          </p>
        </div>
        {shared.length === 0 && <p className="text-sm text-ink/60">No shared items yet.</p>}
        {shared.map((item) => (
          <PackingRow key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} />
        ))}
        <AddItemForm onAdd={(name, quantity) => addItem(true, name, quantity)} />
      </div>

      <div className="card p-4">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="font-display font-semibold">Your list</h3>
          <p className="text-xs text-ink/50">
            {personalPacked}/{personal.length} packed
          </p>
        </div>
        {personal.length === 0 && <p className="text-sm text-ink/60">Nothing on your list yet.</p>}
        {personal.map((item) => (
          <PackingRow key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} />
        ))}
        <AddItemForm onAdd={(name, quantity) => addItem(false, name, quantity)} />
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState, FormEvent } from "react";
import { useGroupRealtime } from "@/lib/socket-client";
import { tripDays, dateKey } from "@/lib/itinerary";

type SavedPlaceRef = { id: string; name: string; category: string; address: string | null; lat: number; lon: number };

type ItineraryItem = {
  id: string;
  date: string;
  time: string | null;
  title: string;
  notes: string | null;
  savedPlace: SavedPlaceRef | null;
  createdBy: { id: string; name: string };
};

function formatDayLabel(key: string): string {
  return new Date(key + "T00:00:00.000Z").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ItineraryView({
  groupId,
  startDate,
  endDate,
  onDatesChanged,
}: {
  groupId: string;
  startDate: string | null;
  endDate: string | null;
  onDatesChanged: () => void;
}) {
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaceRef[]>([]);
  const [activeDay, setActiveDay] = useState<string | null>(null);

  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [datesError, setDatesError] = useState<string | null>(null);
  const [settingDates, setSettingDates] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newSavedPlaceId, setNewSavedPlaceId] = useState("");
  const [adding, setAdding] = useState(false);

  const days = useMemo(() => {
    if (!startDate || !endDate) return [];
    try {
      return tripDays(new Date(startDate), new Date(endDate));
    } catch {
      return [];
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (days.length > 0 && (!activeDay || !days.includes(activeDay))) setActiveDay(days[0]);
  }, [days, activeDay]);

  const loadItems = useCallback(async () => {
    const res = await fetch(`/api/groups/${groupId}/itinerary`);
    if (res.ok) setItems((await res.json()).items);
    setLoading(false);
  }, [groupId]);

  const loadSavedPlaces = useCallback(async () => {
    const res = await fetch(`/api/groups/${groupId}/saved-places`);
    if (res.ok) setSavedPlaces((await res.json()).savedPlaces);
  }, [groupId]);

  useEffect(() => {
    loadItems();
    loadSavedPlaces();
  }, [loadItems, loadSavedPlaces]);

  useGroupRealtime(groupId, {
    "itinerary:created": () => loadItems(),
    "itinerary:updated": () => loadItems(),
    "itinerary:deleted": () => loadItems(),
    "place:saved": () => loadSavedPlaces(),
    "group:updated": () => onDatesChanged(),
  });

  async function submitDates(e: FormEvent) {
    e.preventDefault();
    if (!startInput || !endInput) return;
    setSettingDates(true);
    setDatesError(null);
    const res = await fetch(`/api/groups/${groupId}/dates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: startInput, endDate: endInput }),
    });
    const body = await res.json();
    setSettingDates(false);
    if (res.ok) {
      onDatesChanged();
    } else {
      setDatesError(body.error ?? "Couldn't set those dates.");
    }
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (!activeDay || !newTitle.trim()) return;
    setAdding(true);
    const res = await fetch(`/api/groups/${groupId}/itinerary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: activeDay,
        title: newTitle.trim(),
        time: newTime || null,
        notes: newNotes || null,
        savedPlaceId: newSavedPlaceId || null,
      }),
    });
    setAdding(false);
    if (res.ok) {
      setNewTitle("");
      setNewTime("");
      setNewNotes("");
      setNewSavedPlaceId("");
    }
  }

  async function moveItem(id: string, direction: "up" | "down") {
    await fetch(`/api/groups/${groupId}/itinerary/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moveDirection: direction }),
    });
  }

  async function deleteItem(id: string) {
    await fetch(`/api/groups/${groupId}/itinerary/${id}`, { method: "DELETE" });
  }

  if (!startDate || !endDate) {
    return (
      <div className="card p-6 max-w-md space-y-3">
        <h3 className="font-display text-lg font-semibold">When&apos;s the trip?</h3>
        <p className="text-sm text-ink/60">Set trip dates to start planning a day-by-day itinerary.</p>
        <form onSubmit={submitDates} className="space-y-2">
          <div className="flex gap-2">
            <input type="date" className="input" value={startInput} onChange={(e) => setStartInput(e.target.value)} />
            <input type="date" className="input" value={endInput} onChange={(e) => setEndInput(e.target.value)} />
          </div>
          <button className="btn-primary" disabled={settingDates}>
            {settingDates ? "Saving…" : "Set dates"}
          </button>
        </form>
        {datesError && <p className="tag-negative text-sm">{datesError}</p>}
      </div>
    );
  }

  const itemsForActiveDay = items.filter((i) => dateKey(new Date(i.date)) === activeDay);
  // Trust the server's ordering (date asc, order asc) rather than re-sorting client-side.

  return (
    <div className="space-y-4">
      <div className="border-b border-line flex gap-4 overflow-x-auto">
        {days.map((day, idx) => (
          <button
            key={day}
            onClick={() => setActiveDay(day)}
            className={`pb-2 whitespace-nowrap font-medium ${
              activeDay === day ? "border-b-2 border-moss text-moss" : "text-ink/50"
            }`}
          >
            Day {idx + 1} · {formatDayLabel(day)}
          </button>
        ))}
      </div>

      {loading && <p className="text-ink/60">Loading…</p>}

      {!loading && activeDay && (
        <div className="space-y-2">
          {itemsForActiveDay.length === 0 && <p className="text-ink/60">Nothing planned for this day yet.</p>}
          {itemsForActiveDay.map((item, idx, dayItems) => (
              <div key={item.id} className="card p-4 flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {item.time && <span className="text-ink/60 mr-2">{item.time}</span>}
                    {item.title}
                  </p>
                  {item.savedPlace && (
                    <p className="text-sm text-ink/60 capitalize">
                      {item.savedPlace.category} · {item.savedPlace.address ?? item.savedPlace.name}
                    </p>
                  )}
                  {item.notes && <p className="text-sm text-ink/60">{item.notes}</p>}
                  <p className="text-xs text-ink/40">Added by {item.createdBy.name}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="text-ink/50 hover:text-ink disabled:opacity-30"
                    onClick={() => moveItem(item.id, "up")}
                    disabled={idx === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="text-ink/50 hover:text-ink disabled:opacity-30"
                    onClick={() => moveItem(item.id, "down")}
                    disabled={idx === dayItems.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button className="text-sm text-clay hover:underline ml-2" onClick={() => deleteItem(item.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}

          <form onSubmit={addItem} className="card p-4 space-y-2">
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="What's happening? (e.g. Check in to hotel)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <input
                type="time"
                className="input w-auto"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
              />
            </div>
            {savedPlaces.length > 0 && (
              <select className="input text-sm" value={newSavedPlaceId} onChange={(e) => setNewSavedPlaceId(e.target.value)}>
                <option value="">Not linked to a saved place</option>
                {savedPlaces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category})
                  </option>
                ))}
              </select>
            )}
            <input
              className="input text-sm"
              placeholder="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
            <button className="btn-primary text-sm" disabled={adding || !newTitle.trim()}>
              {adding ? "Adding…" : "Add to this day"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

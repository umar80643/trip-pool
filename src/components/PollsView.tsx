"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useGroupRealtime } from "@/lib/socket-client";

type Member = { userId: string; role: string; user: { id: string; name: string } };

type Voter = { id: string; name: string };
type PollOption = {
  id: string;
  label: string;
  savedPlaceId: string | null;
  votes: { user: Voter }[];
};
type Poll = {
  id: string;
  question: string;
  allowMultiple: boolean;
  closesAt: string | null;
  closedAt: string | null;
  isClosed: boolean;
  createdBy: { id: string; name: string };
  options: PollOption[];
};

type SavedPlaceRef = { id: string; name: string; category: string };

export function PollsView({ groupId, members }: { groupId: string; members: Member[] }) {
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const isAdmin = members.find((m) => m.userId === myId)?.role === "admin";

  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaceRef[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadPolls = useCallback(async () => {
    const res = await fetch(`/api/groups/${groupId}/polls`);
    if (res.ok) setPolls((await res.json()).polls);
    setLoading(false);
  }, [groupId]);

  const loadSavedPlaces = useCallback(async () => {
    const res = await fetch(`/api/groups/${groupId}/saved-places`);
    if (res.ok) setSavedPlaces((await res.json()).savedPlaces);
  }, [groupId]);

  useEffect(() => {
    loadPolls();
    loadSavedPlaces();
  }, [loadPolls, loadSavedPlaces]);

  useGroupRealtime(groupId, {
    "poll:created": () => loadPolls(),
    "poll:voted": () => loadPolls(),
    "poll:closed": () => loadPolls(),
    "poll:deleted": () => loadPolls(),
  });

  async function vote(pollId: string, optionId: string) {
    await fetch(`/api/groups/${groupId}/polls/${pollId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    });
  }

  async function closePoll(pollId: string) {
    await fetch(`/api/groups/${groupId}/polls/${pollId}`, { method: "PATCH" });
  }

  async function deletePoll(pollId: string) {
    await fetch(`/api/groups/${groupId}/polls/${pollId}`, { method: "DELETE" });
  }

  function updateOption(idx: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  }

  function addOptionField() {
    if (options.length < 10) setOptions((prev) => [...prev, ""]);
  }

  function addSavedPlaceAsOption(place: SavedPlaceRef) {
    if (options.length >= 10) return;
    const emptyIdx = options.findIndex((o) => o.trim() === "");
    if (emptyIdx >= 0) updateOption(emptyIdx, place.name);
    else setOptions((prev) => [...prev, place.name]);
  }

  async function submitPoll(e: FormEvent) {
    e.preventDefault();
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) {
      setFormError("Enter a question and at least 2 options.");
      return;
    }
    setCreating(true);
    setFormError(null);
    const res = await fetch(`/api/groups/${groupId}/polls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: question.trim(),
        allowMultiple,
        options: cleanOptions.map((label) => ({ label })),
      }),
    });
    const body = await res.json();
    setCreating(false);
    if (res.ok) {
      setShowForm(false);
      setQuestion("");
      setOptions(["", ""]);
      setAllowMultiple(false);
    } else {
      setFormError(typeof body.error === "string" ? body.error : "Couldn't create that poll.");
    }
  }

  const didIVote = (option: PollOption) => option.votes.some((v) => v.user.id === myId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary text-sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "New poll"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submitPoll} className="card p-4 space-y-3">
          <input
            className="input"
            placeholder="Ask the group something…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="space-y-2">
            {options.map((opt, idx) => (
              <input
                key={idx}
                className="input text-sm"
                placeholder={`Option ${idx + 1}`}
                value={opt}
                onChange={(e) => updateOption(idx, e.target.value)}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" className="btn-secondary text-sm" onClick={addOptionField} disabled={options.length >= 10}>
              + Add option
            </button>
            {savedPlaces.slice(0, 5).map((p) => (
              <button
                type="button"
                key={p.id}
                className="text-xs px-2 py-1 rounded-sm border border-line text-ink/70 hover:border-moss"
                onClick={() => addSavedPlaceAsOption(p)}
              >
                + {p.name}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} />
            Let people pick more than one option
          </label>
          {formError && <p className="tag-negative text-sm">{formError}</p>}
          <button className="btn-primary text-sm" disabled={creating}>
            {creating ? "Creating…" : "Create poll"}
          </button>
        </form>
      )}

      {loading && <p className="text-ink/60">Loading…</p>}
      {!loading && polls.length === 0 && !showForm && (
        <p className="text-ink/60">No polls yet. Start one to help the group decide something.</p>
      )}

      {polls.map((poll) => {
        const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);
        const canManage = poll.createdBy.id === myId || isAdmin;
        return (
          <div key={poll.id} className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{poll.question}</p>
                <p className="text-xs text-ink/50">
                  Started by {poll.createdBy.name}
                  {poll.isClosed ? " · Closed" : poll.allowMultiple ? " · Pick any that apply" : " · Pick one"}
                </p>
              </div>
              {canManage && !poll.isClosed && (
                <div className="flex gap-2 shrink-0">
                  <button className="text-xs text-ink/50 hover:underline" onClick={() => closePoll(poll.id)}>
                    Close
                  </button>
                  <button className="text-xs text-clay hover:underline" onClick={() => deletePoll(poll.id)}>
                    Delete
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              {poll.options.map((option) => {
                const pct = totalVotes === 0 ? 0 : Math.round((option.votes.length / totalVotes) * 100);
                const mine = didIVote(option);
                return (
                  <button
                    key={option.id}
                    onClick={() => !poll.isClosed && vote(poll.id, option.id)}
                    disabled={poll.isClosed}
                    className={`w-full text-left rounded-sm border px-3 py-2 relative overflow-hidden ${
                      mine ? "border-moss" : "border-line"
                    } ${poll.isClosed ? "opacity-80 cursor-default" : "hover:border-moss"}`}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-moss/10"
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                    <div className="relative flex items-center justify-between gap-2">
                      <span className={mine ? "font-medium text-moss" : ""}>
                        {mine ? "✓ " : ""}
                        {option.label}
                      </span>
                      <span className="text-xs text-ink/50 shrink-0">
                        {option.votes.length} vote{option.votes.length !== 1 ? "s" : ""} ({pct}%)
                      </span>
                    </div>
                    {option.votes.length > 0 && (
                      <p className="relative text-xs text-ink/40 mt-0.5">
                        {option.votes.map((v) => v.user.name).join(", ")}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

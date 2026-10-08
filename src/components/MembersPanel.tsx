"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

type Member = { userId: string; role: string; user: { id: string; name: string; email?: string; avatarUrl: string | null } };
type Group = { id: string; members: Member[] };

export function MembersPanel({ group, onChanged }: { group: Group; onChanged: () => void }) {
  const { data: session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const myMembership = group.members.find((m) => m.userId === session?.user?.id);
  const isAdmin = myMembership?.role === "admin";

  async function removeMember(userId: string) {
    const isSelf = userId === session?.user?.id;
    if (!confirm(isSelf ? "Leave this group?" : "Remove this member from the group?")) return;

    setBusyId(userId);
    setError(null);
    const res = await fetch(`/api/groups/${group.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setBusyId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't remove this member.");
      return;
    }
    onChanged();
  }

  return (
    <div className="space-y-3">
      {error && <p className="tag-negative text-sm">{error}</p>}
      {group.members.map((m) => {
        const isSelf = m.userId === session?.user?.id;
        const canRemove = isSelf || isAdmin;
        return (
          <div key={m.userId} className="card p-3 flex items-center justify-between">
            <div>
              <p className="font-medium">
                {m.user.name} {isSelf && <span className="text-ink/50 text-sm">(you)</span>}
              </p>
              {m.user.email && <p className="text-xs text-ink/50">{m.user.email}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-wide text-ink/50">{m.role}</span>
              {canRemove && (
                <button
                  className="text-sm text-clay hover:underline disabled:opacity-50"
                  disabled={busyId === m.userId}
                  onClick={() => removeMember(m.userId)}
                >
                  {isSelf ? "Leave" : "Remove"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Modal } from "./Modal";

export function InviteDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createInvite(targetEmail?: string) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/groups/${groupId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(targetEmail ? { email: targetEmail } : {}),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't create an invite.");
      return;
    }
    const body = await res.json();
    setInviteUrl(body.inviteUrl);
  }

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal title="Invite to group" onClose={onClose}>
      <div className="space-y-4">
        {error && <p className="tag-negative text-sm">{error}</p>}

        <div>
          <p className="text-sm font-medium mb-2">Shareable link</p>
          {inviteUrl ? (
            <div className="flex gap-2">
              <input className="input text-sm" readOnly value={inviteUrl} />
              <button className="btn-secondary text-sm whitespace-nowrap" onClick={copyLink}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          ) : (
            <button className="btn-secondary text-sm" disabled={loading} onClick={() => createInvite()}>
              {loading ? "Generating…" : "Generate link"}
            </button>
          )}
          <p className="text-xs text-ink/50 mt-1">Anyone with this link can join the group.</p>
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-sm font-medium mb-2">Invite by email</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              createInvite(email);
            }}
          >
            <input
              className="input text-sm"
              type="email"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button className="btn-primary text-sm whitespace-nowrap" disabled={loading} type="submit">
              Send
            </button>
          </form>
          <p className="text-xs text-ink/50 mt-1">
            Creates an invite restricted to that email; wire up an email provider (Resend, Postmark, etc.)
            in the invites API route to actually deliver it.
          </p>
        </div>
      </div>
    </Modal>
  );
}

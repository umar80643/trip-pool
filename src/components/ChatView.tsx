"use client";

import { useCallback, useEffect, useRef, useState, FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useGroupRealtime } from "@/lib/socket-client";

type ChatMessage = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; avatarUrl: string | null };
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ChatView({ groupId }: { groupId: string }) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialLoadDone = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/groups/${groupId}/chat`);
    if (res.ok) {
      const body = await res.json();
      setMessages(body.messages);
      setHasMore(body.hasMore);
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Only auto-scroll on first load and when new messages arrive at the bottom,
    // not when older history is prepended via "Load earlier".
    if (!loadingMore) bottomRef.current?.scrollIntoView({ behavior: initialLoadDone.current ? "smooth" : "auto" });
    initialLoadDone.current = true;
  }, [messages, loadingMore]);

  useGroupRealtime(groupId, {
    "chat:message": (payload: { message: ChatMessage }) => {
      setMessages((prev) => [...prev, payload.message]);
    },
  });

  async function loadEarlier() {
    if (messages.length === 0) return;
    setLoadingMore(true);
    const res = await fetch(`/api/groups/${groupId}/chat?before=${encodeURIComponent(messages[0].createdAt)}`);
    if (res.ok) {
      const body = await res.json();
      setMessages((prev) => [...body.messages, ...prev]);
      setHasMore(body.hasMore);
    }
    setLoadingMore(false);
  }

  async function submitMessage(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    setDraft("");
    const res = await fetch(`/api/groups/${groupId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setSending(false);
    if (!res.ok) setDraft(content); // put it back so nothing's lost
  }

  const myId = session?.user?.id;

  if (loading) return <p className="text-ink/60">Loading…</p>;

  return (
    <div className="flex flex-col h-[60vh]">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {hasMore && (
          <div className="text-center">
            <button className="text-sm text-moss hover:underline" onClick={loadEarlier} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}
        {messages.length === 0 && (
          <p className="text-ink/60 text-center py-8">No messages yet. Say hi to the group.</p>
        )}
        {messages.map((m) => {
          const mine = m.user.id === myId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                {!mine && <p className="text-xs text-ink/50 mb-0.5">{m.user.name}</p>}
                <div
                  className={`rounded-md px-3 py-2 text-sm ${
                    mine ? "bg-moss text-paper" : "bg-white border border-line"
                  }`}
                >
                  {m.content}
                </div>
                <p className="text-[11px] text-ink/40 mt-0.5">{formatTime(m.createdAt)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submitMessage} className="flex gap-2 pt-3 border-t border-line mt-3">
        <input
          className="input"
          placeholder="Message the group…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
        />
        <button className="btn-primary shrink-0" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

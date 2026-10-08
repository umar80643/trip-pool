"use client";

import { useEffect, useState } from "react";

export function EmailVerificationBanner() {
  const [status, setStatus] = useState<"loading" | "verified" | "unverified" | "hidden">("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body?.user) {
          setStatus("hidden");
          return;
        }
        setEmail(body.user.email);
        setStatus(body.user.emailVerifiedAt ? "verified" : "unverified");
      })
      .catch(() => setStatus("hidden"));
  }, []);

  async function resend() {
    if (!email) return;
    setSending(true);
    await fetch("/api/auth/verify-email/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSending(false);
    setSent(true);
  }

  if (status !== "unverified") return null;

  return (
    <div className="card p-3 flex items-center justify-between gap-3 flex-wrap text-sm bg-amber-50 border-amber-200">
      <p className="text-ink/70">
        {sent ? "Check your inbox for a new verification link." : "Please verify your email address."}
      </p>
      {!sent && (
        <button className="btn-secondary text-sm shrink-0" onClick={resend} disabled={sending}>
          {sending ? "Sending…" : "Resend verification email"}
        </button>
      )}
    </div>
  );
}

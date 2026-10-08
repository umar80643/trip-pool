"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    // Always show the same generic message, success or not — see the API
    // route for why (avoids revealing which emails have an account).
    setMessage(body.message ?? "If an account exists for that email, we've sent a reset link.");
  }

  return (
    <div className="max-w-sm mx-auto mt-12">
      <h1 className="font-display text-2xl font-semibold mb-6">Reset your password</h1>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        {message ? (
          <p className="text-sm text-ink/70">{message}</p>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium block mb-1">Email</label>
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button className="btn-primary w-full" disabled={loading} type="submit">
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </>
        )}
      </form>
      <p className="text-sm mt-4 text-center text-ink/70">
        <Link href="/login" className="text-moss font-medium">
          Back to login
        </Link>
      </p>
    </div>
  );
}

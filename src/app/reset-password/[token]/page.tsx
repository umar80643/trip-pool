"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token, password }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } else {
      setError(body.error?.formErrors?.[0] ?? body.error ?? "Couldn't reset your password.");
    }
  }

  if (done) {
    return (
      <div className="max-w-sm mx-auto mt-12 card p-6 text-center space-y-2">
        <h1 className="font-display text-xl font-semibold">Password updated</h1>
        <p className="text-ink/60">Taking you to login…</p>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto mt-12">
      <h1 className="font-display text-2xl font-semibold mb-6">Set a new password</h1>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        {error && <p className="tag-negative text-sm">{error}</p>}
        <div>
          <label className="text-sm font-medium block mb-1">New password</label>
          <input
            className="input"
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-ink/60 mt-1">At least 8 characters.</p>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Confirm password</label>
          <input
            className="input"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <button className="btn-primary w-full" disabled={loading} type="submit">
          {loading ? "Saving…" : "Reset password"}
        </button>
      </form>
      <p className="text-sm mt-4 text-center text-ink/70">
        <Link href="/login" className="text-moss font-medium">
          Back to login
        </Link>
      </p>
    </div>
  );
}

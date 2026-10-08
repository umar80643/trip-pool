"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error?.formErrors?.[0] ?? body.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    const signInRes = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (signInRes?.error) {
      setError("Account created — please log in.");
      router.push("/login");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="max-w-sm mx-auto mt-12">
      <h1 className="font-display text-2xl font-semibold mb-6">Create your account</h1>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        {error && <p className="tag-negative text-sm">{error}</p>}
        <div>
          <label className="text-sm font-medium block mb-1">Name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Password</label>
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
        <button className="btn-primary w-full" disabled={loading} type="submit">
          {loading ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p className="text-sm mt-4 text-center text-ink/70">
        Already have an account?{" "}
        <Link href="/login" className="text-moss font-medium">
          Log in
        </Link>
      </p>
    </div>
  );
}

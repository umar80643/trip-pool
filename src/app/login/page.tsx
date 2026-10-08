"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="max-w-sm mx-auto mt-12">
      <h1 className="font-display text-2xl font-semibold mb-6">Welcome back</h1>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        {error && <p className="tag-negative text-sm">{error}</p>}
        <div>
          <label className="text-sm font-medium block mb-1">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Password</label>
          <input
            className="input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-right mt-1">
            <Link href="/forgot-password" className="text-moss font-medium">
              Forgot password?
            </Link>
          </p>
        </div>
        <button className="btn-primary w-full" disabled={loading} type="submit">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-sm mt-4 text-center text-ink/70">
        No account?{" "}
        <Link href="/signup" className="text-moss font-medium">
          Sign up
        </Link>
      </p>
    </div>
  );
}

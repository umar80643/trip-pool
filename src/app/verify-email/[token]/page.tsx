"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function VerifyEmailPage({ params }: { params: { token: string } }) {
  const [status, setStatus] = useState<"checking" | "ok" | "error">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/verify-email/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (res.ok) {
          setStatus("ok");
        } else {
          setError(body.error ?? "Couldn't verify that link.");
          setStatus("error");
        }
      })
      .catch(() => {
        setError("Something went wrong. Try again.");
        setStatus("error");
      });
  }, [params.token]);

  return (
    <div className="max-w-sm mx-auto mt-12 card p-6 text-center space-y-3">
      {status === "checking" && <p className="text-ink/60">Verifying your email…</p>}
      {status === "ok" && (
        <>
          <h1 className="font-display text-xl font-semibold">Email verified</h1>
          <p className="text-ink/60">You&apos;re all set.</p>
          <Link href="/dashboard" className="btn-primary inline-block mt-2">
            Go to dashboard
          </Link>
        </>
      )}
      {status === "error" && (
        <>
          <h1 className="font-display text-xl font-semibold">Couldn&apos;t verify</h1>
          <p className="tag-negative text-sm">{error}</p>
          <p className="text-sm text-ink/60 mt-2">
            You can request a new link from your{" "}
            <Link href="/dashboard" className="text-moss font-medium">
              dashboard
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}

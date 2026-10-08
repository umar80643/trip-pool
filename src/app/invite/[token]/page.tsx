"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AcceptInvitePage({ params }: { params: { token: string } }) {
  const { status } = useSession();
  const router = useRouter();
  const [state, setState] = useState<"pending" | "joining" | "error" | "done">("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/login?next=/invite/${params.token}`);
    }
  }, [status, params.token, router]);

  async function join() {
    setState("joining");
    const res = await fetch(`/api/invites/${params.token}/accept`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Couldn't accept this invite.");
      setState("error");
      return;
    }
    setState("done");
    router.push(`/groups/${body.membership.groupId}`);
  }

  if (status !== "authenticated") return null;

  return (
    <div className="max-w-md mx-auto mt-12 card p-6 text-center">
      <h1 className="font-display text-xl font-semibold mb-2">You&apos;ve been invited to a group</h1>
      <p className="text-ink/70 mb-6">Join to see shared expenses and settle up.</p>
      {error && <p className="tag-negative text-sm mb-4">{error}</p>}
      <button className="btn-primary" onClick={join} disabled={state === "joining"}>
        {state === "joining" ? "Joining…" : "Accept invite"}
      </button>
    </div>
  );
}

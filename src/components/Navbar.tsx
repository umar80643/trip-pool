"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

export function Navbar() {
  const { data: session, status } = useSession();

  return (
    <header className="border-b border-line bg-paper/95 backdrop-blur sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/dashboard" className="font-display text-xl font-semibold text-ink">
          TripPool
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {status === "authenticated" ? (
            <>
              <Link href="/dashboard" className="hover:text-moss">
                Dashboard
              </Link>
              <span className="text-ink/60">{session.user?.name}</span>
              <button onClick={() => signOut({ callbackUrl: "/login" })} className="btn-secondary text-sm">
                Sign out
              </button>
            </>
          ) : status === "loading" ? null : (
            <>
              <Link href="/login" className="hover:text-moss">
                Log in
              </Link>
              <Link href="/signup" className="btn-primary text-sm">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

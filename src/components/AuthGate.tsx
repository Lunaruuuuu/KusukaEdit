"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/useSessionStore";

/**
 * Shows its children only to a signed-in user; everyone else is sent to
 * /login. The stored session is read once in the browser (restore()); until
 * then a neutral "checking" screen is shown, so the server render and the
 * first client render are the same.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const restore = useSessionStore((s) => s.restore);

  useEffect(() => {
    if (status === "checking") restore();
  }, [status, restore]);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="auth-screen" data-auth-status={status}>
        <p className="auth-screen__note">{status === "checking" ? "Memeriksa sesi…" : "Mengalihkan ke halaman masuk…"}</p>
      </div>
    );
  }
  return <>{children}</>;
}

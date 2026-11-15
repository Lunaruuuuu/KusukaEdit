"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/useSessionStore";
import { BRANCHES, USERS } from "@/lib/auth";

/**
 * The sign-in form (route /login). A signed-in user is sent straight to the
 * editor; after a successful sign-in, so is everyone else.
 */
export default function LoginPage() {
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const restore = useSessionStore((s) => s.restore);
  const login = useSessionStore((s) => s.login);
  const error = useSessionStore((s) => s.error);
  const busy = useSessionStore((s) => s.busy);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (status === "checking") restore();
  }, [status, restore]);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (await login(username, password)) router.replace("/");
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={submit} data-login-form="" noValidate>
        <h1 className="auth-card__title">Canvas Design Editor</h1>
        <p className="auth-card__lead">Masuk untuk membuka editor desain.</p>

        <label className="auth-field">
          <span>Nama pengguna</span>
          <input
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="auth-field">
          <span>Kata sandi</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </label>

        {error && (
          <p className="auth-card__error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="auth-card__submit" disabled={busy}>
          {busy ? "Memeriksa…" : "Masuk"}
        </button>

        <details className="auth-card__demo">
          <summary>Akun demo</summary>
          <ul>
            {USERS.map((u) => (
              <li key={u.id}>
                <code>{u.username}</code> — {BRANCHES.find((b) => b.id === u.branchId)?.name}
              </li>
            ))}
          </ul>
          <p>Kata sandinya tercantum di README proyek (bagian &quot;Akun demo&quot;).</p>
        </details>
      </form>
    </main>
  );
}

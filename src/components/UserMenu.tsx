"use client";

import React from "react";
import { useSessionStore } from "@/store/useSessionStore";
import { branchName } from "@/lib/auth";

/** Header: who is signed in, their branch, and "Keluar" (sign out). */
export default function UserMenu() {
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  if (!user) return null;
  return (
    <div className="user-menu" data-user-branch={user.branchId}>
      <span className="user-menu__who" title={`${user.username} · ${user.role === "admin" ? "Admin" : "Desainer"}`}>
        <span className="user-menu__name">{user.displayName}</span>
        <span className="user-menu__branch">{branchName(user.branchId)}</span>
      </span>
      <button
        type="button"
        className="user-menu__logout"
        data-action="logout"
        onClick={() => {
          logout();
          // A full page load, not a client-side route change: the design and
          // its undo history live in memory and must not reach the next
          // account that signs in on this browser.
          window.location.replace("/login");
        }}
      >
        Keluar
      </button>
    </div>
  );
}

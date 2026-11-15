// ---------------------------------------------------------------------------
// Session store (v12): who is signed in. Separate from the editor store (the
// design and its undo history know nothing about accounts). Persisted by
// lib/auth.ts in localStorage under "kusukaedit.session" (user id + expiry);
// `restore()` reads it back on page load. See lib/auth.ts for what this does
// and does NOT protect.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import {
  clearSession,
  readSession,
  sessionStorageOrNull,
  verifyCredentials,
  writeSession,
  type UserProfile,
} from "@/lib/auth";

export type SessionStatus = "checking" | "anonymous" | "authenticated";

interface SessionState {
  status: SessionStatus;
  user: UserProfile | null;
  /** The message of the last failed sign-in. */
  error: string | null;
  busy: boolean;
  /** Reads the stored session (call once in the browser). */
  restore: () => void;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  // "checking" until restore() ran in the browser: the server render and the
  // first client render agree (no hydration mismatch), then the page decides.
  status: "checking",
  user: null,
  error: null,
  busy: false,

  restore: () => {
    const user = readSession(sessionStorageOrNull());
    set({ user, status: user ? "authenticated" : "anonymous" });
  },

  login: async (username, password) => {
    set({ busy: true, error: null });
    const result = await verifyCredentials(username, password);
    if (!result.ok) {
      set({ busy: false, error: result.error, status: "anonymous", user: null });
      return false;
    }
    writeSession(sessionStorageOrNull(), result.user);
    set({ busy: false, error: null, status: "authenticated", user: result.user });
    return true;
  },

  logout: () => {
    clearSession(sessionStorageOrNull());
    set({ status: "anonymous", user: null, error: null });
  },
}));

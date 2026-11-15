// ---------------------------------------------------------------------------
// Light sign-in (v12): a mock user registry with branches, password check,
// and a session kept in localStorage. No database, no server.
//
// IMPORTANT — this is an access gate for a prototype, NOT security:
//   - the registry (with its salted SHA-256 hashes) ships in the JavaScript
//     bundle, and everything is checked in the browser;
//   - the session in localStorage can be edited by whoever uses the browser.
// It keeps casual visitors out of the editor and gives every account its
// branch (which decides the templates it sees). Real protection needs a server
// (an auth provider, signed httpOnly cookies, templates served per branch).
//
// Demo accounts: see README ("Akun demo"). Pure functions; `crypto.subtle`
// exists in browsers and in Node 20+, so all of it is tested in Node.
// ---------------------------------------------------------------------------

export type BranchId = "pusat" | "cabang-1" | "cabang-2";
export type Role = "admin" | "designer";

export interface Branch {
  id: BranchId;
  name: string;
}

export const BRANCHES: readonly Branch[] = [
  { id: "pusat", name: "Kantor Pusat" },
  { id: "cabang-1", name: "Cabang 1" },
  { id: "cabang-2", name: "Cabang 2" },
];

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  branchId: BranchId;
}

export interface RegistryUser extends UserProfile {
  /** Random per-user salt (hex). */
  salt: string;
  /** sha256(salt + ":" + password), hex. */
  passwordHash: string;
}

/** The mock user registry (stand-in for a user table). */
export const USERS: readonly RegistryUser[] = [
  {
    id: "u-pusat-admin",
    username: "admin.pusat",
    displayName: "Admin Pusat",
    role: "admin",
    branchId: "pusat",
    salt: "d231b2dc64c162c8",
    passwordHash: "bfe9391da266b09719dcfaf6ae78a0d83ac34c3b5ef29a3b4a0645201fc32390",
  },
  {
    id: "u-cabang1-designer",
    username: "desainer.cabang1",
    displayName: "Desainer Cabang 1",
    role: "designer",
    branchId: "cabang-1",
    salt: "dabc8f9daeeedf53",
    passwordHash: "b642c0d01980d22156c7fa2b174e49ea2826defac37eef1d26e1ebae7ba07cb9",
  },
  {
    id: "u-cabang2-designer",
    username: "desainer.cabang2",
    displayName: "Desainer Cabang 2",
    role: "designer",
    branchId: "cabang-2",
    salt: "955ad2695aa610d2",
    passwordHash: "7b270c63cb1c7a409727646e745fedd0f88fb56b68a7c27a00ce15b12e9bb882",
  },
];

export const branchName = (id: string): string => BRANCHES.find((b) => b.id === id)?.name ?? id;
export const isBranchId = (v: unknown): v is BranchId => typeof v === "string" && BRANCHES.some((b) => b.id === v);

/** The public part of a registry entry (never the hash). */
export function toProfile(user: RegistryUser): UserProfile {
  const { id, username, displayName, role, branchId } = user;
  return { id, username, displayName, role, branchId };
}

export async function hashPassword(salt: string, password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (both are hex of the same length). */
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type LoginResult = { ok: true; user: UserProfile } | { ok: false; error: string };

/**
 * Checks a username / password against the registry. The message does not say
 * which of the two was wrong.
 */
export async function verifyCredentials(
  username: string,
  password: string,
  registry: readonly RegistryUser[] = USERS
): Promise<LoginResult> {
  const name = username.trim().toLowerCase();
  if (name === "" || password === "") return { ok: false, error: "Isi nama pengguna dan kata sandi." };
  const user = registry.find((u) => u.username.toLowerCase() === name);
  // hash anyway, so an unknown name takes as long as a wrong password
  const hash = await hashPassword(user?.salt ?? "0000000000000000", password);
  if (!user || !sameHash(hash, user.passwordHash)) {
    return { ok: false, error: "Nama pengguna atau kata sandi salah." };
  }
  return { ok: true, user: toProfile(user) };
}

// --------------------------------- session ----------------------------------

export const SESSION_KEY = "kusukaedit.session";
/** A session lasts 12 hours. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface StoredSession {
  userId: string;
  expiresAt: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * The signed-in user from storage, or null (no session, expired, unknown
 * user, damaged data). Only the user id is stored: the profile — and so the
 * branch — always comes from the registry, never from the stored data.
 */
export function readSession(
  storage: StorageLike | null,
  now: number = Date.now(),
  registry: readonly RegistryUser[] = USERS
): UserProfile | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof data.userId !== "string" || typeof data.expiresAt !== "number" || data.expiresAt <= now) {
      storage.removeItem(SESSION_KEY);
      return null;
    }
    const user = registry.find((u) => u.id === data.userId);
    return user ? toProfile(user) : null;
  } catch {
    return null;
  }
}

export function writeSession(storage: StorageLike | null, user: UserProfile, now: number = Date.now()): boolean {
  if (!storage) return false;
  try {
    const session: StoredSession = { userId: user.id, expiresAt: now + SESSION_TTL_MS };
    storage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(storage: StorageLike | null): void {
  try {
    storage?.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function sessionStorageOrNull(): StorageLike | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

// ------------------------------ template access -----------------------------

/** A template's owner: a branch, or "global" (every branch). Absent = global. */
export type TemplateScope = BranchId | "global";

/**
 * Who sees a template:
 *   - a "global" template (or one without a branch): everyone;
 *   - a branch template: that branch;
 *   - Kantor Pusat (head office) sees every branch's templates.
 */
export function canUseTemplate(user: Pick<UserProfile, "branchId"> | null, scope: string | undefined): boolean {
  if (!user) return false;
  if (scope === undefined || scope === "global") return true;
  return user.branchId === "pusat" || user.branchId === scope;
}

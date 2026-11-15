// v12: light sign-in (mock registry, salted hashes, session in localStorage),
// branches, and template isolation per branch.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, run } from "./harness";
import {
  BRANCHES,
  SESSION_KEY,
  SESSION_TTL_MS,
  USERS,
  canUseTemplate,
  clearSession,
  hashPassword,
  readSession,
  verifyCredentials,
  writeSession,
} from "@/lib/auth";
import { parseTemplateIndex, templatesForUser } from "@/lib/templateLibrary";
import { useSessionStore } from "@/store/useSessionStore";

// The demo accounts' passwords (also listed in README, "Akun demo").
const DEMO: Record<string, string> = {
  "admin.pusat": "demo-pusat-2026",
  "desainer.cabang1": "demo-cabang1-2026",
  "desainer.cabang2": "demo-cabang2-2026",
};

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

// ============================================================== registry + password
test("registry: three accounts, one per branch, every branch known", () => {
  assert.deepEqual(BRANCHES.map((b) => b.id), ["pusat", "cabang-1", "cabang-2"]);
  assert.deepEqual(USERS.map((u) => u.branchId), ["pusat", "cabang-1", "cabang-2"]);
  assert.equal(new Set(USERS.map((u) => u.username)).size, USERS.length);
  for (const u of USERS) assert.match(u.passwordHash, /^[0-9a-f]{64}$/);
});

test("sign-in: each demo password opens its own account; the profile never carries the hash", async () => {
  for (const u of USERS) {
    const r = await verifyCredentials(u.username, DEMO[u.username]);
    assert.ok(r.ok, u.username);
    if (!r.ok) continue;
    assert.equal(r.user.branchId, u.branchId);
    assert.ok(!("passwordHash" in r.user) && !("salt" in r.user));
  }
  // the username is not case-sensitive, and spaces around it are ignored
  assert.ok((await verifyCredentials("  Admin.Pusat ", DEMO["admin.pusat"])).ok);
  // the hash is sha256(salt + ":" + password)
  assert.equal(await hashPassword(USERS[0].salt, DEMO["admin.pusat"]), USERS[0].passwordHash);
});

test("sign-in: wrong password, unknown user, empty fields — one message that does not say which", async () => {
  const wrong = await verifyCredentials("admin.pusat", "salah");
  const unknown = await verifyCredentials("tidak.ada", "demo-pusat-2026");
  assert.ok(!wrong.ok && !unknown.ok);
  if (!wrong.ok && !unknown.ok) assert.equal(wrong.error, unknown.error);
  // another account's password does not open this one
  assert.ok(!(await verifyCredentials("desainer.cabang1", DEMO["desainer.cabang2"])).ok);
  const empty = await verifyCredentials("", "");
  assert.ok(!empty.ok && /Isi nama pengguna/.test(empty.error));
});

// ============================================================== session
test("session: only the user id and expiry are stored; the profile comes from the registry", () => {
  const storage = new MemoryStorage();
  const user = USERS[1];
  assert.ok(writeSession(storage, user, 1000));
  const stored = JSON.parse(storage.getItem(SESSION_KEY)!);
  assert.deepEqual(stored, { userId: user.id, expiresAt: 1000 + SESSION_TTL_MS });
  assert.equal(readSession(storage, 2000)?.branchId, "cabang-1");
  // editing the stored data cannot change the branch: a forged field is ignored
  storage.setItem(SESSION_KEY, JSON.stringify({ ...stored, branchId: "pusat" }));
  assert.equal(readSession(storage, 2000)?.branchId, "cabang-1");
  // expired: gone, and removed from storage
  assert.equal(readSession(storage, 1000 + SESSION_TTL_MS + 1), null);
  assert.equal(storage.getItem(SESSION_KEY), null);
  // unknown user, damaged data, no storage
  storage.setItem(SESSION_KEY, JSON.stringify({ userId: "ghost", expiresAt: 9e15 }));
  assert.equal(readSession(storage), null);
  storage.setItem(SESSION_KEY, "{oops");
  assert.equal(readSession(storage), null);
  assert.equal(readSession(null), null);
  writeSession(storage, user);
  clearSession(storage);
  assert.equal(storage.getItem(SESSION_KEY), null);
});

test("store: login sets the user, a failed login keeps it out, logout signs out", async () => {
  const S = useSessionStore.getState;
  assert.equal(S().status, "checking");
  S().restore(); // no browser storage in Node: anonymous
  assert.equal(S().status, "anonymous");
  assert.equal(await S().login("desainer.cabang2", "salah"), false);
  assert.equal(S().status, "anonymous");
  assert.ok(S().error);
  assert.equal(await S().login("desainer.cabang2", DEMO["desainer.cabang2"]), true);
  assert.equal(S().status, "authenticated");
  assert.equal(S().user?.branchId, "cabang-2");
  assert.equal(S().error, null);
  S().logout();
  assert.equal(S().status, "anonymous");
  assert.equal(S().user, null);
});

// ============================================================== template isolation
const catalogue = parseTemplateIndex(JSON.parse(readFileSync("public/templates/index.json", "utf8")));
if ("error" in catalogue) throw new Error(catalogue.error);
const templates = catalogue.index.templates;
const idsFor = (branchId: (typeof BRANCHES)[number]["id"]) =>
  templatesForUser(templates, { branchId }).map((t) => t.id).sort();

test("access rule: global for all, a branch for itself, head office for everything, nobody signed out", () => {
  const c1 = { branchId: "cabang-1" as const };
  assert.ok(canUseTemplate(c1, undefined) && canUseTemplate(c1, "global") && canUseTemplate(c1, "cabang-1"));
  assert.ok(!canUseTemplate(c1, "cabang-2") && !canUseTemplate(c1, "pusat"));
  assert.ok(canUseTemplate({ branchId: "pusat" }, "cabang-2"));
  assert.ok(!canUseTemplate(null, "global"));
});

test("catalogue: every template has an owner; Cabang 1 and Cabang 2 never see each other's", () => {
  for (const t of templates) assert.ok(t.branchId && ["global", "pusat", "cabang-1", "cabang-2"].includes(t.branchId), t.id);
  const global = templates.filter((t) => t.branchId === "global").map((t) => t.id).sort();
  const own = (b: string) => templates.filter((t) => t.branchId === b).map((t) => t.id);
  assert.deepEqual(idsFor("cabang-1"), [...global, ...own("cabang-1")].sort());
  assert.deepEqual(idsFor("cabang-2"), [...global, ...own("cabang-2")].sort());
  assert.equal(idsFor("pusat").length, templates.length);
  assert.ok(own("cabang-1").length > 0 && own("cabang-2").length > 0 && own("pusat").length > 0);
  for (const id of own("cabang-2")) assert.ok(!idsFor("cabang-1").includes(id), `${id} leaked to Cabang 1`);
  for (const id of own("cabang-1")) assert.ok(!idsFor("cabang-2").includes(id), `${id} leaked to Cabang 2`);
  assert.deepEqual(templatesForUser(templates, null), []);
});

test("my templates: a saved template carries its branch and is filtered the same way", () => {
  const mine = [
    { id: "a", branchId: "cabang-1" },
    { id: "b", branchId: "cabang-2" },
    { id: "c" }, // saved before sign-in existed: global
  ];
  assert.deepEqual(templatesForUser(mine, { branchId: "cabang-1" }).map((t) => t.id), ["a", "c"]);
  assert.deepEqual(templatesForUser(mine, { branchId: "cabang-2" }).map((t) => t.id), ["b", "c"]);
  // an invalid branch id in the catalogue is dropped (then the template is global)
  const r = parseTemplateIndex({ templates: [{ id: "x", name: "X", file: "x.json", branchId: "Cabang 1!" }] });
  assert.ok(!("error" in r) && r.index.templates[0].branchId === undefined);
});

run().then((code) => process.exit(code));

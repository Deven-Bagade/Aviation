/**
 * LOCAL AUTHENTICATION + ROLE-BASED AUTHORIZATION
 * ============================================================
 * Self-contained, local-only auth for the GCS desktop app — no
 * backend required. Passwords are hashed (SHA-256 + per-user
 * salt) via Web Crypto, never stored in plaintext. Session
 * tokens are HMAC-signed with a per-install secret so a user
 * can't escalate their own role by hand-editing sessionStorage.
 *
 * For a real fielded deployment, swap this for Firebase Auth
 * (already partially wired in db/firebaseStore.ts) or an
 * organisation PKI/SSO identity provider — this is scoped to
 * demonstrate the RBAC model, not to be production identity.
 * ============================================================
 */

export type Role = "OPERATOR" | "MAINTENANCE" | "ADMIN";

export type AuthUser = {
  username: string;
  role: Role;
};

type StoredUser = {
  username: string;
  role: Role;
  salt: string;
  hash: string;
};

type Session = {
  username: string;
  role: Role;
  issuedAt: number;
};

const USERS_KEY = "uav_auth_users_v1";
const INSTALL_SECRET_KEY = "uav_auth_install_secret_v1";
const SESSION_KEY = "uav_auth_session_v1";
const SESSION_SIG_KEY = "uav_auth_session_sig_v1";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr.buffer);
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(buf);
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(sig);
}

function getInstallSecret(): string {
  let secret = localStorage.getItem(INSTALL_SECRET_KEY);
  if (!secret) {
    secret = randomHex(32);
    localStorage.setItem(INSTALL_SECRET_KEY, secret);
  }
  return secret;
}

function readUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function ensureSeeded(): Promise<void> {
  if (readUsers().length > 0) return;
  const salt = randomHex(16);
  const hash = await sha256Hex(salt + "admin123");
  writeUsers([{ username: "admin", role: "ADMIN", salt, hash }]);
  console.warn(
    "[auth] No users found — seeded default account admin / admin123. Change this before your demo."
  );
}

export async function login(username: string, password: string): Promise<AuthUser | null> {
  await ensureSeeded();
  const users = readUsers();
  const record = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!record) return null;

  const hash = await sha256Hex(record.salt + password);
  if (hash !== record.hash) return null;

  const session: Session = { username: record.username, role: record.role, issuedAt: Date.now() };
  const sig = await hmacHex(getInstallSecret(), JSON.stringify(session));

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  sessionStorage.setItem(SESSION_SIG_KEY, sig);

  return { username: record.username, role: record.role };
}

export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_SIG_KEY);
}

export async function getCurrentSession(): Promise<AuthUser | null> {
  const raw = sessionStorage.getItem(SESSION_KEY);
  const sig = sessionStorage.getItem(SESSION_SIG_KEY);
  if (!raw || !sig) return null;

  const expected = await hmacHex(getInstallSecret(), raw);
  if (expected !== sig) {
    console.warn("[auth] Session signature mismatch — discarding tampered/corrupt session.");
    logout();
    return null;
  }

  const session: Session = JSON.parse(raw);
  if (Date.now() - session.issuedAt > SESSION_TTL_MS) {
    logout();
    return null;
  }

  return { username: session.username, role: session.role };
}

export async function addUser(username: string, password: string, role: Role): Promise<boolean> {
  await ensureSeeded();
  const users = readUsers();
  const trimmed = username.trim();
  if (!trimmed || users.some((u) => u.username.toLowerCase() === trimmed.toLowerCase())) return false;

  const salt = randomHex(16);
  const hash = await sha256Hex(salt + password);
  users.push({ username: trimmed, role, salt, hash });
  writeUsers(users);
  return true;
}

export async function removeUser(username: string): Promise<void> {
  writeUsers(readUsers().filter((u) => u.username !== username));
}

export function listUsers(): Array<{ username: string; role: Role }> {
  return readUsers().map((u) => ({ username: u.username, role: u.role }));
}

const ROLE_RANK: Record<Role, number> = { OPERATOR: 1, MAINTENANCE: 2, ADMIN: 3 };

export function hasAtLeastRole(user: AuthUser | null, role: Role): boolean {
  if (!user) return false;
  return ROLE_RANK[user.role] >= ROLE_RANK[role];
}
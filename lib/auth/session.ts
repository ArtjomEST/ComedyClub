import { createHash, randomBytes } from "node:crypto";
import { getPostgresDatabase } from "../db/postgres";

export const SESSION_COOKIE = "ccb_session";
const SESSION_DAYS = 90;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function authenticatedUserId(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const db = getPostgresDatabase();
  const session = await db.prepare(`SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>NOW()`).bind(hashToken(token)).first();
  if (!session) return null;
  void db.prepare("UPDATE sessions SET last_seen_at=NOW() WHERE token_hash=?").bind(hashToken(token)).run().catch(() => undefined);
  return String(session.user_id);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const db = getPostgresDatabase();
  await db.prepare(`INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at,last_seen_at)
    VALUES(?,?,?,NOW()+INTERVAL '90 days',NOW(),NOW())`).bind(crypto.randomUUID(), userId, hashToken(token)).run();
  return token;
}

export async function deleteSession(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await getPostgresDatabase().prepare("DELETE FROM sessions WHERE token_hash=?").bind(hashToken(token)).run();
}

export function sessionCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

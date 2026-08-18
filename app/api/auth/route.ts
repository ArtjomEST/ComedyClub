import { getStore } from "@netlify/blobs";
import { getPostgresDatabase } from "../../../lib/db/postgres";
import schemaStatements from "../../../db/schema-statements.json";
import { authenticatedUserId, createSession, deleteSession, expiredSessionCookie, sessionCookie } from "../../../lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let schemaReady = false;
async function ready() {
  if (schemaReady) return;
  const database = getPostgresDatabase();
  await database.batch(schemaStatements.map((sql) => database.prepare(sql)));
  schemaReady = true;
}

function clean(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function publicUser(row: Record<string, unknown>) {
  return { id: String(row.id), firstName: String(row.first_name || ""), lastName: String(row.last_name || ""), nickname: String(row.username), avatarUrl: String(row.avatar || ""), rating: Number(row.rating), xp: Number(row.xp), level: Number(row.level), introId: String(row.intro_id) };
}

export async function GET(request: Request) {
  try {
    await ready();
    const userId = await authenticatedUserId(request);
    if (!userId) return Response.json({ state: "UNAUTHENTICATED" }, { status: 401, headers: { "cache-control": "no-store" } });
    const user = await getPostgresDatabase().prepare("SELECT * FROM users WHERE id=?").bind(userId).first();
    if (!user) return Response.json({ state: "UNAUTHENTICATED" }, { status: 401 });
    return Response.json({ state: "AUTHENTICATED", user: publicUser(user) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ state: "ERROR", error: "The club could not restore your account." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ready();
    const data = await request.formData();
    const firstName = clean(data.get("firstName"), 50), lastName = clean(data.get("lastName"), 50), nickname = clean(data.get("nickname"), 24);
    const avatar = data.get("avatar");
    if (firstName.length < 2 || lastName.length < 2 || nickname.length < 2) return Response.json({ error: "Complete all required profile fields." }, { status: 422 });
    if (!(avatar instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(avatar.type) || avatar.size > 5_000_000) return Response.json({ error: "Choose a JPG, PNG or WEBP photo under 5 MB." }, { status: 422 });
    const userId = crypto.randomUUID();
    const extension = avatar.type === "image/png" ? "png" : avatar.type === "image/webp" ? "webp" : "jpg";
    const avatarKey = `${userId}/avatar-${Date.now()}.${extension}`;
    await getStore("avatars").set(avatarKey, await avatar.arrayBuffer(), { metadata: { contentType: avatar.type } });
    const avatarUrl = `/api/avatar?key=${encodeURIComponent(avatarKey)}`;
    await getPostgresDatabase().prepare(`INSERT INTO users(id,first_name,last_name,username,avatar,rating,xp,level,intro_id,created_at,updated_at)
      VALUES(?,?,?,?,?,1000,0,1,'dramatic-look',NOW(),NOW())`).bind(userId, firstName, lastName, nickname, avatarUrl).run();
    const token = await createSession(userId);
    const user = await getPostgresDatabase().prepare("SELECT * FROM users WHERE id=?").bind(userId).first();
    return Response.json({ state: "AUTHENTICATED", user: publicUser(user || {}) }, { status: 201, headers: { "set-cookie": sessionCookie(token) } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Account creation failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  await ready();
  await deleteSession(request);
  return Response.json({ ok: true }, { headers: { "set-cookie": expiredSessionCookie() } });
}

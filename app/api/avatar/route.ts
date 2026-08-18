import { getStore } from "@netlify/blobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!/^[a-f0-9-]+\/avatar-\d+\.(jpg|png|webp)$/.test(key)) return new Response("Not found", { status: 404 });
  const entry = await getStore("avatars").getWithMetadata(key, { type: "arrayBuffer" });
  if (!entry) return new Response("Not found", { status: 404 });
  return new Response(entry.data, { headers: { "content-type": String(entry.metadata?.contentType || "image/jpeg"), "cache-control": "public, max-age=31536000, immutable" } });
}

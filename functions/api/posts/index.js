import { json, badRequest, unauthorized, requireAdmin, newId } from "../../_lib/utils.js";

function rowToPost(r) {
  return {
    id: r.id,
    title: r.title,
    jenis: r.jenis,
    genres: r.genres ? JSON.parse(r.genres) : [],
    platform: r.platform ? JSON.parse(r.platform) : [],
    bahasa: r.bahasa,
    date: r.date,
    thumbnail: r.thumbnail,
    content: r.content,
    published: !!r.published,
    scheduledAt: r.scheduledAt || null
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const wantAll = url.searchParams.get("all") === "1";

  if (wantAll) {
    if (!(await requireAdmin(request, env))) return unauthorized();
    const { results } = await env.DB.prepare("SELECT * FROM posts ORDER BY date DESC").all();
    return json(results.map(rowToPost));
  }

  // Publik: hanya published & sudah lewat jadwal (scheduledAt)
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(
    "SELECT * FROM posts WHERE published = 1 AND (scheduledAt IS NULL OR scheduledAt <= ?) ORDER BY date DESC"
  )
    .bind(now)
    .all();
  return json(results.map(rowToPost));
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || !body.title) return badRequest("Data postingan tidak lengkap");

  const id = body.id || newId("post");
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO posts (id, title, jenis, genres, platform, bahasa, date, thumbnail, content, published, scheduledAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.title,
      body.jenis || null,
      JSON.stringify(body.genres || []),
      JSON.stringify(body.platform || []),
      body.bahasa || null,
      body.date || now.slice(0, 10),
      body.thumbnail || null,
      body.content || "",
      body.published === false ? 0 : 1,
      body.scheduledAt || null,
      now,
      now
    )
    .run();

  return json({ ok: true, id });
}

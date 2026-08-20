import { json, badRequest, unauthorized, requireAdmin } from "../../_lib/utils.js";

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

export async function onRequestGet({ params, env }) {
  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(params.id).first();
  if (!row) return json({ error: "Tidak ditemukan" }, 404);
  return json(rowToPost(row));
}

export async function onRequestPut({ request, params, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body) return badRequest("Data tidak valid");

  const existing = await env.DB.prepare("SELECT id FROM posts WHERE id = ?").bind(params.id).first();
  if (!existing) return json({ error: "Tidak ditemukan" }, 404);

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE posts SET title=?, jenis=?, genres=?, platform=?, bahasa=?, date=?, thumbnail=?, content=?, published=?, scheduledAt=?, updatedAt=? WHERE id=?`
  )
    .bind(
      body.title,
      body.jenis || null,
      JSON.stringify(body.genres || []),
      JSON.stringify(body.platform || []),
      body.bahasa || null,
      body.date,
      body.thumbnail || null,
      body.content || "",
      body.published === false ? 0 : 1,
      body.scheduledAt || null,
      now,
      params.id
    )
    .run();

  return json({ ok: true });
}

/** DELETE = pindahkan ke Recycle Bin (trash_posts), bukan hapus permanen. */
export async function onRequestDelete({ request, params, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(params.id).first();
  if (!row) return json({ error: "Tidak ditemukan" }, 404);

  await env.DB.prepare("INSERT INTO trash_posts (id, data, deletedAt) VALUES (?, ?, ?)")
    .bind(row.id, JSON.stringify(rowToPost(row)), new Date().toISOString())
    .run();
  await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(params.id).run();

  return json({ ok: true });
}

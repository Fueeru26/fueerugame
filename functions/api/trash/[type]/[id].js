import { json, badRequest, unauthorized, requireAdmin } from "../../../_lib/utils.js";

export async function onRequestPost({ request, params, env }) {
  // restore
  if (!(await requireAdmin(request, env))) return unauthorized();
  const isPost = params.type === "posts";
  const trashTable = isPost ? "trash_posts" : "trash_reports";
  if (!isPost && params.type !== "reports") return badRequest("type tidak valid");

  const row = await env.DB.prepare(`SELECT * FROM ${trashTable} WHERE id = ?`).bind(params.id).first();
  if (!row) return json({ error: "Tidak ditemukan" }, 404);
  const item = JSON.parse(row.data);

  if (isPost) {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO posts (id, title, jenis, genres, platform, bahasa, date, thumbnail, content, published, scheduledAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        item.id,
        item.title,
        item.jenis || null,
        JSON.stringify(item.genres || []),
        JSON.stringify(item.platform || []),
        item.bahasa || null,
        item.date,
        item.thumbnail || null,
        item.content || "",
        item.published === false ? 0 : 1,
        item.scheduledAt || null,
        now,
        now
      )
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO reports (id, title, name, contactMedia, content, attachment, date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        item.id,
        item.title,
        item.name || "",
        item.contactMedia || "",
        item.content,
        item.attachment ? JSON.stringify(item.attachment) : null,
        item.date,
        item.status || "belum"
      )
      .run();
  }

  await env.DB.prepare(`DELETE FROM ${trashTable} WHERE id = ?`).bind(params.id).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, params, env }) {
  // hapus permanen
  if (!(await requireAdmin(request, env))) return unauthorized();
  const trashTable = params.type === "posts" ? "trash_posts" : params.type === "reports" ? "trash_reports" : null;
  if (!trashTable) return badRequest("type tidak valid");

  await env.DB.prepare(`DELETE FROM ${trashTable} WHERE id = ?`).bind(params.id).run();
  return json({ ok: true });
}

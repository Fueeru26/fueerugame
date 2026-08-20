import { json, unauthorized, requireAdmin } from "../../_lib/utils.js";

function rowToReport(r) {
  return {
    id: r.id,
    title: r.title,
    name: r.name,
    contactMedia: r.contactMedia,
    content: r.content,
    attachment: r.attachment ? JSON.parse(r.attachment) : null,
    date: r.date,
    status: r.status
  };
}

export async function onRequestPut({ request, params, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || !body.status) return json({ error: "Status tidak valid" }, 400);

  await env.DB.prepare("UPDATE reports SET status = ? WHERE id = ?").bind(body.status, params.id).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, params, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  const row = await env.DB.prepare("SELECT * FROM reports WHERE id = ?").bind(params.id).first();
  if (!row) return json({ error: "Tidak ditemukan" }, 404);

  await env.DB.prepare("INSERT INTO trash_reports (id, data, deletedAt) VALUES (?, ?, ?)")
    .bind(row.id, JSON.stringify(rowToReport(row)), new Date().toISOString())
    .run();
  await env.DB.prepare("DELETE FROM reports WHERE id = ?").bind(params.id).run();

  return json({ ok: true });
}

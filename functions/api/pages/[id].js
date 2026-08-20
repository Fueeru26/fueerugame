import { json, badRequest, unauthorized, requireAdmin } from "../../_lib/utils.js";

export async function onRequestGet({ params, env }) {
  const row = await env.DB.prepare("SELECT * FROM pages WHERE id = ?").bind(params.id).first();
  if (!row) return json({ title: "", content: "" });
  return json({ title: row.title, content: row.content });
}

export async function onRequestPut({ request, params, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || typeof body.content !== "string") return badRequest("Konten tidak valid");

  await env.DB.prepare(
    "INSERT INTO pages (id, title, content) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET content = excluded.content"
  )
    .bind(params.id, body.title || params.id, body.content)
    .run();

  return json({ ok: true });
}

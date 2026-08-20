import { json, badRequest, unauthorized, requireAdmin, newId } from "../../_lib/utils.js";

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

export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  const { results } = await env.DB.prepare("SELECT * FROM reports ORDER BY date DESC").all();
  return json(results.map(rowToReport));
}

/** Publik: siapa saja boleh kirim laporan lewat halaman Laporkan (tanpa password). */
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body || !body.title || !body.content) return badRequest("Data laporan tidak lengkap");

  const id = newId("report");
  await env.DB.prepare(
    "INSERT INTO reports (id, title, name, contactMedia, content, attachment, date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      id,
      body.title,
      body.name || "",
      body.contactMedia || "",
      body.content,
      body.attachment ? JSON.stringify(body.attachment) : null,
      new Date().toISOString(),
      "belum"
    )
    .run();

  return json({ ok: true, id });
}

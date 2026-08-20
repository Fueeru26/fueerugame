import { json, badRequest, unauthorized, requireAdmin } from "../../../_lib/utils.js";

export async function onRequestGet({ request, params, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  const table = params.type === "posts" ? "trash_posts" : params.type === "reports" ? "trash_reports" : null;
  if (!table) return badRequest("type tidak valid");

  const { results } = await env.DB.prepare(`SELECT * FROM ${table} ORDER BY deletedAt DESC`).all();
  return json(
    results.map((r) => {
      const item = JSON.parse(r.data);
      item.deletedAt = r.deletedAt;
      return item;
    })
  );
}

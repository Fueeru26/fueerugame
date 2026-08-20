// Helper bersama untuk semua endpoint API (folder ini diawali "_" jadi
// tidak dianggap route oleh Cloudflare Pages Functions).

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export function badRequest(msg) {
  return json({ error: msg || "Bad request" }, 400);
}

export function unauthorized() {
  return json({ error: "Password admin salah atau tidak dikirim" }, 401);
}

/** Cek header X-Admin-Password terhadap password admin yang tersimpan di D1.
 * Dipakai di semua endpoint yang mengubah data (create/update/delete). */
export async function requireAdmin(request, env) {
  const sent = request.headers.get("x-admin-password") || "";
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_password'").first();
  const current = row ? row.value : "admin123";
  return sent && sent === current;
}

export function newId(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

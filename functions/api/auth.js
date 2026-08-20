import { json, badRequest, unauthorized, requireAdmin } from "../_lib/utils.js";

/** Cek password saat login Admin Panel. Body: { password } */
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body || !body.password) return badRequest("Password tidak dikirim");

  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_password'").first();
  const current = row ? row.value : "admin123";
  if (body.password !== current) return unauthorized();
  return json({ ok: true });
}

/** Ganti password admin. Butuh header X-Admin-Password (password lama/saat ini). */
export async function onRequestPut({ request, env }) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || !body.newPassword) return badRequest("Password baru tidak dikirim");

  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('admin_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(body.newPassword)
    .run();

  return json({ ok: true });
}

/** Reset password lewat "Lupa Kata Sandi" (kata sandi darurat), tidak butuh
 * password admin saat ini. Body: { emergencyPassword, newPassword } */
const EMERGENCY_PASSWORD = "GINTAMA12345";
export async function onRequestPatch({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body || !body.emergencyPassword || !body.newPassword) return badRequest("Data tidak lengkap");
  if (body.emergencyPassword !== EMERGENCY_PASSWORD) return unauthorized();

  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('admin_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(body.newPassword)
    .run();

  return json({ ok: true });
}

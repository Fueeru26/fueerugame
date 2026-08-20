/* =========================================================
   Fueeru Game — Worker entry point (Workers + Static Assets)
   Menangani semua /api/... di sini secara manual, lalu untuk path
   lainnya melempar ke ASSETS (file statis: html/css/js/gambar).
   ========================================================= */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function badRequest(msg) {
  return json({ error: msg || "Bad request" }, 400);
}
function unauthorized() {
  return json({ error: "Password admin salah atau tidak dikirim" }, 401);
}
function notFound() {
  return json({ error: "Tidak ditemukan" }, 404);
}
async function requireAdmin(request, env) {
  const sent = request.headers.get("x-admin-password") || "";
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_password'").first();
  const current = row ? row.value : "admin123";
  return sent && sent === current;
}
function newId(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

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

const EMERGENCY_PASSWORD = "GINTAMA12345";

async function handlePosts(request, env, method) {
  const url = new URL(request.url);
  if (method === "GET") {
    const wantAll = url.searchParams.get("all") === "1";
    if (wantAll) {
      if (!(await requireAdmin(request, env))) return unauthorized();
      const { results } = await env.DB.prepare("SELECT * FROM posts ORDER BY date DESC").all();
      return json(results.map(rowToPost));
    }
    const now = new Date().toISOString();
    const { results } = await env.DB.prepare(
      "SELECT * FROM posts WHERE published = 1 AND (scheduledAt IS NULL OR scheduledAt <= ?) ORDER BY date DESC"
    )
      .bind(now)
      .all();
    return json(results.map(rowToPost));
  }
  if (method === "POST") {
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
  return badRequest("Method tidak didukung");
}

async function handlePostById(request, env, method, id) {
  if (method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
    if (!row) return notFound();
    return json(rowToPost(row));
  }
  if (method === "PUT") {
    if (!(await requireAdmin(request, env))) return unauthorized();
    const body = await request.json().catch(() => null);
    if (!body) return badRequest("Data tidak valid");
    const existing = await env.DB.prepare("SELECT id FROM posts WHERE id = ?").bind(id).first();
    if (!existing) return notFound();
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
        id
      )
      .run();
    return json({ ok: true });
  }
  if (method === "DELETE") {
    if (!(await requireAdmin(request, env))) return unauthorized();
    const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
    if (!row) return notFound();
    await env.DB.prepare("INSERT INTO trash_posts (id, data, deletedAt) VALUES (?, ?, ?)")
      .bind(row.id, JSON.stringify(rowToPost(row)), new Date().toISOString())
      .run();
    await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  return badRequest("Method tidak didukung");
}

async function handlePageById(request, env, method, id) {
  if (method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM pages WHERE id = ?").bind(id).first();
    if (!row) return json({ title: "", content: "" });
    return json({ title: row.title, content: row.content });
  }
  if (method === "PUT") {
    if (!(await requireAdmin(request, env))) return unauthorized();
    const body = await request.json().catch(() => null);
    if (!body || typeof body.content !== "string") return badRequest("Konten tidak valid");
    await env.DB.prepare(
      "INSERT INTO pages (id, title, content) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET content = excluded.content"
    )
      .bind(id, body.title || id, body.content)
      .run();
    return json({ ok: true });
  }
  return badRequest("Method tidak didukung");
}

async function handleReports(request, env, method) {
  if (method === "GET") {
    if (!(await requireAdmin(request, env))) return unauthorized();
    const { results } = await env.DB.prepare("SELECT * FROM reports ORDER BY date DESC").all();
    return json(results.map(rowToReport));
  }
  if (method === "POST") {
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
  return badRequest("Method tidak didukung");
}

async function handleReportById(request, env, method, id) {
  if (method === "PUT") {
    if (!(await requireAdmin(request, env))) return unauthorized();
    const body = await request.json().catch(() => null);
    if (!body || !body.status) return badRequest("Status tidak valid");
    await env.DB.prepare("UPDATE reports SET status = ? WHERE id = ?").bind(body.status, id).run();
    return json({ ok: true });
  }
  if (method === "DELETE") {
    if (!(await requireAdmin(request, env))) return unauthorized();
    const row = await env.DB.prepare("SELECT * FROM reports WHERE id = ?").bind(id).first();
    if (!row) return notFound();
    await env.DB.prepare("INSERT INTO trash_reports (id, data, deletedAt) VALUES (?, ?, ?)")
      .bind(row.id, JSON.stringify(rowToReport(row)), new Date().toISOString())
      .run();
    await env.DB.prepare("DELETE FROM reports WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  return badRequest("Method tidak didukung");
}

async function handleTrashList(request, env, method, type) {
  if (method !== "GET") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();
  const table = type === "posts" ? "trash_posts" : type === "reports" ? "trash_reports" : null;
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

async function handleTrashItem(request, env, method, type, id) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  const isPost = type === "posts";
  if (!isPost && type !== "reports") return badRequest("type tidak valid");
  const trashTable = isPost ? "trash_posts" : "trash_reports";

  if (method === "POST") {
    const row = await env.DB.prepare(`SELECT * FROM ${trashTable} WHERE id = ?`).bind(id).first();
    if (!row) return notFound();
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
    await env.DB.prepare(`DELETE FROM ${trashTable} WHERE id = ?`).bind(id).run();
    return json({ ok: true });
  }
  if (method === "DELETE") {
    await env.DB.prepare(`DELETE FROM ${trashTable} WHERE id = ?`).bind(id).run();
    return json({ ok: true });
  }
  return badRequest("Method tidak didukung");
}

async function handleAuth(request, env, method) {
  if (method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body || !body.password) return badRequest("Password tidak dikirim");
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_password'").first();
    const current = row ? row.value : "admin123";
    if (body.password !== current) return unauthorized();
    return json({ ok: true });
  }
  if (method === "PUT") {
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
  if (method === "PATCH") {
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
  return badRequest("Method tidak didukung");
}

async function sendOtpEmail(env, toEmail, code) {
  const res = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + env.MAILERSEND_API_TOKEN
    },
    body: JSON.stringify({
      from: { email: env.MAIL_FROM, name: "Fueeru Game" },
      to: [{ email: toEmail }],
      subject: "Kode OTP Reset Kata Sandi Admin",
      text:
        "Kode OTP kamu: " +
        code +
        "\n\nKode ini berlaku 5 menit. Jangan bagikan kode ini ke siapa pun.\n\nKalau kamu tidak meminta ini, abaikan email ini."
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error("Gagal kirim email: " + res.status + " " + t.slice(0, 200));
  }
}

async function handleOtpRequest(request, env, method) {
  if (method !== "POST") return badRequest("Method tidak didukung");
  const body = await request.json().catch(() => null);
  const emailInput = (body && body.email ? String(body.email) : "").trim().toLowerCase();
  if (!emailInput) return badRequest("Email belum diisi.");

  const registeredEmails = env.ADMIN_EMAIL.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!registeredEmails.includes(emailInput)) {
    return json({ error: "Email tidak terdaftar sebagai admin." }, 403);
  }

  // Rate limit: minimal 60 detik antar permintaan OTP.
  const lastRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'last_otp_sent_at'").first();
  if (lastRow) {
    const elapsed = Date.now() - new Date(lastRow.value).getTime();
    if (elapsed < 60000) {
      return json({ error: "Tunggu sebentar sebelum minta kode lagi." }, 429);
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  try {
    await sendOtpEmail(env, emailInput, code);
  } catch (e) {
    return json({ error: e.message }, 500);
  }

  await env.DB.prepare("INSERT INTO otp_codes (id, code, expiresAt, used, createdAt) VALUES (?, ?, ?, 0, ?)")
    .bind(newId("otp"), code, expiresAt, now)
    .run();
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('last_otp_sent_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(now)
    .run();

  return json({ ok: true });
}

async function handleOtpVerify(request, env, method) {
  if (method !== "POST") return badRequest("Method tidak didukung");
  const body = await request.json().catch(() => null);
  if (!body || !body.code || !body.newPassword) return badRequest("Data tidak lengkap");

  const row = await env.DB.prepare(
    "SELECT * FROM otp_codes WHERE code = ? AND used = 0 ORDER BY createdAt DESC LIMIT 1"
  )
    .bind(String(body.code).trim())
    .first();

  if (!row) return json({ error: "Kode OTP salah." }, 401);
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    return json({ error: "Kode OTP sudah kedaluwarsa. Minta kode baru." }, 401);
  }

  await env.DB.prepare("UPDATE otp_codes SET used = 1 WHERE id = ?").bind(row.id).run();
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('admin_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(body.newPassword)
    .run();

  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === "/api/posts") return await handlePosts(request, env, method);

      let m = path.match(/^\/api\/posts\/([^/]+)$/);
      if (m) return await handlePostById(request, env, method, decodeURIComponent(m[1]));

      m = path.match(/^\/api\/pages\/([^/]+)$/);
      if (m) return await handlePageById(request, env, method, decodeURIComponent(m[1]));

      if (path === "/api/reports") return await handleReports(request, env, method);

      m = path.match(/^\/api\/reports\/([^/]+)$/);
      if (m) return await handleReportById(request, env, method, decodeURIComponent(m[1]));

      m = path.match(/^\/api\/trash\/([^/]+)$/);
      if (m) return await handleTrashList(request, env, method, m[1]);

      m = path.match(/^\/api\/trash\/([^/]+)\/([^/]+)$/);
      if (m) return await handleTrashItem(request, env, method, m[1], decodeURIComponent(m[2]));

      if (path === "/api/auth") return await handleAuth(request, env, method);

      if (path === "/api/auth/otp/request") return await handleOtpRequest(request, env, method);
      if (path === "/api/auth/otp/verify") return await handleOtpVerify(request, env, method);

      if (path.startsWith("/api/")) return json({ error: "Endpoint tidak ditemukan" }, 404);

      // Bukan /api/... -> serve file statis (html/css/js/gambar)
      return env.ASSETS.fetch(request);
    } catch (err) {
      return json({ error: "Kesalahan server: " + err.message }, 500);
    }
  }
};

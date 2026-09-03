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
    status: r.status,
    formType: r.formType || "lapor",
    gameName: r.gameName || null,
    engine: r.engine || null,
    gameLink: r.gameLink || null
  };
}
function rowToInfoItem(r) {
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    content: r.content,
    gameLink: r.gameLink || null,
    date: r.date
  };
}

const EMERGENCY_PASSWORD = "GINTAMA12345";

// =========================================================
// Backup Website & Deploy Website (lewat GitHub Git Data API)
// Butuh secret GITHUB_TOKEN (Personal Access Token, scope "repo").
// =========================================================
const GITHUB_OWNER = "Fueeru26";
const GITHUB_REPO = "fueerugame";
const GITHUB_BRANCH = "main";
const GITHUB_API = "https://api.github.com";

function githubHeaders(env, extra) {
  return Object.assign(
    {
      authorization: "Bearer " + env.GITHUB_TOKEN,
      accept: "application/vnd.github+json",
      "user-agent": "fueeru-admin-panel",
      "x-github-api-version": "2022-11-28"
    },
    extra || {}
  );
}

/** [ADMIN] Backup Website: proxy zip lengkap repo GitHub. */
async function handleBackupWebsite(request, env, method) {
  if (method !== "GET") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();

  const url = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/zipball/${GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: githubHeaders(env) });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return json({ error: "Gagal mengambil backup dari GitHub: " + res.status + " " + t.slice(0, 200) }, 502);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(res.body, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="fueerugame-backup-${stamp}.zip"`
    }
  });
}

/** [ADMIN] Mulai sesi deploy baru -> bikin baris kosong di deploy_sessions. */
async function handleDeployStart(request, env, method) {
  if (method !== "POST") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const expectedTotal = Number(body.expectedTotal) || 0;
  if (expectedTotal <= 0) return badRequest("expectedTotal tidak valid");

  // Bersihkan sesi lama (>2 jam) yang gak pernah diselesaikan.
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("DELETE FROM deploy_sessions WHERE createdAt < ?").bind(cutoff).run();

  const id = newId("deploy");
  await env.DB.prepare(
    "INSERT INTO deploy_sessions (id, files, expectedTotal, createdAt) VALUES (?, '[]', ?, ?)"
  )
    .bind(id, expectedTotal, new Date().toISOString())
    .run();
  return json({ ok: true, sessionId: id });
}

/** [ADMIN] Terima 1 batch file (maks ~40), bikin blob GitHub untuk tiap file,
 * lalu simpan { path, sha } hasilnya ke sesi. */
async function handleDeployBatch(request, env, method) {
  if (method !== "POST") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || !body.sessionId || !Array.isArray(body.files)) return badRequest("Data tidak valid");
  if (body.files.length > 45) return badRequest("Maksimal 45 file per batch");

  const session = await env.DB.prepare("SELECT * FROM deploy_sessions WHERE id = ?").bind(body.sessionId).first();
  if (!session) return json({ error: "Sesi deploy tidak ditemukan / sudah kedaluwarsa" }, 404);

  const existing = JSON.parse(session.files || "[]");

  for (const f of body.files) {
    if (!f.path || typeof f.contentBase64 !== "string") continue;
    const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/blobs`, {
      method: "POST",
      headers: githubHeaders(env, { "content-type": "application/json" }),
      body: JSON.stringify({ content: f.contentBase64, encoding: "base64" })
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return json({ error: `Gagal upload "${f.path}": ${res.status} ${t.slice(0, 200)}` }, 502);
    }
    const data = await res.json();
    existing.push({ path: f.path, sha: data.sha });
  }

  await env.DB.prepare("UPDATE deploy_sessions SET files = ? WHERE id = ?")
    .bind(JSON.stringify(existing), body.sessionId)
    .run();

  return json({ ok: true, totalSoFar: existing.length });
}

/** [ADMIN] Rakit semua blob jadi 1 tree baru (replace total), 1 commit, lalu
 * update branch -> otomatis memicu GitHub Actions auto-deploy. */
async function handleDeployFinish(request, env, method) {
  if (method !== "POST") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || !body.sessionId) return badRequest("Data tidak valid");

  const session = await env.DB.prepare("SELECT * FROM deploy_sessions WHERE id = ?").bind(body.sessionId).first();
  if (!session) return json({ error: "Sesi deploy tidak ditemukan / sudah kedaluwarsa" }, 404);

  const files = JSON.parse(session.files || "[]");
  if (files.length === 0 || files.length !== session.expectedTotal) {
    return json({ error: `Belum lengkap: ${files.length}/${session.expectedTotal} file terupload.` }, 400);
  }

  // 1) Ambil commit terakhir di branch.
  const refRes = await fetch(
    `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/ref/heads/${GITHUB_BRANCH}`,
    { headers: githubHeaders(env) }
  );
  if (!refRes.ok) return json({ error: "Gagal ambil ref branch dari GitHub" }, 502);
  const refData = await refRes.json();
  const parentSha = refData.object.sha;

  // 2) Buat tree baru dari NOL (tanpa base_tree) -> full replace, file yang
  //    tidak ada di daftar otomatis "hilang" dari commit baru.
  const treeRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees`, {
    method: "POST",
    headers: githubHeaders(env, { "content-type": "application/json" }),
    body: JSON.stringify({
      tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", sha: f.sha }))
    })
  });
  if (!treeRes.ok) {
    const t = await treeRes.text().catch(() => "");
    return json({ error: "Gagal buat tree: " + t.slice(0, 300) }, 502);
  }
  const treeData = await treeRes.json();

  // 3) Buat commit baru.
  const commitRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits`, {
    method: "POST",
    headers: githubHeaders(env, { "content-type": "application/json" }),
    body: JSON.stringify({
      message: "Deploy dari Admin Panel " + new Date().toISOString(),
      tree: treeData.sha,
      parents: [parentSha]
    })
  });
  if (!commitRes.ok) return json({ error: "Gagal buat commit baru" }, 502);
  const commitData = await commitRes.json();

  // 4) Update branch supaya nunjuk ke commit baru -> trigger GitHub Actions.
  const updateRes = await fetch(
    `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`,
    {
      method: "PATCH",
      headers: githubHeaders(env, { "content-type": "application/json" }),
      body: JSON.stringify({ sha: commitData.sha, force: false })
    }
  );
  if (!updateRes.ok) {
    const t = await updateRes.text().catch(() => "");
    return json({ error: "Gagal update branch: " + t.slice(0, 300) }, 502);
  }

  await env.DB.prepare("DELETE FROM deploy_sessions WHERE id = ?").bind(body.sessionId).run();

  return json({ ok: true, commitSha: commitData.sha, fileCount: files.length });
}

/** [ADMIN] Daftar lengkap folder & file di repo (untuk Penampil File, read-only). */
async function handleFilesTree(request, env, method) {
  if (method !== "GET") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();

  const res = await fetch(
    `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1`,
    { headers: githubHeaders(env) }
  );
  if (!res.ok) return json({ error: "Gagal mengambil daftar file dari GitHub" }, 502);
  const data = await res.json();
  const items = (data.tree || [])
    .filter((t) => t.type === "blob" || t.type === "tree")
    .map((t) => ({ path: t.path, type: t.type === "tree" ? "folder" : "file", size: t.size || 0 }));
  return json({ items, truncated: !!data.truncated });
}

/** Deteksi 'mobile' | 'desktop' dari User-Agent (heuristik sederhana, cukup
 * akurat untuk statistik kasar, tidak perlu library UA-parser tambahan). */
function detectDeviceType(userAgent) {
  const ua = (userAgent || "").toLowerCase();
  const isMobile = /mobi|android|iphone|ipad|ipod/.test(ua);
  return isMobile ? "mobile" : "desktop";
}

/** Ekstrak domain dari header Referer / document.referrer, atau "Direct"
 * kalau kosong (akses langsung / referrer di-strip browser). */
function extractReferrerDomain(referrer) {
  if (!referrer) return "Direct";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    // Referrer dari situs sendiri (navigasi internal) tidak dihitung sebagai
    // sumber eksternal.
    if (host === "fueerugame.com" || host === "fueeru.pages.dev") return "Direct";
    return host || "Direct";
  } catch (e) {
    return "Direct";
  }
}

/** [ADMIN] Riwayat commit/deploy — ditarik LANGSUNG dari GitHub Actions API
 * tiap dibuka (bukan disalin ke D1), difilter khusus workflow
 * "Deploy to Cloudflare" (pakai endpoint per-workflow bawaan GitHub supaya
 * tidak kecampur workflow lain), dibuang yang lebih dari 30 hari (hanya
 * penyaringan tampilan di Admin Panel, histori asli di GitHub tetap utuh
 * selamanya), dipaginasi 20/halaman. Tidak ada tombol hapus karena ini
 * bukan data milik kita.
 * ID workflow di-cache di settings (jarang berubah) supaya hemat 1 API
 * call GitHub di request-request berikutnya. */
async function getDeployWorkflowId(env) {
  const cached = await env.DB.prepare("SELECT value FROM settings WHERE key = 'gh_deploy_workflow_id'").first();
  if (cached && cached.value) return cached.value;

  const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows`, {
    headers: githubHeaders(env)
  });
  if (!res.ok) return null;
  const data = await res.json();
  const wf = (data.workflows || []).find((w) => w.name === "Deploy to Cloudflare");
  if (!wf) return null;

  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('gh_deploy_workflow_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(String(wf.id))
    .run();
  return String(wf.id);
}

async function handleCommitHistory(request, env, method) {
  if (method !== "GET") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);

  const workflowId = await getDeployWorkflowId(env);
  if (!workflowId) {
    return json({ error: "Workflow \"Deploy to Cloudflare\" tidak ditemukan di repo GitHub." }, 502);
  }

  const res = await fetch(
    `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflowId}/runs?per_page=10&page=${page}`,
    { headers: githubHeaders(env) }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return json({ error: "Gagal mengambil riwayat dari GitHub: " + res.status + " " + t.slice(0, 200) }, 502);
  }
  const data = await res.json();
  const rawRuns = data.workflow_runs || [];

  const cutoff = Date.now() - 30 * 86400000;
  const items = rawRuns
    .filter((r) => new Date(r.created_at).getTime() >= cutoff)
    .map((r) => ({
      id: r.id,
      runNumber: r.run_number,
      status: r.status,
      conclusion: r.conclusion,
      headSha: (r.head_sha || "").slice(0, 7),
      commitMessage: r.head_commit ? String(r.head_commit.message || "").split("\n")[0] : "",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      htmlUrl: r.html_url
    }));

  const hasMore = items.length > 0 && rawRuns.length === 10;

  return json({ items, page, hasMore });
}

/** [PUBLIK] Catat 1 kunjungan situs (dipanggil sekali per pemuatan halaman).
 * Ikut menyimpan device, negara/kota (dari header Cloudflare gratis), dan
 * domain perujuk — dipakai statistik pengunjung di Informasi Web. */
async function handleTrackVisit(request, env, method) {
  if (method !== "POST") return badRequest("Method tidak didukung");
  const body = await request.json().catch(() => ({}));
  const device = detectDeviceType(request.headers.get("user-agent"));
  const country = request.headers.get("cf-ipcountry") || null;
  const city = (request.cf && request.cf.city) || null;
  const referrer = extractReferrerDomain(body && body.referrer ? String(body.referrer) : "");

  await env.DB.prepare(
    "INSERT INTO site_visits (id, date, device, country, city, referrer) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(newId("visit"), new Date().toISOString(), device, country, city, referrer)
    .run();
  return json({ ok: true });
}

/** [PUBLIK] Catat 1 kali halaman statis (Tutorial/Cara Download/Donasi/
 * Tentang) dibuka — dipakai "Halaman Paling Sering Dibuka" di Informasi Web. */
async function handleTrackPage(request, env, method) {
  if (method !== "POST") return badRequest("Method tidak didukung");
  const body = await request.json().catch(() => null);
  const allowedPages = ["tutorial", "cara-download", "donasi", "tentang"];
  if (!body || !allowedPages.includes(body.pageId)) return badRequest("pageId tidak valid");
  await env.DB.prepare("INSERT INTO page_views (id, pageId, date) VALUES (?, ?, ?)")
    .bind(newId("pv"), body.pageId, new Date().toISOString())
    .run();
  return json({ ok: true });
}

/** [PUBLIK] Catat 1 kali postingan dilihat. */
async function handleTrackView(request, env, method) {
  if (method !== "POST") return badRequest("Method tidak didukung");
  const body = await request.json().catch(() => null);
  if (!body || !body.postId) return badRequest("postId wajib diisi");
  await env.DB.prepare("INSERT INTO post_views (id, postId, date) VALUES (?, ?, ?)")
    .bind(newId("view"), body.postId, new Date().toISOString())
    .run();
  return json({ ok: true });
}

/** [PUBLIK] Postingan paling populer berdasarkan total views di server
 * (gabungan semua pengunjung/device), dipakai widget "Game Populer" di
 * sidebar publik (mode desktop). */
async function handlePostsPopular(request, env, method) {
  if (method !== "GET") return badRequest("Method tidak didukung");
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "10", 10) || 10));
  const now = new Date().toISOString();

  const { results } = await env.DB.prepare(
    `SELECT p.*, COUNT(v.id) AS viewCount
     FROM posts p
     LEFT JOIN post_views v ON v.postId = p.id
     WHERE p.published = 1 AND (p.scheduledAt IS NULL OR p.scheduledAt <= ?)
     GROUP BY p.id
     ORDER BY viewCount DESC, p.date DESC
     LIMIT ?`
  )
    .bind(now, limit)
    .all();

  return json(results.map((r) => ({ ...rowToPost(r), views: r.viewCount || 0 })));
}

function weekBoundaries() {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() + diff);
  thisWeekStart.setHours(0, 0, 0, 0);
  const thisWeekEnd = new Date(thisWeekStart.getTime() + 7 * 86400000);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86400000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  return { thisWeekStart, thisWeekEnd, lastWeekStart, todayStart, sevenDaysAgo, now };
}

/** [ADMIN] Statistik kunjungan situs, akurat gabungan semua pengunjung/device.
 * Termasuk breakdown device, jam ramai (WIB), referrer, dan negara/kota
 * (dihitung dari 30 hari terakhir supaya tetap relevan). */
async function handleStatsVisits(request, env, method) {
  if (method !== "GET") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();

  const b = weekBoundaries();
  const count = async (fromIso, toIso) => {
    const row = toIso
      ? await env.DB.prepare("SELECT COUNT(*) AS c FROM site_visits WHERE date >= ? AND date < ?")
          .bind(fromIso, toIso)
          .first()
      : await env.DB.prepare("SELECT COUNT(*) AS c FROM site_visits WHERE date >= ?").bind(fromIso).first();
    return row ? row.c : 0;
  };

  const total = (await env.DB.prepare("SELECT COUNT(*) AS c FROM site_visits").first()).c;
  const today = await count(b.todayStart.toISOString());
  const thisWeek = await count(b.thisWeekStart.toISOString(), b.thisWeekEnd.toISOString());
  const lastWeek = await count(b.lastWeekStart.toISOString(), b.thisWeekStart.toISOString());
  const last7Days = await count(b.sevenDaysAgo.toISOString());
  const avgPerDay7d = Math.round((last7Days / 7) * 10) / 10;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const { results: deviceRows } = await env.DB.prepare(
    `SELECT COALESCE(device, 'unknown') AS device, COUNT(*) AS c
     FROM site_visits WHERE date >= ? GROUP BY device ORDER BY c DESC`
  )
    .bind(thirtyDaysAgo)
    .all();

  const { results: referrerRows } = await env.DB.prepare(
    `SELECT COALESCE(referrer, 'Direct') AS referrer, COUNT(*) AS c
     FROM site_visits WHERE date >= ? GROUP BY referrer ORDER BY c DESC LIMIT 8`
  )
    .bind(thirtyDaysAgo)
    .all();

  const { results: countryRows } = await env.DB.prepare(
    `SELECT COALESCE(country, '??') AS country, COALESCE(city, '') AS city, COUNT(*) AS c
     FROM site_visits WHERE date >= ? GROUP BY country, city ORDER BY c DESC LIMIT 8`
  )
    .bind(thirtyDaysAgo)
    .all();

  const { results: hourRows } = await env.DB.prepare(
    `SELECT CAST(((CAST(strftime('%H', date) AS INTEGER) + 7) % 24) AS TEXT) AS hour, COUNT(*) AS c
     FROM site_visits WHERE date >= ? GROUP BY hour`
  )
    .bind(thirtyDaysAgo)
    .all();
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const row = hourRows.find((r) => Number(r.hour) === h);
    return { hour: h, count: row ? row.c : 0 };
  });

  return json({
    total,
    today,
    thisWeek,
    lastWeek,
    avgPerDay7d,
    deviceBreakdown: deviceRows,
    referrerBreakdown: referrerRows,
    locationBreakdown: countryRows,
    hourly
  });
}

/** [ADMIN] Statistik views postingan, akurat gabungan semua pengunjung/device
 * (hanya menghitung postingan yang masih ada). */
async function handleStatsViews(request, env, method) {
  if (method !== "GET") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();

  const b = weekBoundaries();
  const count = async (fromIso, toIso) => {
    const row = toIso
      ? await env.DB.prepare(
          "SELECT COUNT(*) AS c FROM post_views WHERE date >= ? AND date < ? AND postId IN (SELECT id FROM posts)"
        )
          .bind(fromIso, toIso)
          .first()
      : await env.DB.prepare(
          "SELECT COUNT(*) AS c FROM post_views WHERE date >= ? AND postId IN (SELECT id FROM posts)"
        )
          .bind(fromIso)
          .first();
    return row ? row.c : 0;
  };

  const total = (
    await env.DB.prepare("SELECT COUNT(*) AS c FROM post_views WHERE postId IN (SELECT id FROM posts)").first()
  ).c;
  const today = await count(b.todayStart.toISOString());
  const thisWeek = await count(b.thisWeekStart.toISOString(), b.thisWeekEnd.toISOString());
  const lastWeek = await count(b.lastWeekStart.toISOString(), b.thisWeekStart.toISOString());

  return json({ total, today, thisWeek, lastWeek });
}

/** [ADMIN] Statistik lanjutan untuk entri "Postingan & Halaman": postingan
 * populer minggu ini, genre terpopuler (berdasar total views), dan halaman
 * statis (Tutorial/Cara Download/Donasi/Tentang) paling sering dibuka. */
async function handleStatsPostsHalaman(request, env, method) {
  if (method !== "GET") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();

  const b = weekBoundaries();

  const { results: popularThisWeek } = await env.DB.prepare(
    `SELECT p.id, p.title, COUNT(v.id) AS views
     FROM posts p
     JOIN post_views v ON v.postId = p.id
     WHERE v.date >= ? AND v.date < ?
     GROUP BY p.id
     ORDER BY views DESC
     LIMIT 5`
  )
    .bind(b.thisWeekStart.toISOString(), b.thisWeekEnd.toISOString())
    .all();

  const { results: topGenres } = await env.DB.prepare(
    `SELECT je.value AS genre, COUNT(v.id) AS views
     FROM posts p, json_each(p.genres) je
     LEFT JOIN post_views v ON v.postId = p.id
     GROUP BY je.value
     ORDER BY views DESC
     LIMIT 6`
  ).all();

  const pageLabels = {
    tutorial: "Tutorial Main",
    "cara-download": "Cara Download",
    donasi: "Donasi",
    tentang: "Tentang"
  };
  const { results: pageRows } = await env.DB.prepare(
    `SELECT pageId, COUNT(*) AS views FROM page_views GROUP BY pageId ORDER BY views DESC`
  ).all();
  const topPages = pageRows.map((r) => ({ pageId: r.pageId, label: pageLabels[r.pageId] || r.pageId, views: r.views }));

  return json({ popularThisWeek, topGenres, topPages });
}

/** Verifikasi tanda tangan HMAC-SHA256 dari GitHub webhook. */
async function verifyGithubWebhookSignature(secret, payloadText, signatureHeader) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadText));
  const computedHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expectedHex = signatureHeader.slice("sha256=".length);
  if (computedHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) diff |= computedHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}

/** [PUBLIK, tapi diverifikasi tanda tangan] Webhook dari GitHub — dipanggil
 * otomatis oleh GitHub tiap kali status workflow Actions berubah. Kita cuma
 * proses saat statusnya "completed" (final: berhasil/gagal), lalu simpan
 * sebagai notifikasi server supaya bisa muncul di lonceng Admin Panel,
 * berlaku untuk commit dari mana saja (Admin Panel, Termux, atau GitHub.com). */
async function handleGithubWebhook(request, env, method) {
  if (method !== "POST") return badRequest("Method tidak didukung");
  const payloadText = await request.text();
  const sigOk = await verifyGithubWebhookSignature(
    env.GITHUB_WEBHOOK_SECRET,
    payloadText,
    request.headers.get("x-hub-signature-256")
  );
  if (!sigOk) return unauthorized();

  const event = request.headers.get("x-github-event");
  if (event !== "workflow_run") return json({ ok: true, skipped: true });

  const body = JSON.parse(payloadText);
  const run = body.workflow_run;
  if (!run || run.status !== "completed") return json({ ok: true, skipped: true });

  // Cuma proses workflow deploy kita sendiri (deploy.yml), biar workflow lain
  // (mis. "pages build and deployment" bawaan GitHub) tidak ikut bikin notifikasi.
  if (run.name !== "Deploy to Cloudflare") return json({ ok: true, skipped: true });

  // Anti-dobel: GitHub kadang kirim ulang webhook yang sama (retry otomatis
  // atau redeliver manual) -> pastikan 1 run cuma menghasilkan 1 notifikasi.
  const dedupe = await env.DB.prepare(
    "INSERT OR IGNORE INTO processed_workflow_runs (run_id, processedAt) VALUES (?, ?)"
  )
    .bind(String(run.id), new Date().toISOString())
    .run();
  if (!dedupe.meta || dedupe.meta.changes === 0) return json({ ok: true, deduped: true });

  const shortSha = (run.head_sha || "").slice(0, 7);
  const isSuccess = run.conclusion === "success";
  const text = isSuccess
    ? `Deploy berhasil diterapkan ke Cloudflare (commit ${shortSha}).`
    : `Deploy GAGAL diterapkan (commit ${shortSha}, status: ${run.conclusion || "error"}).`;

  await env.DB.prepare("INSERT INTO server_notifications (id, type, text, date) VALUES (?, ?, ?, ?)")
    .bind(newId("srvnotif"), isSuccess ? "deploy_success" : "deploy_failed", text, new Date().toISOString())
    .run();

  // Simpan status deploy terakhir (dipakai entri "Informasi Dasar" & status
  // "Webhook GitHub" di "Performa Teknis") — di-update setiap kali webhook
  // sinyal deploy diterima, apapun hasilnya (berhasil/gagal), supaya jadi
  // indikator jujur "terakhir webhook aktif kapan".
  const nowIso = new Date().toISOString();
  const setSetting = async (key, value) =>
    env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
      .bind(key, value)
      .run();
  await setSetting("last_deploy_sha", shortSha);
  await setSetting("last_deploy_at", nowIso);
  await setSetting("last_deploy_status", isSuccess ? "success" : "failed");

  return json({ ok: true });
}

/** [ADMIN] Ambil notifikasi server yang belum diambil, lalu hapus (sekali ambil). */
async function handleServerNotifications(request, env, method) {
  if (method !== "GET") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();
  const { results } = await env.DB.prepare("SELECT * FROM server_notifications ORDER BY date ASC").all();
  if (results.length > 0) {
    await env.DB.prepare("DELETE FROM server_notifications").run();
  }
  return json(results);
}

/** ---------------- Redirect Page ---------------- */

/** Pastikan bagian terkunci "Redirect Countdown" selalu ada (dibuat sekali,
 * lazy, kalau belum ada baris dengan locked=1 di tabel). */
async function ensureRedirectCountdownSection(env) {
  const row = await env.DB.prepare("SELECT id FROM redirect_sections WHERE locked = 1 LIMIT 1").first();
  if (row) return;
  await env.DB.prepare(
    "INSERT INTO redirect_sections (id, name, description, content, sortOrder, locked, createdAt) VALUES (?, ?, ?, NULL, ?, 1, ?)"
  )
    .bind(newId("rsec"), "Redirect Countdown", "Bagian ini tidak dapat diedit dan dihapus", 0, new Date().toISOString())
    .run();
}

function rowToRedirectSection(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description || "",
    content: r.content || "",
    sortOrder: r.sortOrder,
    locked: !!r.locked,
    createdAt: r.createdAt
  };
}

/** [ADMIN] Daftar bagian Tampilan Redirect (GET) & tambah bagian baru (POST). */
async function handleRedirectSections(request, env, method) {
  if (!(await requireAdmin(request, env))) return unauthorized();

  if (method === "GET") {
    await ensureRedirectCountdownSection(env);
    const { results } = await env.DB.prepare("SELECT * FROM redirect_sections ORDER BY sortOrder ASC").all();
    return json(results.map(rowToRedirectSection));
  }

  if (method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body || !body.name || !body.content) {
      return badRequest("Nama Bagian dan Isi Bagian tidak boleh kosong");
    }
    const maxRow = await env.DB.prepare("SELECT MAX(sortOrder) as m FROM redirect_sections").first();
    const nextOrder = (maxRow && maxRow.m != null ? maxRow.m : -1) + 1;
    const id = newId("rsec");
    await env.DB.prepare(
      "INSERT INTO redirect_sections (id, name, description, content, sortOrder, locked, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)"
    )
      .bind(id, body.name, body.description || "", body.content, nextOrder, new Date().toISOString())
      .run();
    return json({ ok: true, id });
  }

  return badRequest("Method tidak didukung");
}

/** [ADMIN] Edit (PUT) / hapus (DELETE) satu bagian — ditolak kalau bagian terkunci. */
async function handleRedirectSectionById(request, env, method, id) {
  if (!(await requireAdmin(request, env))) return unauthorized();

  const existing = await env.DB.prepare("SELECT * FROM redirect_sections WHERE id = ?").bind(id).first();
  if (!existing) return notFound();
  if (existing.locked) return badRequest("Bagian ini tidak dapat diedit atau dihapus");

  if (method === "PUT") {
    const body = await request.json().catch(() => null);
    if (!body || !body.name || !body.content) {
      return badRequest("Nama Bagian dan Isi Bagian tidak boleh kosong");
    }
    await env.DB.prepare("UPDATE redirect_sections SET name = ?, description = ?, content = ? WHERE id = ?")
      .bind(body.name, body.description || "", body.content, id)
      .run();
    return json({ ok: true });
  }

  if (method === "DELETE") {
    await env.DB.prepare("DELETE FROM redirect_sections WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  return badRequest("Method tidak didukung");
}

/** [ADMIN] Simpan urutan baru semua bagian (drag reorder). Body: { order: [id, id, ...] } */
async function handleRedirectSectionsReorder(request, env, method) {
  if (method !== "PUT") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.order)) return badRequest("Data urutan tidak valid");

  for (let i = 0; i < body.order.length; i++) {
    await env.DB.prepare("UPDATE redirect_sections SET sortOrder = ? WHERE id = ?").bind(i, body.order[i]).run();
  }
  return json({ ok: true });
}

function newRedirectCode(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function rowToRedirectLink(r) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    cloudName: r.cloudName,
    cloudLink: r.cloudLink,
    redirectCode: r.redirectCode,
    createdAt: r.createdAt
  };
}

/** [ADMIN] Daftar semua link redirect (GET) & buat link baru (POST, generate kode unik). */
async function handleRedirectLinks(request, env, method) {
  if (!(await requireAdmin(request, env))) return unauthorized();

  if (method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM redirect_links ORDER BY createdAt DESC").all();
    return json(results.map(rowToRedirectLink));
  }

  if (method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body || !body.name || !body.type || !body.cloudName || !body.cloudLink) {
      return badRequest("Semua kolom harus diisi");
    }
    try {
      const cloudUrl = new URL(body.cloudLink);
      if (!cloudUrl.protocol.startsWith("http")) throw new Error("invalid");
    } catch (e) {
      return badRequest("Link Cloud tidak valid");
    }

    let code = newRedirectCode(12);
    for (let i = 0; i < 5; i++) {
      const clash = await env.DB.prepare("SELECT id FROM redirect_links WHERE redirectCode = ?").bind(code).first();
      if (!clash) break;
      code = newRedirectCode(12);
    }

    const id = newId("rlink");
    await env.DB.prepare(
      "INSERT INTO redirect_links (id, name, type, cloudName, cloudLink, redirectCode, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(id, body.name, body.type, body.cloudName, body.cloudLink, code, new Date().toISOString())
      .run();
    return json({ ok: true, id, redirectCode: code });
  }

  return badRequest("Method tidak didukung");
}

/** [ADMIN] Detail (GET), edit (PUT — tanpa ganti kode redirect), hapus (DELETE) 1 link. */
async function handleRedirectLinkById(request, env, method, id) {
  if (!(await requireAdmin(request, env))) return unauthorized();

  const existing = await env.DB.prepare("SELECT * FROM redirect_links WHERE id = ?").bind(id).first();
  if (!existing) return notFound();

  if (method === "GET") return json(rowToRedirectLink(existing));

  if (method === "PUT") {
    const body = await request.json().catch(() => null);
    if (!body || !body.name || !body.type || !body.cloudName || !body.cloudLink) {
      return badRequest("Semua kolom harus diisi");
    }
    try {
      const cloudUrl = new URL(body.cloudLink);
      if (!cloudUrl.protocol.startsWith("http")) throw new Error("invalid");
    } catch (e) {
      return badRequest("Link Cloud tidak valid");
    }
    await env.DB.prepare("UPDATE redirect_links SET name = ?, type = ?, cloudName = ?, cloudLink = ? WHERE id = ?")
      .bind(body.name, body.type, body.cloudName, body.cloudLink, id)
      .run();
    return json({ ok: true });
  }

  if (method === "DELETE") {
    await env.DB.prepare("DELETE FROM redirect_links WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  return badRequest("Method tidak didukung");
}

/** [PUBLIK] Ambil data 1 link + semua bagian tampilan, dipakai halaman
 * publik /redirect<kode> untuk merender halaman redirect. Tanpa auth. */
async function handleRedirectResolve(request, env, method, code) {
  if (method !== "GET") return badRequest("Method tidak didukung");
  const link = await env.DB.prepare("SELECT * FROM redirect_links WHERE redirectCode = ?").bind(code).first();
  if (!link) return notFound();

  await ensureRedirectCountdownSection(env);
  const { results } = await env.DB.prepare("SELECT * FROM redirect_sections ORDER BY sortOrder ASC").all();

  return json({
    link: rowToRedirectLink(link),
    sections: results.map((r) => ({
      id: r.id,
      name: r.name,
      content: r.content || "",
      locked: !!r.locked
    }))
  });
}

/** [ADMIN] Informasi dasar web: nama, link repo, link dashboard Worker,
 * versi/commit live & status deploy terakhir. Ukuran data lokal dihitung
 * di sisi klien (localStorage khusus per perangkat), tidak lewat sini. */
async function handleInfoBasic(request, env, method) {
  if (method !== "GET") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();

  const getSetting = async (key) => {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
    return row ? row.value : null;
  };

  return json({
    siteName: "Fueeru Game",
    repoOwner: GITHUB_OWNER,
    repoName: GITHUB_REPO,
    repoUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
    workerName: "fueerugame",
    workerDashboardUrl: "https://dash.cloudflare.com/?to=/:account/workers/services/view/fueerugame/production",
    lastDeploySha: await getSetting("last_deploy_sha"),
    lastDeployAt: await getSetting("last_deploy_at"),
    lastDeployStatus: await getSetting("last_deploy_status")
  });
}

/** [ADMIN] "Kesehatan Sistem" (bagian dari Performa Teknis): status terakhir
 * webhook GitHub, terakhir kirim OTP, dan ukuran database D1. Ukuran D1
 * butuh secret CF_API_TOKEN + CF_ACCOUNT_ID (lihat catatan di bawah); kalau
 * belum diset, field d1Size dikembalikan null dan UI menampilkan pesan
 * "belum dikonfigurasi" alih-alih error. */
async function handleInfoHealth(request, env, method) {
  if (method !== "GET") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();

  const getSetting = async (key) => {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
    return row ? row.value : null;
  };

  let d1Size = null;
  let d1Error = null;
  if (env.CF_API_TOKEN && env.CF_ACCOUNT_ID) {
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/d1/database/${env.D1_DATABASE_ID || ""}`,
        { headers: { authorization: "Bearer " + env.CF_API_TOKEN } }
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.result) {
        d1Size = data.result.file_size ?? (data.result.size || null);
      } else {
        d1Error = "Gagal ambil data dari Cloudflare API";
      }
    } catch (e) {
      d1Error = "Gagal menghubungi Cloudflare API";
    }
  } else {
    d1Error = "Belum dikonfigurasi (perlu secret CF_API_TOKEN, CF_ACCOUNT_ID, D1_DATABASE_ID)";
  }

  const now = new Date();
  const otpSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const otpRow = await env.DB.prepare(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN used = 1 THEN 1 ELSE 0 END) as usedCount,
            SUM(CASE WHEN used = 0 AND expiresAt < ? THEN 1 ELSE 0 END) as expiredUnused
     FROM otp_codes WHERE createdAt >= ?`
  )
    .bind(now.toISOString(), otpSince)
    .first();

  const deploySessionCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const staleDeployRow = await env.DB.prepare(
    "SELECT COUNT(*) as c, MIN(createdAt) as oldest FROM deploy_sessions WHERE createdAt < ?"
  )
    .bind(deploySessionCutoff)
    .first();

  return json({
    lastWebhookAt: await getSetting("last_deploy_at"),
    lastOtpSentAt: await getSetting("last_otp_sent_at"),
    d1SizeBytes: d1Size,
    d1Error,
    otpStats: {
      total: (otpRow && otpRow.total) || 0,
      used: (otpRow && otpRow.usedCount) || 0,
      expiredUnused: (otpRow && otpRow.expiredUnused) || 0
    },
    staleDeploySessions: {
      count: (staleDeployRow && staleDeployRow.c) || 0,
      oldest: (staleDeployRow && staleDeployRow.oldest) || null
    }
  });
}


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
    if (!body) return badRequest("Data tidak lengkap");
    const formType = body.formType === "request" ? "request" : "lapor";

    let title, content;
    if (formType === "request") {
      if (!body.gameName || !body.engine || !body.gameLink) return badRequest("Data request game tidak lengkap");
      title = body.gameName;
      content = body.content || ""; // "Pesan Request" (opsional)
    } else {
      if (!body.title || !body.content) return badRequest("Data laporan tidak lengkap");
      title = body.title;
      content = body.content;
    }

    const id = newId(formType === "request" ? "request" : "report");
    await env.DB.prepare(
      "INSERT INTO reports (id, title, name, contactMedia, content, attachment, date, status, formType, gameName, engine, gameLink) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        id,
        title,
        body.name || "",
        body.contactMedia || "",
        content,
        body.attachment ? JSON.stringify(body.attachment) : null,
        new Date().toISOString(),
        "belum",
        formType,
        formType === "request" ? body.gameName : null,
        formType === "request" ? body.engine : null,
        formType === "request" ? body.gameLink : null
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

/** [PUBLIK: GET, ADMIN: POST] Daftar Update Info (Update Game / Bug Fix / Info Admin). */
async function handleInfoItems(request, env, method) {
  if (method === "GET") {
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    let stmt;
    if (type && type !== "semua") {
      stmt = env.DB.prepare("SELECT * FROM info_items WHERE type = ? ORDER BY date DESC").bind(type);
    } else {
      stmt = env.DB.prepare("SELECT * FROM info_items ORDER BY date DESC");
    }
    const { results } = await stmt.all();
    return json(results.map(rowToInfoItem));
  }
  if (method === "POST") {
    if (!(await requireAdmin(request, env))) return unauthorized();
    const body = await request.json().catch(() => null);
    if (!body || !body.title || !body.type || !body.content) return badRequest("Data informasi tidak lengkap");
    const id = newId("info");
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO info_items (id, title, type, content, gameLink, date, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(id, body.title, body.type, body.content, body.type === "info-admin" ? null : body.gameLink || null, now, now)
      .run();
    return json({ ok: true, id });
  }
  return badRequest("Method tidak didukung");
}

async function handleInfoItemById(request, env, method, id) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (method === "PUT") {
    const body = await request.json().catch(() => null);
    if (!body || !body.title || !body.type || !body.content) return badRequest("Data informasi tidak lengkap");
    await env.DB.prepare(
      "UPDATE info_items SET title = ?, type = ?, content = ?, gameLink = ? WHERE id = ?"
    )
      .bind(body.title, body.type, body.content, body.type === "info-admin" ? null : body.gameLink || null, id)
      .run();
    return json({ ok: true });
  }
  if (method === "DELETE") {
    await env.DB.prepare("DELETE FROM info_items WHERE id = ?").bind(id).run();
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
        "INSERT INTO reports (id, title, name, contactMedia, content, attachment, date, status, formType, gameName, engine, gameLink) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(
          item.id,
          item.title,
          item.name || "",
          item.contactMedia || "",
          item.content,
          item.attachment ? JSON.stringify(item.attachment) : null,
          item.date,
          item.status || "belum",
          item.formType || "lapor",
          item.gameName || null,
          item.engine || null,
          item.gameLink || null
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
    if (body.password !== current) {
      // Log percobaan login gagal — cuma timestamp, tanpa IP/device, demi
      // privasi (dipakai entri "Keamanan" di Informasi Web).
      await env.DB.prepare("INSERT INTO login_fail_attempts (id, date) VALUES (?, ?)")
        .bind(newId("loginfail"), new Date().toISOString())
        .run();
      return unauthorized();
    }
    // Set cookie "bypass" supaya admin yang sedang login tetap bisa
    // browsing tampilan publik seperti biasa walau Mode Maintenance aktif
    // (dicek di gerbang maintenance sebelum menyajikan file statis).
    const res = json({ ok: true });
    res.headers.append(
      "Set-Cookie",
      "fueeru_admin_bypass=" + encodeURIComponent(current) + "; Path=/; Max-Age=2592000; SameSite=Lax"
    );
    return res;
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
    await env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES ('password_changed_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
      .bind(new Date().toISOString())
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
    await env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES ('password_changed_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
      .bind(new Date().toISOString())
      .run();
    return json({ ok: true });
  }
  return badRequest("Method tidak didukung");
}

/* =========================================================
   Pengaturan Website (Admin Panel > Pengaturan)
   Disimpan di tabel `settings` yang sama dengan admin_password —
   key-value sederhana, cukup untuk kebutuhan ini.
   ========================================================= */
// key yang TIDAK boleh diubah/dihapus lewat endpoint /api/settings umum
// (sudah ada endpoint khususnya sendiri: /api/auth untuk password).
const SETTINGS_PROTECTED_KEYS = new Set(["admin_password", "password_changed_at"]);

/** [PUBLIK: GET, ADMIN: PUT/DELETE] Pengaturan tampilan & konten situs
 * (font, warna, gambar, teks, keamanan) — key-value generik di tabel
 * `settings`. GET dipakai halaman publik untuk menerapkan pengaturan aktif,
 * jadi sengaja tidak butuh login. */
async function handleSettings(request, env, method) {
  if (method === "GET") {
    const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
    const obj = {};
    for (const r of results) {
      if (SETTINGS_PROTECTED_KEYS.has(r.key)) continue;
      obj[r.key] = r.value;
    }
    return json(obj);
  }
  if (method === "PUT") {
    if (!(await requireAdmin(request, env))) return unauthorized();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return badRequest("Data tidak valid");
    const stmts = [];
    for (const k of Object.keys(body)) {
      if (SETTINGS_PROTECTED_KEYS.has(k)) continue;
      stmts.push(
        env.DB.prepare(
          "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).bind(k, body[k] == null ? null : String(body[k]))
      );
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true });
  }
  if (method === "DELETE") {
    // Dipakai tombol "Kembalikan ke Default" — hapus 1 key supaya balik ke
    // nilai bawaan (fallback di kode, bukan lagi override dari database).
    if (!(await requireAdmin(request, env))) return unauthorized();
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (!key || SETTINGS_PROTECTED_KEYS.has(key)) return badRequest("key tidak valid");
    await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(key).run();
    return json({ ok: true });
  }
  return badRequest("Method tidak didukung");
}

/** Path gambar situs yang bisa ditimpa lewat Pengaturan > Pengaturan Gambar.
 * Key di tabel `settings` menyimpan data URL (base64) gambar hasil upload;
 * kalau ada, request ke path aslinya di bawah ini langsung disajikan dari
 * database (bukan file statis) — jadi berlaku instan di semua tempat file
 * itu dipakai (termasuk <link rel="icon"> & og:image), tanpa perlu deploy. */
const OVERRIDABLE_IMAGE_PATHS = {
  "/webpictures/logo.webp": "img_logo",
  "/webpictures/header.webp": "img_header",
  "/webpictures/404.webp": "img_404"
};

async function tryServeOverriddenImage(path, env) {
  const settingKey = OVERRIDABLE_IMAGE_PATHS[path];
  if (!settingKey) return null;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(settingKey).first();
  if (!row || !row.value) return null;
  const m = /^data:([^;]+);base64,(.+)$/.exec(row.value);
  if (!m) return null;
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: { "content-type": m[1], "cache-control": "no-store" }
  });
}

/** Gerbang Mode Maintenance — dicek sebelum menyajikan halaman HTML publik.
 * Admin yang sedang login (ditandai cookie fueeru_admin_bypass, diset saat
 * login lewat /api/auth) tetap bisa browsing tampilan publik seperti biasa. */
/** Bangun HTML halaman "Situs sedang dalam perbaikan" langsung di dalam
 * Worker (bukan lewat env.ASSETS.fetch ke file terpisah) — supaya tidak
 * bergantung pada apakah maintenance.html berhasil ter-deploy sebagai aset
 * statis. Kalau itu gagal/hilang, hasilnya jadi halaman kosong-putih total. */
function buildMaintenanceHtml(reason, description) {
  const esc = (s) => (s ? s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])) : "");
  const safeReason = esc(reason);
  const safeDescription =
    esc(description) || "Maaf, Fueeru Game sedang dalam masa maintenance. Kami akan kembali online secepatnya.";
  return `<!DOCTYPE html>
<html lang="id">
<head>
<script>(function(){try{var t=localStorage.getItem('fueeru_theme');if(t!=='light'){document.documentElement.classList.add('dark');}}catch(e){}})();</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sedang Dalam Perbaikan — Fueeru Game</title>
<meta name="robots" content="noindex">
<link rel="icon" type="image/png" href="/webpictures/logo.webp">
<meta name="theme-color" content="#2fa8e0">
<link rel="stylesheet" href="/css/style.css">
<style>
  .maint-wrap { min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 64px 24px; text-align: center; }
  .maint-box { max-width: 440px; }
  .maint-logo { width: 116px; height: 116px; border-radius: 50%; box-shadow: var(--shadow-card); margin: 0 auto 22px; display: block; }
  .maint-box h1 { font-size: 1.4rem; color: var(--sky-700); margin-bottom: 12px; }
  .maint-box p { color: var(--ink-soft); line-height: 1.5; font-size: .96rem; margin-bottom: 8px; }
  .maint-reason { margin-top: 16px; padding: 14px 16px; background: var(--sky-100); border-radius: var(--radius-sm); color: var(--ink); font-size: .9rem; line-height: 1.5; }
</style>
</head>
<body>
  <div class="maint-wrap">
    <div class="maint-box">
      <img class="maint-logo" src="/webpictures/logo.webp" alt="Logo Fueeru Game">
      <h1>Situs Sedang Dalam Perbaikan</h1>
      <p>${safeDescription}</p>
      ${safeReason ? `<div class="maint-reason">${safeReason}</div>` : ""}
    </div>
  </div>
</body>
</html>`;
}

async function maybeServeMaintenancePage(request, env, path) {
  // Jangan pernah menggerbangi: API, admin.html sendiri, aset (css/js/gambar/font).
  if (path.startsWith("/api/")) return null;
  if (path === "/admin.html" || path === "/admin") return null;
  if (/\.(css|js|json|webp|png|jpg|jpeg|svg|ico|woff2?|ttf|otf|xml|txt)$/i.test(path)) return null;

  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'maintenance_active'").first();
  if (!row || row.value !== "1") return null;

  // Admin yang sudah login (cookie cocok dengan password admin saat ini) dilewatkan.
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieMatch = /(?:^|;\s*)fueeru_admin_bypass=([^;]+)/.exec(cookieHeader);
  if (cookieMatch) {
    const passRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_password'").first();
    const currentPassword = passRow ? passRow.value : "admin123";
    if (decodeURIComponent(cookieMatch[1]) === currentPassword) return null;
  }

  const reasonRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'maintenance_reason'").first();
  const reason = reasonRow ? reasonRow.value : "";
  const descRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'maintenance_description'").first();
  const description = descRow ? descRow.value : "";
  const html = buildMaintenanceHtml(reason, description);
  // PENTING: status 200, BUKAN 503. Status 5xx sering di-override oleh
  // interstitial bawaan Chrome/Cloudflare sendiri ("Halaman ini tidak
  // berfungsi... HTTP ERROR 503") yang menimpa isi asli halaman ini —
  // jadi baik pengunjung maupun admin bisa sama sekali tidak melihat
  // halaman maintenance yang sebenarnya. <meta name="robots" content="noindex">
  // di maintenance.html sudah cukup untuk mencegah halaman ini diindeks.
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "x-maintenance-mode": "1" }
  });
}

/** [ADMIN] Log percobaan login gagal (maks 20 terbaru ditampilkan). Baris
 * lama otomatis dibuang biar tabel gak numpuk (cuma timestamp, ringan, tapi
 * tetap dijaga rapi). */
async function handleLoginFails(request, env, method) {
  if (method !== "GET") return badRequest("Method tidak didukung");
  if (!(await requireAdmin(request, env))) return unauthorized();

  const { results } = await env.DB.prepare(
    "SELECT date FROM login_fail_attempts ORDER BY date DESC LIMIT 20"
  ).all();

  // Beres-beres: simpan cuma 200 baris terakhir di database (kalau lebih).
  await env.DB.prepare(
    `DELETE FROM login_fail_attempts WHERE id NOT IN (
       SELECT id FROM login_fail_attempts ORDER BY date DESC LIMIT 200
     )`
  ).run();

  const pwRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'password_changed_at'").first();

  return json({ items: results.map((r) => r.date), passwordChangedAt: pwRow ? pwRow.value : null });
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
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('password_changed_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(new Date().toISOString())
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
      if (path === "/api/posts/popular") return await handlePostsPopular(request, env, method);

      let m = path.match(/^\/api\/posts\/([^/]+)$/);
      if (m) return await handlePostById(request, env, method, decodeURIComponent(m[1]));

      m = path.match(/^\/api\/pages\/([^/]+)$/);
      if (m) return await handlePageById(request, env, method, decodeURIComponent(m[1]));

      if (path === "/api/reports") return await handleReports(request, env, method);

      m = path.match(/^\/api\/reports\/([^/]+)$/);
      if (m) return await handleReportById(request, env, method, decodeURIComponent(m[1]));

      if (path === "/api/info-items") return await handleInfoItems(request, env, method);

      m = path.match(/^\/api\/info-items\/([^/]+)$/);
      if (m) return await handleInfoItemById(request, env, method, decodeURIComponent(m[1]));

      m = path.match(/^\/api\/trash\/([^/]+)$/);
      if (m) return await handleTrashList(request, env, method, m[1]);

      m = path.match(/^\/api\/trash\/([^/]+)\/([^/]+)$/);
      if (m) return await handleTrashItem(request, env, method, m[1], decodeURIComponent(m[2]));

      if (path === "/api/auth") return await handleAuth(request, env, method);
      if (path === "/api/settings") return await handleSettings(request, env, method);

      if (path === "/api/auth/otp/request") return await handleOtpRequest(request, env, method);
      if (path === "/api/auth/otp/verify") return await handleOtpVerify(request, env, method);

      if (path === "/api/backup-website") return await handleBackupWebsite(request, env, method);
      if (path === "/api/deploy/start") return await handleDeployStart(request, env, method);
      if (path === "/api/deploy/batch") return await handleDeployBatch(request, env, method);
      if (path === "/api/deploy/finish") return await handleDeployFinish(request, env, method);
      if (path === "/api/github/webhook") return await handleGithubWebhook(request, env, method);
      if (path === "/api/files/tree") return await handleFilesTree(request, env, method);
      if (path === "/api/track/visit") return await handleTrackVisit(request, env, method);
      if (path === "/api/track/view") return await handleTrackView(request, env, method);
      if (path === "/api/track/page") return await handleTrackPage(request, env, method);
      if (path === "/api/stats/visits") return await handleStatsVisits(request, env, method);
      if (path === "/api/stats/views") return await handleStatsViews(request, env, method);
      if (path === "/api/stats/posts-halaman") return await handleStatsPostsHalaman(request, env, method);
      if (path === "/api/info/basic") return await handleInfoBasic(request, env, method);
      if (path === "/api/info/health") return await handleInfoHealth(request, env, method);
      if (path === "/api/info/commits") return await handleCommitHistory(request, env, method);
      if (path === "/api/info/login-fails") return await handleLoginFails(request, env, method);
      if (path === "/api/notifications") return await handleServerNotifications(request, env, method);

      if (path === "/api/redirect/sections") return await handleRedirectSections(request, env, method);
      if (path === "/api/redirect/sections/reorder") return await handleRedirectSectionsReorder(request, env, method);
      m = path.match(/^\/api\/redirect\/sections\/([^/]+)$/);
      if (m) return await handleRedirectSectionById(request, env, method, decodeURIComponent(m[1]));

      if (path === "/api/redirect/links") return await handleRedirectLinks(request, env, method);
      m = path.match(/^\/api\/redirect\/links\/([^/]+)$/);
      if (m) return await handleRedirectLinkById(request, env, method, decodeURIComponent(m[1]));

      m = path.match(/^\/api\/redirect\/resolve\/([^/]+)$/);
      if (m) return await handleRedirectResolve(request, env, method, decodeURIComponent(m[1]));

      if (path.startsWith("/api/")) return json({ error: "Endpoint tidak ditemukan" }, 404);

      // Path publik /redirect<kode> -> tetap sajikan file statis redirect.html;
      // kode di path dibaca sendiri oleh js/redirect.js di sisi klien.
      m = path.match(/^\/redirect([A-Za-z0-9]+)$/);
      if (m) {
        // PENTING: minta "/redirect" (tanpa .html). Cloudflare Static Assets
        // default-nya (html_handling="auto-trailing-slash") akan membalas
        // 307 redirect kalau kita minta "/redirect.html" secara langsung —
        // itu akan membuang kode di path saat diteruskan ke browser.
        // Minta path kanonik tanpa ekstensi supaya langsung 200 + isi file,
        // tanpa redirect apapun.
        const assetUrl = new URL(request.url);
        assetUrl.pathname = "/redirect";
        return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
      }

      // Bukan /api/... -> serve file statis (html/css/js/gambar), tapi cek
      // dulu apakah gambar ini ditimpa lewat Pengaturan > Pengaturan Gambar,
      // atau apakah Mode Maintenance sedang aktif.
      const overriddenImage = await tryServeOverriddenImage(path, env);
      if (overriddenImage) return overriddenImage;

      const maintenanceRes = await maybeServeMaintenancePage(request, env, path);
      if (maintenanceRes) return maintenanceRes;

      return env.ASSETS.fetch(request);
    } catch (err) {
      return json({ error: "Kesalahan server: " + err.message }, 500);
    }
  }
};

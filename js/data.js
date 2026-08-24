/* =========================================================
   Fueeru Game — Data Layer (versi server)
   Postingan, Halaman statis, Laporan, Recycle Bin, dan Password Admin
   sekarang disimpan di Cloudflare D1 lewat API (/api/...), BUKAN lagi
   localStorage — jadi semua perubahan langsung terlihat di semua
   device/browser/pengunjung.

   Statistik kunjungan (views) dicatat ke server (D1) lewat /api/track/...
   sehingga akurat gabungan semua pengunjung/device — termasuk widget
   "Game Populer" di sidebar publik (mode desktop) yang sekarang memakai
   /api/posts/popular. Salinan lokal di localStorage tetap disimpan
   sebagai cadangan ringan/offline, dan dipakai admin.js untuk badge
   views per-postingan di Admin Panel.
   ========================================================= */

const ADMIN_PW_SESSION_KEY = "fueeru_admin_session_password";

/* Jenis game bersifat tetap (2 opsi). */
const JENIS_LIST = ["RPGM", "VN"];
const PLATFORM_OPTIONS = ["Android", "PC", "Keduanya"];
const PLATFORM_TAGS = ["Android", "PC"];
const BAHASA_LIST = ["Bahasa Indonesia", "Indonesia & English"];

function platformOptionToTags(option) {
  if (option === "Keduanya") return PLATFORM_TAGS.slice();
  return PLATFORM_TAGS.includes(option) ? [option] : [PLATFORM_TAGS[0]];
}
function platformTagsToOption(tags) {
  tags = tags || [];
  const hasAndroid = tags.indexOf("Android") !== -1;
  const hasPC = tags.indexOf("PC") !== -1;
  if (hasAndroid && hasPC) return "Keduanya";
  if (hasPC) return "PC";
  return "Android";
}

/* ---------------- API helper ---------------- */

function getAdminSessionPassword() {
  try {
    return localStorage.getItem(ADMIN_PW_SESSION_KEY) || "";
  } catch (e) {
    return "";
  }
}
function setAdminSessionPassword(pw) {
  try {
    localStorage.setItem(ADMIN_PW_SESSION_KEY, pw);
  } catch (e) {}
}
function clearAdminSessionPassword() {
  try {
    localStorage.removeItem(ADMIN_PW_SESSION_KEY);
  } catch (e) {}
}

/** Panggil endpoint API. auth=true akan menyertakan password admin (dari sesi
 * login) di header X-Admin-Password untuk endpoint yang butuh otorisasi. */
async function apiCall(method, path, body, auth) {
  const headers = { "content-type": "application/json" };
  if (auth) headers["x-admin-password"] = getAdminSessionPassword();
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {}
  if (!res.ok) {
    const err = new Error((data && data.error) || "Terjadi kesalahan server (" + res.status + ")");
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------------- Posts (server) ---------------- */

/** [ADMIN] Semua postingan termasuk draft/terjadwal. Butuh login admin. */
async function loadPosts() {
  return apiCall("GET", "/api/posts?all=1", undefined, true);
}

/** [PUBLIK] Hanya postingan published & sudah lewat jadwal. */
async function getPublishedPosts() {
  return apiCall("GET", "/api/posts", undefined, false);
}

/** [PUBLIK] 1 postingan berdasarkan id. */
async function getPostById(id) {
  try {
    return await apiCall("GET", "/api/posts/" + encodeURIComponent(id), undefined, false);
  } catch (e) {
    return null;
  }
}

/** [ADMIN] Simpan postingan baru (tanpa id) atau update (dengan id yang sudah ada). */
async function createPost(post) {
  return apiCall("POST", "/api/posts", post, true);
}
async function updatePost(id, post) {
  return apiCall("PUT", "/api/posts/" + encodeURIComponent(id), post, true);
}

/** [ADMIN] Pindahkan 1 postingan ke Recycle Bin. */
async function trashPost(id) {
  try {
    await apiCall("DELETE", "/api/posts/" + encodeURIComponent(id), undefined, true);
    return true;
  } catch (e) {
    return false;
  }
}

/** [PUBLIK] Postingan terkait: jenis sama & minimal 1 genre yang sama. */
async function getRelatedPosts(post, max) {
  if (!post) return [];
  const postGenres = (post.genres || []).map((g) => g.toLowerCase());
  const all = await getPublishedPosts();
  const candidates = all.filter((p) => {
    if (p.id === post.id) return false;
    if (p.jenis !== post.jenis) return false;
    const pGenres = (p.genres || []).map((g) => g.toLowerCase());
    return pGenres.some((g) => postGenres.includes(g));
  });
  return shuffleArray(candidates).slice(0, max || 6);
}

/** [PUBLIK] Semua genre unik yang dipakai postingan published, alfabetis. */
async function getAllGenres() {
  const posts = await getPublishedPosts();
  const set = new Set();
  posts.forEach((p) => (p.genres || []).forEach((g) => set.add(g)));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "id"));
}

/** [ADMIN] Semua genre unik dari SELURUH postingan (termasuk draft), dipakai
 * untuk saran genre di form Admin supaya draft pun ikut tersaran. */
async function getAllGenresAdmin() {
  const posts = await loadPosts();
  const set = new Set();
  posts.forEach((p) => (p.genres || []).forEach((g) => set.add(g)));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "id"));
}

async function countPostsByGenre(genre) {
  const posts = await getPublishedPosts();
  return posts.filter((p) => (p.genres || []).some((g) => g.toLowerCase() === genre.toLowerCase())).length;
}
async function countPostsByPlatform(tag) {
  const posts = await getPublishedPosts();
  return posts.filter((p) => (p.platform || []).indexOf(tag) !== -1).length;
}
async function countPostsByBahasa(bahasa) {
  const posts = await getPublishedPosts();
  return posts.filter((p) => p.bahasa === bahasa).length;
}

/** [PUBLIK] Postingan paling populer berdasarkan total views di server
 * (gabungan semua pengunjung/device, dihitung dari tabel post_views di D1). */
async function getPopularPosts(max) {
  try {
    return await apiCall("GET", "/api/posts/popular?limit=" + encodeURIComponent(max || 5), undefined, false);
  } catch (e) {
    return [];
  }
}

async function getTopGenres(max) {
  const genres = await getAllGenres();
  const withCount = [];
  for (const g of genres) withCount.push({ genre: g, count: await countPostsByGenre(g) });
  for (let i = withCount.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [withCount[i], withCount[j]] = [withCount[j], withCount[i]];
  }
  return withCount.slice(0, max || 10);
}

/** Buat preview teks singkat dari HTML isi post. */
function makePreview(html, maxLen) {
  maxLen = maxLen || 110;
  const tmp = document.createElement("div");
  tmp.innerHTML = html || "";
  const text = (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + "…";
}

/** Format tanggal ISO -> "10 Agustus 2026" */
function formatDate(iso) {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  } catch (e) {
    return iso;
  }
}

/** Acak urutan array (Fisher-Yates), tidak mengubah array asal. */
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------- Laporan (page Laporkan) ---------------- */

/** [ADMIN] Semua laporan. */
async function loadReports() {
  return apiCall("GET", "/api/reports", undefined, true);
}

/** [PUBLIK] Kirim 1 laporan baru. attachment = {name, dataUrl} | null */
async function addReport(title, name, content, attachment, contactMedia) {
  await apiCall(
    "POST",
    "/api/reports",
    { title, name: name || "", contactMedia: contactMedia || "", content, attachment: attachment || null },
    false
  );
}

/** [ADMIN] Ubah status 1 laporan: "belum" | "sedang" | "selesai" */
async function setReportStatus(id, status) {
  await apiCall("PUT", "/api/reports/" + encodeURIComponent(id), { status }, true);
}

/** [ADMIN] Pindahkan 1 laporan ke Recycle Bin. */
async function trashReport(id) {
  try {
    await apiCall("DELETE", "/api/reports/" + encodeURIComponent(id), undefined, true);
    return true;
  } catch (e) {
    return false;
  }
}

// =========================================================
// Statistik Web (Informasi Web di Admin Panel) — TETAP LOKAL
// Views/kunjungan murni dihitung dari histori localStorage BROWSER INI
// SAJA. Kalau ingin statistik lintas-perangkat, perlu tabel tambahan
// di server (belum diimplementasikan di versi ini).
// =========================================================
const VISITS_KEY = "fueeru_visits";
const POST_VIEWS_KEY = "fueeru_post_views";
const LOG_CAP = 8000;

function _loadLog(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}
function _saveLog(key, arr) {
  try {
    if (arr.length > LOG_CAP) arr.splice(0, arr.length - LOG_CAP);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {}
}

function logVisit() {
  // Tetap dicatat lokal (cadangan ringan, dipakai badge views per-postingan
  // di Admin Panel), DAN dikirim ke server (sumber utama, dipakai juga oleh
  // widget "Game Populer" publik lewat /api/posts/popular, dan statistik
  // pengunjung — device/negara-kota/referrer — di Informasi Web).
  const arr = _loadLog(VISITS_KEY);
  arr.push(new Date().toISOString());
  _saveLog(VISITS_KEY, arr);

  fetch("/api/track/visit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ referrer: (typeof document !== "undefined" && document.referrer) || "" })
  }).catch(() => {});
}

/** [PUBLIK] Catat 1 kali halaman statis (Tutorial/Cara Download/Donasi/
 * Tentang) dibuka — dipakai "Halaman Paling Sering Dibuka" di Informasi Web. */
function logPageView(pageId) {
  fetch("/api/track/page", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageId })
  }).catch(() => {});
}

function logPostView(postId) {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(POST_VIEWS_KEY) || "{}");
  } catch (e) {
    raw = {};
  }
  if (!Array.isArray(raw[postId])) raw[postId] = [];
  raw[postId].push(new Date().toISOString());
  if (raw[postId].length > LOG_CAP) raw[postId].splice(0, raw[postId].length - LOG_CAP);
  try {
    localStorage.setItem(POST_VIEWS_KEY, JSON.stringify(raw));
  } catch (e) {}

  fetch("/api/track/view", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ postId })
  }).catch(() => {});
}

function loadPostViewsLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(POST_VIEWS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function _countInRange(isoArr, start, end) {
  let n = 0;
  for (let i = 0; i < isoArr.length; i++) {
    const t = new Date(isoArr[i]).getTime();
    if (t >= start.getTime() && t < end.getTime()) n++;
  }
  return n;
}

/** [ADMIN] Statistik kunjungan situs — akurat, gabungan semua pengunjung/device
 * (diambil dari server, bukan lagi localStorage browser ini saja). */
async function getVisitStats() {
  return apiCall("GET", "/api/stats/visits", undefined, true);
}

/** [ADMIN] Statistik views postingan — akurat, gabungan semua pengunjung/device. */
async function getPostViewStats() {
  return apiCall("GET", "/api/stats/views", undefined, true);
}

/** [ADMIN] Statistik lanjutan Postingan & Halaman (populer minggu ini,
 * genre terpopuler, halaman statis paling sering dibuka). */
async function getPostsHalamanStats() {
  return apiCall("GET", "/api/stats/posts-halaman", undefined, true);
}

/** [ADMIN] Informasi dasar web (nama, link repo/worker, versi live). */
async function getInfoBasic() {
  return apiCall("GET", "/api/info/basic", undefined, true);
}

/** [ADMIN] Kesehatan sistem (webhook, OTP, ukuran D1). */
async function getInfoHealth() {
  return apiCall("GET", "/api/info/health", undefined, true);
}

/** [ADMIN] Riwayat commit/deploy langsung dari GitHub Actions (real-time). */
async function getCommitHistory(page) {
  return apiCall("GET", "/api/info/commits?page=" + encodeURIComponent(page || 1), undefined, true);
}

/** [ADMIN] Log percobaan login gagal (timestamp saja). */
async function getLoginFails() {
  return apiCall("GET", "/api/info/login-fails", undefined, true);
}

function getViewsForPost(postId) {
  const log = loadPostViewsLog();
  return Array.isArray(log[postId]) ? log[postId].length : 0;
}

function getStorageSizeEstimate() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) || "";
      total += (k ? k.length : 0) + v.length;
    }
  } catch (e) {}
  return total * 2;
}

/** [ADMIN] Restore dari file backup. mode "merge" = upsert per id, mode
 * "replace" = upsert lalu hapus permanen postingan lama yang tidak ada
 * di file backup. */
async function bulkSavePosts(incomingPosts, replaceAll) {
  const existing = await loadPosts();
  const existingIds = new Set(existing.map((p) => p.id));
  for (const p of incomingPosts) {
    if (p.id && existingIds.has(p.id)) {
      await updatePost(p.id, p);
    } else {
      await createPost(p);
    }
  }
  if (replaceAll) {
    const incomingIds = new Set(incomingPosts.map((p) => p.id));
    for (const p of existing) {
      if (!incomingIds.has(p.id)) {
        await trashPost(p.id);
        await permanentlyDeleteFromTrash("posts", p.id);
      }
    }
  }
}

/** [ADMIN] Restore backup Halaman: pages = { tutorial: "<html>", ... } */
async function bulkSavePages(pages) {
  for (const id of Object.keys(pages)) {
    await savePageContent(id, pages[id]);
  }
}

/** [ADMIN] Ambil semua 4 halaman sekaligus sebagai { id: {title, content} }. */
async function loadAllPages() {
  const ids = ["tutorial", "cara-download", "donasi", "tentang"];
  const out = {};
  for (const id of ids) out[id] = await getPageContent(id);
  return out;
}

/* ---------------- Password admin (server) ---------------- */

/** [PUBLIK] Cek password saat login. Return true/false. */
async function checkAdminPassword(password) {
  try {
    await apiCall("POST", "/api/auth", { password }, false);
    return true;
  } catch (e) {
    return false;
  }
}

/** [ADMIN] Ganti password (butuh sudah login / tahu password lama, dikirim via sesi). */
async function setAdminPassword(newPassword) {
  try {
    await apiCall("PUT", "/api/auth", { newPassword }, true);
    setAdminSessionPassword(newPassword);
    return true;
  } catch (e) {
    return false;
  }
}

/** [PUBLIK] Minta kode OTP dikirim ke salah satu email admin yang terdaftar. */
async function requestPasswordResetOtp(email) {
  await apiCall("POST", "/api/auth/otp/request", { email }, false);
}

/** [PUBLIK] Verifikasi kode OTP dan set password baru. */
async function verifyOtpAndResetPassword(code, newPassword) {
  await apiCall("POST", "/api/auth/otp/verify", { code, newPassword }, false);
}

// =========================================================
// Notifikasi Admin Panel — TETAP LOKAL (per-device)
// =========================================================
const NOTIF_KEY = "fueeru_notifications";
const LAST_BACKUP_KEY = "fueeru_last_backup_at";
const LAST_BACKUP_PAGES_KEY = "fueeru_last_backup_pages_at";

function loadNotifications() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}
function saveNotifications(list) {
  try {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    return false;
  }
}
function addNotification(type, text) {
  const list = loadNotifications();
  list.unshift({
    id: "notif-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
    type: type,
    text: text,
    date: new Date().toISOString()
  });
  saveNotifications(list);
}
function clearAllNotifications() {
  saveNotifications([]);
}

function markBackupDone(kind) {
  try {
    localStorage.setItem(kind === "pages" ? LAST_BACKUP_PAGES_KEY : LAST_BACKUP_KEY, new Date().toISOString());
  } catch (e) {}
}
function getLastBackupAt(kind) {
  return localStorage.getItem(kind === "pages" ? LAST_BACKUP_PAGES_KEY : LAST_BACKUP_KEY);
}
function checkBackupReminder() {
  const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);
  const daysSince = lastBackup ? (Date.now() - new Date(lastBackup).getTime()) / 86400000 : Infinity;
  if (daysSince < 7) return;
  const notifs = loadNotifications();
  if (notifs.some((n) => n.type === "backup_reminder")) return;
  addNotification(
    "backup_reminder",
    "Sudah lebih dari seminggu sejak backup data postingan terakhir. Yuk backup datamu di menu Backup & Restore supaya aman!"
  );
}

// =========================================================
// Recycle Bin (postingan & laporan yang dihapus) — server, D1
// =========================================================
async function loadTrashPosts() {
  return apiCall("GET", "/api/trash/posts", undefined, true);
}
async function loadTrashReports() {
  return apiCall("GET", "/api/trash/reports", undefined, true);
}
async function restoreFromTrash(type, id) {
  try {
    await apiCall("POST", "/api/trash/" + type + "/" + encodeURIComponent(id), {}, true);
    return true;
  } catch (e) {
    return false;
  }
}
async function restoreAllFromTrash(type, ids) {
  for (const id of ids) await restoreFromTrash(type, id);
}
async function permanentlyDeleteFromTrash(type, id) {
  await apiCall("DELETE", "/api/trash/" + type + "/" + encodeURIComponent(id), undefined, true);
}
async function permanentlyDeleteAllFromTrash(type, ids) {
  for (const id of ids) await permanentlyDeleteFromTrash(type, id);
}
/** Purge otomatis (>30 hari) sekarang cukup dilakukan manual dari Recycle
 * Bin; fungsi ini sengaja no-op supaya pemanggilan lama tidak error. */
function purgeOldTrash() {}

// =========================================================
// Rate limit pengiriman laporan (maks. 3 laporan / hari / perangkat) — LOKAL
// =========================================================
const REPORT_RATE_KEY = "fueeru_report_rate";
const REPORT_RATE_LIMIT = 3;

function _todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}
function getReportCountToday() {
  try {
    const raw = JSON.parse(localStorage.getItem(REPORT_RATE_KEY) || "null");
    if (!raw || raw.date !== _todayStr()) return 0;
    return raw.count || 0;
  } catch (e) {
    return 0;
  }
}
function canSubmitReport() {
  return getReportCountToday() < REPORT_RATE_LIMIT;
}
function recordReportSubmission() {
  try {
    const count = getReportCountToday() + 1;
    localStorage.setItem(REPORT_RATE_KEY, JSON.stringify({ date: _todayStr(), count: count }));
  } catch (e) {}
}

// =========================================================
// Halaman statis yang bisa diedit lewat Admin Panel (server, D1)
// =========================================================
const DEFAULT_PAGE_TITLES = {
  tutorial: "Tutorial Main",
  "cara-download": "Cara Download",
  donasi: "Donasi",
  tentang: "Tentang"
};

/** [PUBLIK] Ambil { title, content } untuk 1 halaman. */
async function getPageContent(pageId) {
  try {
    const data = await apiCall("GET", "/api/pages/" + encodeURIComponent(pageId), undefined, false);
    if (!data.title) data.title = DEFAULT_PAGE_TITLES[pageId] || pageId;
    return data;
  } catch (e) {
    return { title: DEFAULT_PAGE_TITLES[pageId] || pageId, content: "" };
  }
}

/** [ADMIN] Simpan isi 1 halaman. Return "ok" | "error". */
async function savePageContent(pageId, content) {
  try {
    await apiCall(
      "PUT",
      "/api/pages/" + encodeURIComponent(pageId),
      { title: DEFAULT_PAGE_TITLES[pageId] || pageId, content },
      true
    );
    return "ok";
  } catch (e) {
    return "error";
  }
}

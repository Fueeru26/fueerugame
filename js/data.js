/* =========================================================
   Fueeru Game — Data Layer
   Posts disimpan di localStorage (key: fueeru_posts).
   Laporan (dari page Laporkan) disimpan di localStorage (key: fueeru_reports).
   Tidak ada backend/server — semuanya berjalan di sisi browser.
   ========================================================= */

const STORAGE_KEY = "fueeru_posts";
const REPORTS_KEY = "fueeru_reports";
const DATA_VERSION_KEY = "fueeru_data_version";
const DATA_VERSION = "3"; // dinaikkan saat skema data (jenis/genres) berubah

/* Jenis game bersifat tetap (2 opsi). Genre bersifat dinamis —
   diturunkan otomatis dari genre yang dipakai postingan yang ada,
   sehingga genre yang tak lagi dipakai post manapun otomatis hilang. */
const JENIS_LIST = ["RPGM", "VN"];

const LOREM =
  "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";

const LOREM2 =
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

function seedPost(n, jenis, genres, daysAgo) {
  const d = new Date("2026-08-10T00:00:00");
  d.setDate(d.getDate() - daysAgo);
  const num = String(n).padStart(3, "0");
  return {
    id: "post-" + num,
    title: "Post" + num,
    jenis: jenis,
    genres: genres,
    date: d.toISOString().slice(0, 10),
    thumbnail: "webpictures/postplaceholder.webp",
    content: "<p>" + LOREM + "</p><p>" + LOREM2 + "</p>"
  };
}

const DEFAULT_POSTS = [
  seedPost(1, "VN", ["RPG", "Action", "Petualangan"], 0),
  seedPost(2, "RPGM", ["Strategi"], 2),
  seedPost(3, "VN", ["RPG"], 4),
  seedPost(4, "RPGM", ["Horror", "RPG", "Puzzle"], 6),
  seedPost(5, "VN", ["Action"], 8),
  seedPost(6, "RPGM", ["Strategi"], 10),
  seedPost(7, "VN", ["Horror"], 12),
  seedPost(8, "RPGM", ["Action", "Horror", "Strategi"], 14),
  seedPost(9, "VN", ["Horror", "Puzzle", "Strategi"], 16),
  seedPost(10, "RPGM", ["Fantasi", "Petualangan"], 18),
  seedPost(11, "VN", ["Simulasi"], 20),
  seedPost(12, "RPGM", ["Puzzle", "Balapan", "Petualangan"], 22),
  seedPost(13, "VN", ["Strategi"], 24),
  seedPost(14, "RPGM", ["RPG", "Fantasi"], 26),
  seedPost(15, "VN", ["RPG", "Balapan"], 28),
  seedPost(16, "RPGM", ["Fantasi", "Petualangan"], 30),
  seedPost(17, "VN", ["Olahraga"], 32),
  seedPost(18, "RPGM", ["RPG", "Puzzle", "Fantasi"], 34),
  seedPost(19, "VN", ["Petualangan", "Balapan", "Strategi"], 36),
  seedPost(20, "RPGM", ["RPG", "Action", "Strategi"], 38)
];

/** Pastikan data di localStorage sesuai skema versi terbaru.
 * Jika versi lama/tidak ada (misal dari sesi sebelum update ini),
 * data postingan lama akan direset ke placeholder baru supaya
 * tidak crash karena field jenis/genres belum ada. Laporan tetap disimpan. */
function ensureDataVersion() {
  try {
    const v = localStorage.getItem(DATA_VERSION_KEY);
    if (v !== DATA_VERSION) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_POSTS));
      localStorage.setItem(DATA_VERSION_KEY, DATA_VERSION);
    }
  } catch (e) {
    /* localStorage tidak tersedia, abaikan */
  }
}
ensureDataVersion();

/** Ambil semua post dari localStorage (inisialisasi jika belum ada). */
function loadPosts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_POSTS));
    return DEFAULT_POSTS.slice();
  } catch (e) {
    return DEFAULT_POSTS.slice();
  }
}

/** Simpan seluruh array post ke localStorage. */
function savePosts(posts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    return true;
  } catch (e) {
    return false;
  }
}

/** Cari 1 post berdasarkan id. */
function getPostById(id) {
  return loadPosts().find((p) => p.id === id) || null;
}

/** Postingan yang statusnya published (dipakai di seluruh halaman publik —
 * postingan berstatus draft/belum dipublish tidak ditampilkan di publik). */
function getPublishedPosts() {
  return loadPosts().filter((p) => p.published !== false);
}

/** Postingan terkait: jenis sama & minimal 1 genre yang sama dengan `post`,
 * tidak termasuk `post` itu sendiri, diacak, maksimal `max` item. */
function getRelatedPosts(post, max) {
  if (!post) return [];
  const postGenres = (post.genres || []).map((g) => g.toLowerCase());
  const candidates = getPublishedPosts().filter((p) => {
    if (p.id === post.id) return false;
    if (p.jenis !== post.jenis) return false;
    const pGenres = (p.genres || []).map((g) => g.toLowerCase());
    return pGenres.some((g) => postGenres.includes(g));
  });
  return shuffleArray(candidates).slice(0, max || 6);
}

/** Semua genre unik yang sedang dipakai oleh minimal 1 postingan,
 * diurutkan alfabetis. Genre yang tak dipakai post manapun otomatis
 * tidak akan muncul di sini (tak perlu dihapus manual). */
function getAllGenres() {
  const set = new Set();
  loadPosts().forEach((p) => (p.genres || []).forEach((g) => set.add(g)));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "id"));
}

/** Hitung jumlah post per genre. */
function countPostsByGenre(genre) {
  return loadPosts().filter((p) => (p.genres || []).some((g) => g.toLowerCase() === genre.toLowerCase())).length;
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

/** Ambil semua laporan dari localStorage. */
function loadReports() {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  } catch (e) {
    return [];
  }
}

/** Simpan seluruh array laporan ke localStorage. */
function saveReports(reports) {
  try {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
    return true;
  } catch (e) {
    return false;
  }
}

/** Tambah 1 laporan baru. attachment = {name, dataUrl} | null */
function addReport(title, name, content, attachment, contactMedia) {
  const reports = loadReports();
  reports.unshift({
    id: "report-" + Date.now(),
    title: title,
    name: name || "",
    contactMedia: contactMedia || "",
    content: content,
    attachment: attachment || null,
    date: new Date().toISOString(),
    status: "belum" // belum | sedang | selesai
  });
  saveReports(reports);
  if (typeof addNotification === "function") {
    addNotification("report", "Ada laporan masuk dengan judul " + title);
  }
}

// =========================================================
// Statistik Web (Informasi Web di Admin Panel)
// Semua statistik ini murni dihitung dari histori yang tersimpan
// di localStorage BROWSER INI SAJA (situs tidak punya backend/server,
// jadi tidak ada penghitungan pengunjung lintas-perangkat/pengguna).
// =========================================================
const VISITS_KEY = "fueeru_visits"; // array of ISO datetime string
const POST_VIEWS_KEY = "fueeru_post_views"; // { [postId]: [ISO datetime, ...] }
const ADMIN_PASSWORD_KEY = "fueeru_admin_password";
const ADMIN_PASSWORD_DEFAULT = "admin123";
const LOG_CAP = 8000; // batas jumlah entri log per key, biar localStorage tak membengkak

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
  } catch (e) {
    /* localStorage penuh — abaikan, statistik tetap jalan dari data yang sudah ada */
  }
}

/** Catat 1 kunjungan halaman publik. Dipanggil oleh main.js di setiap halaman publik. */
function logVisit() {
  const arr = _loadLog(VISITS_KEY);
  arr.push(new Date().toISOString());
  _saveLog(VISITS_KEY, arr);
}

/** Catat 1 views untuk 1 postingan. Dipanggil oleh post.html saat postingan dibuka. */
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
  } catch (e) {
    /* abaikan jika localStorage penuh */
  }
}

/** Ambil seluruh log views per-postingan sebagai object { postId: [iso,...] } */
function loadPostViewsLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(POST_VIEWS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

/** Awal minggu (Senin, 00:00) dari sebuah tanggal. */
function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0=Minggu ... 6=Sabtu
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Hitung berapa banyak timestamp ISO dalam array yang jatuh di rentang [start, end). */
function _countInRange(isoArr, start, end) {
  let n = 0;
  for (let i = 0; i < isoArr.length; i++) {
    const t = new Date(isoArr[i]).getTime();
    if (t >= start.getTime() && t < end.getTime()) n++;
  }
  return n;
}

/** Statistik kunjungan: total, minggu ini, minggu lalu. */
function getVisitStats() {
  const arr = _loadLog(VISITS_KEY);
  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const thisWeekEnd = new Date(thisWeekStart.getTime() + 7 * 86400000);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86400000);
  return {
    total: arr.length,
    thisWeek: _countInRange(arr, thisWeekStart, thisWeekEnd),
    lastWeek: _countInRange(arr, lastWeekStart, thisWeekStart)
  };
}

/** Statistik views postingan (gabungan semua postingan yang masih ada). */
function getPostViewStats() {
  const log = loadPostViewsLog();
  const validIds = new Set(loadPosts().map((p) => p.id));
  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const thisWeekEnd = new Date(thisWeekStart.getTime() + 7 * 86400000);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86400000);
  let total = 0,
    thisWeek = 0,
    lastWeek = 0;
  Object.keys(log).forEach((id) => {
    if (!validIds.has(id)) return;
    const arr = log[id];
    total += arr.length;
    thisWeek += _countInRange(arr, thisWeekStart, thisWeekEnd);
    lastWeek += _countInRange(arr, lastWeekStart, thisWeekStart);
  });
  return { total, thisWeek, lastWeek };
}

/** Jumlah views untuk 1 postingan tertentu. */
function getViewsForPost(postId) {
  const log = loadPostViewsLog();
  return Array.isArray(log[postId]) ? log[postId].length : 0;
}

/** Perkiraan total ukuran data situs yang tersimpan di localStorage (byte). */
function getStorageSizeEstimate() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) || "";
      total += (k ? k.length : 0) + v.length;
    }
  } catch (e) {}
  return total * 2; // perkiraan kasar: 2 byte per karakter (UTF-16)
}

/** Kata sandi admin saat ini (localStorage jika pernah diganti, atau default). */
function getAdminPassword() {
  try {
    return localStorage.getItem(ADMIN_PASSWORD_KEY) || ADMIN_PASSWORD_DEFAULT;
  } catch (e) {
    return ADMIN_PASSWORD_DEFAULT;
  }
}
/** Ganti kata sandi admin (disimpan apa adanya, tanpa hashing — situs tanpa backend). */
function setAdminPassword(newPassword) {
  try {
    localStorage.setItem(ADMIN_PASSWORD_KEY, newPassword);
    return true;
  } catch (e) {
    return false;
  }
}

// =========================================================
// Notifikasi Admin Panel
// =========================================================
const NOTIF_KEY = "fueeru_notifications";
const LAST_BACKUP_KEY = "fueeru_last_backup_at";

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
/** Tambah 1 notifikasi baru. type: 'report' | 'backup_reminder' */
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

/** Catat waktu backup terakhir (dipanggil saat admin klik "Unduh Backup Postingan"). */
function markBackupDone() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch (e) {}
}

/** Kalau sudah lebih dari seminggu sejak backup terakhir (atau belum pernah
 * backup sama sekali), dan belum ada notifikasi pengingat yang sama yang
 * masih tersimpan, tambahkan 1 notifikasi pengingat backup. Aman dipanggil
 * berkali-kali — tidak akan menumpuk notifikasi duplikat. */
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
// Recycle Bin (postingan & laporan yang dihapus)
// Item yang dihapus tidak langsung hilang — ditampung dulu di sini
// selama 30 hari (field `deletedAt`) sebelum dihapus permanen otomatis.
// =========================================================
const TRASH_POSTS_KEY = "fueeru_trash_posts";
const TRASH_REPORTS_KEY = "fueeru_trash_reports";
const TRASH_RETENTION_DAYS = 30;

function loadTrashPosts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRASH_POSTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}
function saveTrashPosts(list) {
  try {
    localStorage.setItem(TRASH_POSTS_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    return false;
  }
}
function loadTrashReports() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRASH_REPORTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}
function saveTrashReports(list) {
  try {
    localStorage.setItem(TRASH_REPORTS_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    return false;
  }
}

/** Pindahkan 1 postingan ke Recycle Bin (dipanggil saat "Hapus" ditekan). */
function trashPost(id) {
  const posts = loadPosts();
  const idx = posts.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  const item = posts[idx];
  posts.splice(idx, 1);
  savePosts(posts);
  const trash = loadTrashPosts();
  trash.unshift({ ...item, deletedAt: new Date().toISOString() });
  saveTrashPosts(trash);
  return true;
}
/** Pindahkan 1 laporan ke Recycle Bin. */
function trashReport(id) {
  const reports = loadReports();
  const idx = reports.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const item = reports[idx];
  reports.splice(idx, 1);
  saveReports(reports);
  const trash = loadTrashReports();
  trash.unshift({ ...item, deletedAt: new Date().toISOString() });
  saveTrashReports(trash);
  return true;
}

/** Pulihkan 1 item dari Recycle Bin kembali ke daftar aktif.
 * type: "posts" | "reports" */
function restoreFromTrash(type, id) {
  if (type === "posts") {
    const trash = loadTrashPosts();
    const idx = trash.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    const item = { ...trash[idx] };
    delete item.deletedAt;
    trash.splice(idx, 1);
    saveTrashPosts(trash);
    const posts = loadPosts();
    posts.unshift(item);
    savePosts(posts);
    return true;
  } else {
    const trash = loadTrashReports();
    const idx = trash.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    const item = { ...trash[idx] };
    delete item.deletedAt;
    trash.splice(idx, 1);
    saveTrashReports(trash);
    const reports = loadReports();
    reports.unshift(item);
    saveReports(reports);
    return true;
  }
}
/** Pulihkan SEMUA item dalam daftar `ids` dari Recycle Bin. */
function restoreAllFromTrash(type, ids) {
  ids.forEach((id) => restoreFromTrash(type, id));
}

/** Hapus 1 item secara permanen dari Recycle Bin (tidak bisa dibatalkan). */
function permanentlyDeleteFromTrash(type, id) {
  if (type === "posts") {
    saveTrashPosts(loadTrashPosts().filter((p) => p.id !== id));
  } else {
    saveTrashReports(loadTrashReports().filter((r) => r.id !== id));
  }
}
function permanentlyDeleteAllFromTrash(type, ids) {
  const idSet = new Set(ids);
  if (type === "posts") {
    saveTrashPosts(loadTrashPosts().filter((p) => !idSet.has(p.id)));
  } else {
    saveTrashReports(loadTrashReports().filter((r) => !idSet.has(r.id)));
  }
}

/** Hapus permanen otomatis item Recycle Bin yang sudah lebih dari 30 hari.
 * Aman dipanggil berkali-kali (misalnya setiap kali admin login). */
function purgeOldTrash() {
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 86400000;
  const posts = loadTrashPosts().filter((p) => new Date(p.deletedAt).getTime() >= cutoff);
  saveTrashPosts(posts);
  const reports = loadTrashReports().filter((r) => new Date(r.deletedAt).getTime() >= cutoff);
  saveTrashReports(reports);
}

// =========================================================
// Rate limit pengiriman laporan (maks. 3 laporan / hari / perangkat)
// Deteksi "perangkat" di sini murni berbasis localStorage browser ini
// saja (situs tanpa backend, jadi tidak ada cara memverifikasi
// perangkat fisik sungguhan) — cukup untuk mencegah spam kasual.
// =========================================================
const REPORT_RATE_KEY = "fueeru_report_rate";
const REPORT_RATE_LIMIT = 3;

function _todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}
/** Berapa laporan yang sudah dikirim dari perangkat ini hari ini. */
function getReportCountToday() {
  try {
    const raw = JSON.parse(localStorage.getItem(REPORT_RATE_KEY) || "null");
    if (!raw || raw.date !== _todayStr()) return 0;
    return raw.count || 0;
  } catch (e) {
    return 0;
  }
}
/** True kalau perangkat ini masih boleh mengirim laporan baru hari ini. */
function canSubmitReport() {
  return getReportCountToday() < REPORT_RATE_LIMIT;
}
/** Catat 1 laporan baru terkirim dari perangkat ini (untuk rate limit). */
function recordReportSubmission() {
  try {
    const count = getReportCountToday() + 1;
    localStorage.setItem(REPORT_RATE_KEY, JSON.stringify({ date: _todayStr(), count: count }));
  } catch (e) {}
}

// =========================================================
// Halaman statis yang bisa diedit lewat Admin Panel (menu "Halaman"):
// Tutorial Main, Cara Download, Donasi, Tentang.
// =========================================================
const PAGES_KEY = "fueeru_pages";
const DEFAULT_PAGE_CONTENT =
  "<p>Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>" +
  "<p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>";

const DEFAULT_PAGES = {
  tutorial: { title: "Tutorial Main", content: DEFAULT_PAGE_CONTENT },
  "cara-download": { title: "Cara Download", content: DEFAULT_PAGE_CONTENT },
  donasi: { title: "Donasi", content: DEFAULT_PAGE_CONTENT },
  tentang: { title: "Tentang", content: DEFAULT_PAGE_CONTENT }
};

function loadPages() {
  try {
    const raw = JSON.parse(localStorage.getItem(PAGES_KEY) || "null");
    if (raw && typeof raw === "object") {
      // Gabungkan dengan default supaya halaman baru (kalau ada) tetap punya isi awal.
      return Object.assign({}, DEFAULT_PAGES, raw);
    }
  } catch (e) {}
  return Object.assign({}, DEFAULT_PAGES);
}
function savePages(pages) {
  try {
    localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
    return true;
  } catch (e) {
    return false;
  }
}
/** Ambil { title, content } untuk 1 halaman (tutorial | cara-download | donasi | tentang). */
function getPageContent(pageId) {
  const pages = loadPages();
  return pages[pageId] || DEFAULT_PAGES[pageId] || { title: "", content: "" };
}
/** Simpan isi 1 halaman. Return "ok" | "storage-full". */
function savePageContent(pageId, content) {
  const pages = loadPages();
  if (!pages[pageId]) pages[pageId] = { title: DEFAULT_PAGES[pageId] ? DEFAULT_PAGES[pageId].title : pageId };
  pages[pageId].content = content;
  return savePages(pages) ? "ok" : "storage-full";
}

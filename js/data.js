/* =========================================================
   Fueeru Game — Data Layer
   Posts disimpan di localStorage (key: fueeru_posts).
   Laporan (dari page Laporkan) disimpan di localStorage (key: fueeru_reports).
   Tidak ada backend/server — semuanya berjalan di sisi browser.
   ========================================================= */

const STORAGE_KEY = "fueeru_posts";
const REPORTS_KEY = "fueeru_reports";
const DATA_VERSION_KEY = "fueeru_data_version";
const DATA_VERSION = "2"; // dinaikkan saat skema data (jenis/genres) berubah

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
    thumbnail: "postheader/post" + num + ".png",
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
    date: new Date().toISOString()
  });
  saveReports(reports);
}

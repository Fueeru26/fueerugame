/* =========================================================
   Fueeru Game — Interaksi umum (navbar, sidebar, search overlay)
   Dipakai di semua halaman publik.
   ========================================================= */

/* ---------------- Path helpers ----------------
   Situs punya beberapa "kedalaman" folder (root, web/).
   Halaman yang membutuhkan prefix berbeda mengatur window.SITE_BASE
   (prefix menuju folder "web/") dan/atau window.ASSET_BASE
   (prefix menuju aset di folder root: css/js/webpictures/font) lewat
   inline <script> sebelum data.js & main.js dimuat. */
function siteBase() {
  return (typeof window !== "undefined" && window.SITE_BASE) || "";
}
function assetBase() {
  return (typeof window !== "undefined" && window.ASSET_BASE) || "";
}
/** Resolusikan path aset (mis. thumbnail) supaya tetap benar di halaman
 * manapun. Tidak menyentuh data URL / URL absolut. */
function resolveAsset(path) {
  if (!path) return path;
  if (/^(data:|https?:\/\/|\/)/i.test(path)) return path;
  return assetBase() + path;
}

function initChrome() {
  // Catat 1 kunjungan halaman publik (statistik lokal untuk Informasi Web di Admin Panel)
  if (typeof logVisit === "function") logVisit();

  // ---------------- Dark mode toggle ----------------
  const THEME_KEY = "fueeru_theme";
  const themeButtons = document.querySelectorAll(".theme-btn");

  function getCurrentTheme() {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }
  function applyTheme(theme) {
    document.documentElement.classList.toggle("dark", theme === "dark");
    themeButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-theme") === theme);
    });
  }
  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const theme = btn.getAttribute("data-theme");
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (e) {
        /* localStorage tidak tersedia, abaikan */
      }
      applyTheme(theme);
    });
  });
  applyTheme(getCurrentTheme());

  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const openBtn = document.getElementById("btnOpenSidebar");
  const closeBtn = document.getElementById("btnCloseSidebar");

  function openSidebar() {
    sidebar.classList.add("open");
    overlay.classList.add("open");
    sidebar.setAttribute("aria-hidden", "false");
  }
  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
    sidebar.setAttribute("aria-hidden", "true");
  }
  if (openBtn) openBtn.addEventListener("click", openSidebar);
  if (closeBtn) closeBtn.addEventListener("click", closeSidebar);
  if (overlay) overlay.addEventListener("click", closeSidebar);

  // ---------------- Search overlay ----------------
  const searchPanel = document.getElementById("searchPanel");
  const searchBackdrop = document.getElementById("searchBackdrop");
  const openSearchBtn = document.getElementById("btnOpenSearch");
  const closeSearchBtn = document.getElementById("btnCloseSearch");
  const searchForm = document.getElementById("searchForm");
  const searchInput = document.getElementById("searchInput");

  function isSearchOpen() {
    return searchPanel && searchPanel.classList.contains("open");
  }
  function openSearch() {
    if (!searchPanel) return;
    searchPanel.classList.add("open");
    if (searchBackdrop) searchBackdrop.classList.add("open");
    setTimeout(() => searchInput && searchInput.focus(), 200);
  }
  function closeSearch() {
    if (!searchPanel) return;
    searchPanel.classList.remove("open");
    if (searchBackdrop) searchBackdrop.classList.remove("open");
  }
  // Tombol kaca pembesar di navbar berfungsi sebagai toggle:
  // buka jika tertutup, tutup jika sedang terbuka.
  if (openSearchBtn) {
    openSearchBtn.addEventListener("click", function () {
      if (isSearchOpen()) closeSearch();
      else openSearch();
    });
  }
  if (closeSearchBtn) closeSearchBtn.addEventListener("click", closeSearch);
  if (searchBackdrop) searchBackdrop.addEventListener("click", closeSearch);
  if (searchForm) {
    searchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const q = (searchInput.value || "").trim();
      window.location.href = siteBase() + "search.html" + (q ? "?q=" + encodeURIComponent(q) : "");
    });
  }

  // Escape closes overlays
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeSidebar();
      closeSearch();
    }
  });

  // Mark active nav link
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".sidebar-nav a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === current) a.classList.add("active");
  });
}

/** Aktifkan fungsi buka/tutup (toggle) untuk semua kotak spoiler yang
 * ada di dalam `container` (default: seluruh dokumen). Label "SPOILER"
 * tetap ada setelah dibuka — klik lagi untuk menutupnya kembali. */
function initSpoilers(container) {
  (container || document).querySelectorAll(".spoiler-content").forEach((box) => {
    const label = box.querySelector(".spoiler-label");
    if (!label || label.dataset.spoilerBound) return;
    label.dataset.spoilerBound = "1";
    label.addEventListener("click", function () {
      box.classList.toggle("revealed");
    });
  });
}

/** Render kartu untuk carousel "Random Game" */
function renderCarousel(containerId, posts) {
  const track = document.getElementById(containerId);
  if (!track) return;
  track.innerHTML = posts
    .map(
      (p) => `
    <a class="game-card" href="${siteBase()}post.html?id=${encodeURIComponent(p.id)}">
      <img class="thumb" src="${resolveAsset(p.thumbnail)}" alt="Thumbnail ${escapeHtml(p.title)}" loading="lazy">
      <div class="gc-body">
        <div class="gc-title">${escapeHtml(p.title)}</div>
      </div>
    </a>`
    )
    .join("");
}

function initCarouselArrows(trackId, prevId, nextId) {
  const track = document.getElementById(trackId);
  const prev = document.getElementById(prevId);
  const next = document.getElementById(nextId);
  if (!track) return;
  const scrollAmount = 220;
  if (prev) prev.addEventListener("click", () => track.scrollBy({ left: -scrollAmount, behavior: "smooth" }));
  if (next) next.addEventListener("click", () => track.scrollBy({ left: scrollAmount, behavior: "smooth" }));
}

/** Render 1 baris post (dipakai New Update, Jenis/Genre, Search).
 * opts.showPreview: tampilkan preview isi (default true)
 * opts.showGenres: tampilkan chip genre (default true)
 */
function postRowHtml(p, opts) {
  opts = opts || {};
  const showPreview = opts.showPreview !== false;
  const showGenres = opts.showGenres !== false;
  const genres = p.genres || [];

  return `
    <div class="post-row">
      <a href="${siteBase()}post.html?id=${encodeURIComponent(p.id)}" style="flex:0 0 auto;">
        <img class="thumb" src="${resolveAsset(p.thumbnail)}" alt="Thumbnail ${escapeHtml(p.title)}" loading="lazy">
      </a>
      <div class="prow-body">
        <a href="${siteBase()}post.html?id=${encodeURIComponent(p.id)}">
          <div class="prow-title">${escapeHtml(p.title)}</div>
        </a>
        ${showPreview ? `<div class="prow-preview">${escapeHtml(makePreview(p.content))}</div>` : ""}
        <div class="meta-row">
          <span>${escapeHtml(formatDate(p.date))}</span>
          <span class="pill">${escapeHtml(p.jenis)}</span>
        </div>
        ${showGenres && genres.length ? `<div class="genre-chip-row">${genres.map((g) => `<span class="genre-chip">${escapeHtml(g)}</span>`).join("")}</div>` : ""}
      </div>
    </div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/** Komponen pagination generik.
 * Hanya menampilkan nomor halaman yang sedang aktif (bukan daftar semua
 * nomor halaman) — supaya tetap ringkas walau jumlah halaman terus bertambah.
 * onChange(page) dipanggil setiap kali user pindah halaman.
 */
function renderPagination(containerId, totalItems, pageSize, currentPage, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) {
    el.innerHTML = "";
    return;
  }
  let html = "";
  html += `<button data-page="1" ${currentPage === 1 ? "disabled" : ""} aria-label="Halaman pertama">&laquo;</button>`;
  html += `<button data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""} aria-label="Sebelumnya">&lsaquo;</button>`;
  html += `<button data-page="${currentPage}" class="active" aria-current="page">${currentPage}</button>`;
  html += `<button data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""} aria-label="Berikutnya">&rsaquo;</button>`;
  html += `<button data-page="${totalPages}" ${currentPage === totalPages ? "disabled" : ""} aria-label="Halaman terakhir">&raquo;</button>`;
  el.innerHTML = html;
  el.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const page = parseInt(btn.getAttribute("data-page"), 10);
      if (!isNaN(page)) onChange(page);
    });
  });
}

/* ---------------- PWA: "Tambah ke Layar Utama" ----------------
   Sengaja TIDAK memakai prompt otomatis bawaan browser (yang suka
   muncul tiba-tiba tanpa diminta). Event `beforeinstallprompt`
   ditangkap & ditahan dulu (preventDefault), baru benar-benar
   ditampilkan saat pengunjung sendiri menekan menu "Tambah ke Layar
   Utama" di sidebar. */
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  deferredInstallPrompt = e;
});

window.addEventListener("appinstalled", function () {
  deferredInstallPrompt = null;
});

function initPWAInstallMenu() {
  const btn = document.getElementById("btnInstallPWA");
  if (!btn) return;

  // Kalau situs sedang dibuka dalam mode "sudah terinstall" (standalone),
  // menu ini tidak relevan lagi -> sembunyikan.
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (isStandalone) {
    const li = btn.closest("li");
    if (li) li.style.display = "none";
    return;
  }

  btn.addEventListener("click", async function (e) {
    e.preventDefault();
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      try {
        await deferredInstallPrompt.userChoice;
      } catch (err) {
        /* diabaikan */
      }
      deferredInstallPrompt = null;
    } else {
      alert(
        "Browser ini belum menawarkan instalasi otomatis (atau situs sudah terpasang).\n\n" +
          "Di iPhone/iPad: buka menu Share lalu pilih \"Tambah ke Layar Utama\".\n" +
          "Di HP/PC lain: cari ikon Install di address bar browser."
      );
    }
  });
}

/* ---------------- PWA: registrasi Service Worker ----------------
   Meng-cache aset statis supaya situs lebih cepat dibuka kedua kali
   dan tetap bisa diakses (versi cache) walau sedang offline. */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const swUrl = assetBase() + "sw.js";
  const swScope = assetBase() || "./";
  window.addEventListener("load", function () {
    navigator.serviceWorker.register(swUrl, { scope: swScope }).catch(function () {
      /* diabaikan — situs tetap berjalan normal tanpa Service Worker */
    });
  });
}
registerServiceWorker();

document.addEventListener("DOMContentLoaded", initChrome);
document.addEventListener("DOMContentLoaded", initPWAInstallMenu);

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
  // Catat 1 kunjungan halaman publik (statistik server untuk Informasi Web di Admin Panel)
  if (typeof logVisit === "function") logVisit();

  // Catat kunjungan ke halaman statis (Tutorial/Cara Download/Donasi/Tentang)
  // secara spesifik -> "Halaman Paling Sering Dibuka" di Informasi Web.
  if (typeof logPageView === "function") {
    const path = (typeof location !== "undefined" && location.pathname) || "";
    const pageMatch = path.match(/\/(tutorial|cara-download|donasi|tentang)\.html$/);
    if (pageMatch) logPageView(pageMatch[1]);
  }

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

  // ---------------- Search overlay (mobile) ----------------
  const searchPanel = document.getElementById("searchPanel");
  const searchBackdrop = document.getElementById("searchBackdrop");
  const openSearchBtn = document.getElementById("btnOpenSearch");
  const closeSearchBtn = document.getElementById("btnCloseSearch");
  const searchForm = document.getElementById("searchForm");
  const searchInput = document.getElementById("searchInput");

  // ---------------- Search bar (navbar desktop) ----------------
  // Kotak pencarian yang selalu terlihat di navbar tampilan desktop
  // (tidak lewat overlay seperti di mobile).
  const searchFormTop = document.getElementById("searchFormTop");
  if (searchFormTop) {
    searchFormTop.addEventListener("submit", function (e) {
      e.preventDefault();
      const input = document.getElementById("searchInputTop");
      const q = ((input && input.value) || "").trim();
      window.location.href = siteBase() + "search.html" + (q ? "?q=" + encodeURIComponent(q) : "");
    });
  }

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

  // Mark active nav link (sidebar mobile + menubar desktop)
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".sidebar-nav a, .menubar-inner a").forEach((a) => {
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
/** Fallback: kalau src gambar gagal dimuat (mis. data lama menunjuk ke
 * file yang tak pernah benar-benar ada di server, seperti placeholder
 * "postheader/..."), otomatis ganti ke gambar placeholder bawaan supaya
 * tidak tampil ikon gambar rusak. */
function thumbFallbackAttr() {
  return `onerror="this.onerror=null;this.src='${resolveAsset('webpictures/postplaceholder.webp')}';"`;
}

function renderCarousel(containerId, posts) {
  const track = document.getElementById(containerId);
  if (!track) return;
  track.innerHTML = posts
    .map(
      (p) => `
    <a class="game-card" href="${siteBase()}post.html?id=${encodeURIComponent(p.id)}">
      <img class="thumb" src="${resolveAsset(p.thumbnail)}" alt="Thumbnail ${escapeHtml(p.title)}" loading="lazy" ${thumbFallbackAttr()}>
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
        <img class="thumb" src="${resolveAsset(p.thumbnail)}" alt="Thumbnail ${escapeHtml(p.title)}" loading="lazy" ${thumbFallbackAttr()}>
      </a>
      <div class="prow-body">
        <a href="${siteBase()}post.html?id=${encodeURIComponent(p.id)}">
          <div class="prow-title">${escapeHtml(p.title)}</div>
        </a>
        ${showPreview ? `<div class="prow-preview">${escapeHtml(makePreview(p.content))}</div>` : ""}
        <div class="meta-row">
          <span>${escapeHtml(formatDate(p.date))}</span>
          <span class="pill">${escapeHtml(p.jenis)}</span>
          ${(p.platform || []).map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join("")}
          ${p.bahasa ? `<span class="pill">${escapeHtml(p.bahasa)}</span>` : ""}
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
  // tombol ini tidak relevan lagi -> sembunyikan.
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (isStandalone) {
    const wrap = btn.closest(".install-wrap") || btn.closest("li");
    if (wrap) wrap.style.display = "none";
    else btn.style.display = "none";
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

/* ---------------- Navigasi bar kanan (tampilan desktop) ----------------
   Dipakai di semua halaman publik kecuali index & 404: berisi widget
   "Game Populer" (10 postingan), "Kategori" (platform/bahasa/jenis), dan
   "Rekomendasi Genre" (10 genre acak, grid 2 kolom). */
async function renderRightAside() {
  const aside = document.getElementById("rightAside");
  if (!aside) return;

  const populerEl = document.getElementById("asidePopuler");
  if (populerEl) {
    const populer = await getPopularPosts(10);
    populerEl.innerHTML = populer.length
      ? populer
          .map(
            (p) => `
        <a class="aside-populer-item" href="${siteBase()}post.html?id=${encodeURIComponent(p.id)}">
          <img class="thumb" src="${resolveAsset(p.thumbnail)}" alt="Thumbnail ${escapeHtml(p.title)}" loading="lazy" ${thumbFallbackAttr()}>
          <div class="ap-title">${escapeHtml(p.title)}</div>
        </a>`
          )
          .join("")
      : `<p style="color:var(--ink-soft);font-size:.85rem;">Belum ada postingan.</p>`;
  }

  const kategoriEl = document.getElementById("asideKategori");
  if (kategoriEl) {
    const tags = [
      ...PLATFORM_TAGS.map((t) => ({ label: t, href: "category.html?platform=" + encodeURIComponent(t) })),
      ...BAHASA_LIST.map((b) => ({ label: b, href: "category.html?bahasa=" + encodeURIComponent(b) })),
      ...JENIS_LIST.map((j) => ({ label: j, href: "category.html?jenis=" + encodeURIComponent(j) })),
    ];
    kategoriEl.innerHTML = tags
      .map((t) => `<a href="${siteBase()}${t.href}">${escapeHtml(t.label)}</a>`)
      .join("");
  }

  const genreEl = document.getElementById("asideGenre");
  if (genreEl) {
    const genres = await getTopGenres(10);
    genreEl.innerHTML = genres.length
      ? genres
          .map(
            (g) =>
              `<a href="${siteBase()}category.html?genre=${encodeURIComponent(g.genre)}">${escapeHtml(g.genre)} <span class="count">(${g.count})</span></a>`
          )
          .join("")
      : `<p style="color:var(--ink-soft);font-size:.85rem;grid-column:1/-1;">Belum ada genre.</p>`;
  }
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

/* ---------------- Bagikan Postingan (di bawah genre postingan) ----------------
   4 opsi: Facebook, Tweet (X), Salin Link, dan Berbagi (native Web Share API —
   membuka window share bawaan HP/browser ke banyak aplikasi sekaligus,
   lengkap dengan ringkasan judul postingan). */
let shareToastTimer = null;
function shareShowToast(msg) {
  let toast = document.getElementById("shareToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "shareToast";
    toast.className = "share-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(shareToastTimer);
  shareToastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

async function shareCopyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (err) {
      return false;
    }
  }
}

function initShareSection(container, post) {
  const wrap = container.querySelector(".share-section");
  if (!wrap) return;
  const url = window.location.href;
  const title = post.title;

  wrap.querySelector('[data-share="facebook"]').addEventListener("click", () => {
    window.open("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url), "_blank", "noopener,width=580,height=520");
  });

  wrap.querySelector('[data-share="twitter"]').addEventListener("click", () => {
    const text = `${title} — Fueeru Game`;
    window.open("https://twitter.com/intent/tweet?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(text), "_blank", "noopener,width=580,height=520");
  });

  wrap.querySelector('[data-share="copy"]').addEventListener("click", async () => {
    const ok = await shareCopyToClipboard(url);
    shareShowToast(ok ? "Link disalin" : "Gagal menyalin link");
  });

  wrap.querySelector('[data-share="native"]').addEventListener("click", () => {
    openShareModal(post);
  });
}

/* ---------------- Modal "Bagikan ke aplikasi lain" ----------------
   Dipicu oleh tombol Berbagi. Ukuran & gaya mengikuti modal Konfirmasi
   Umur (age gate) — kartu putih/gelap di tengah layar dengan backdrop
   gelap. Berisi ringkasan postingan (thumbnail + judul + kategori/genre)
   dan tombol share ke 8 aplikasi. */
const SHARE_APPS = [
  {
    id: "instagram",
    label: "Instagram",
    bg: "linear-gradient(135deg,#f58529,#dd2a7b,#8134af,#515bd4)",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.2" cy="6.8" r="1" fill="#fff" stroke="none"/></svg>`,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    bg: "#25d366",
    icon: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 00-8.5 15.2L2 22l4.9-1.5A10 10 0 1012 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-3-1.3-5-4.3-5.1-4.5-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5.2.5.7 1.8.8 1.9.1.1.1.3 0 .5-.1.2-.1.3-.3.5l-.4.5c-.1.1-.3.3-.1.6.2.3.9 1.5 1.9 2.4 1.3 1.2 2.4 1.5 2.7 1.7.3.1.5.1.7-.1.2-.2.7-.8.9-1.1.2-.3.4-.2.6-.1l1.7.8c.2.1.3.2.4.3.1.2.1.9-.1 1.6z"/></svg>`,
  },
  {
    id: "threads",
    label: "Threads",
    bg: "#000",
    icon: `<span style="font-family:'Poppins',sans-serif;font-weight:800;font-size:19px;color:#fff;">@</span>`,
  },
  {
    id: "telegram",
    label: "Telegram",
    bg: "#26a5e4",
    icon: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M21.9 3.5L2.6 11c-1 .4-1 1.7.1 2l4.7 1.5 1.8 5.7c.2.7 1.1.9 1.6.3l2.6-2.9 4.8 3.6c.7.5 1.7.1 1.9-.8l3-16.1c.2-1-.8-1.7-1.6-1.3zM8.6 14l9.6-6.7L9.9 15.8l-.3 3-1-4.8z"/></svg>`,
  },
  {
    id: "discord",
    label: "Discord",
    bg: "#5865f2",
    icon: `<span style="font-family:'Poppins',sans-serif;font-weight:800;font-size:19px;color:#fff;">D</span>`,
  },
  {
    id: "email",
    label: "Email",
    bg: "#6b8299",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`,
  },
  {
    id: "pinterest",
    label: "Pinterest",
    bg: "#e60023",
    icon: `<span style="font-family:'Poppins',sans-serif;font-weight:800;font-size:19px;color:#fff;">P</span>`,
  },
  {
    id: "reddit",
    label: "Reddit",
    bg: "#ff4500",
    icon: `<span style="font-family:'Poppins',sans-serif;font-weight:800;font-size:19px;color:#fff;">r</span>`,
  },
];

function shareAppAction(appId, url, title, text, thumbUrl) {
  switch (appId) {
    case "whatsapp":
      window.open("https://api.whatsapp.com/send?text=" + encodeURIComponent(text + " " + url), "_blank", "noopener");
      break;
    case "telegram":
      window.open("https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(text), "_blank", "noopener");
      break;
    case "threads":
      window.open("https://www.threads.net/intent/post?text=" + encodeURIComponent(text + " " + url), "_blank", "noopener");
      break;
    case "email":
      window.location.href = "mailto:?subject=" + encodeURIComponent(text) + "&body=" + encodeURIComponent(url);
      break;
    case "pinterest":
      window.open("https://pinterest.com/pin/create/button/?url=" + encodeURIComponent(url) + "&description=" + encodeURIComponent(text) + (thumbUrl ? "&media=" + encodeURIComponent(thumbUrl) : ""), "_blank", "noopener");
      break;
    case "reddit":
      window.open("https://www.reddit.com/submit?url=" + encodeURIComponent(url) + "&title=" + encodeURIComponent(title), "_blank", "noopener");
      break;
    case "instagram":
    case "discord":
    default:
      // Instagram & Discord tidak punya URL share resmi di web — link
      // disalin supaya bisa ditempel manual di aplikasinya.
      shareCopyToClipboard(url).then((ok) => {
        shareShowToast(ok ? `Link disalin — tempel di ${SHARE_APPS.find((a) => a.id === appId).label}` : "Gagal menyalin link");
      });
      break;
  }
}

function openShareModal(post) {
  const url = window.location.href;
  const title = post.title;
  const text = `${title} — Fueeru Game`;
  const genres = post.genres || [];
  const metaText = [post.jenis, genres.join(", ")].filter(Boolean).join(" • ");

  const backdrop = document.createElement("div");
  backdrop.className = "share-modal-backdrop";
  backdrop.innerHTML = `
    <div class="share-modal-box">
      <h3 class="share-modal-title">Bagikan ke aplikasi lain</h3>
      <div class="share-modal-preview">
        <img class="share-modal-thumb" src="${resolveAsset(post.thumbnail)}" alt="" onerror="this.onerror=null;this.src='${assetBase()}webpictures/postplaceholder.webp';">
        <div class="share-modal-info">
          <div class="share-modal-post-title">${escapeHtml(title)}</div>
          <div class="share-modal-post-meta">${escapeHtml(metaText)}</div>
        </div>
      </div>
      <div class="share-modal-apps">
        ${SHARE_APPS.map(
          (app) => `
          <button type="button" class="share-app-btn" data-app="${app.id}">
            <span class="share-app-ic" style="background:${app.bg};">${app.icon}</span>
            ${app.label}
          </button>`
        ).join("")}
      </div>
      <button type="button" class="share-modal-close" id="shareModalClose">Tutup</button>
    </div>`;
  document.body.appendChild(backdrop);
  document.documentElement.style.overflow = "hidden";

  function closeModal() {
    document.documentElement.style.overflow = "";
    backdrop.remove();
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
  backdrop.querySelector("#shareModalClose").addEventListener("click", closeModal);
  backdrop.querySelectorAll(".share-app-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      shareAppAction(btn.getAttribute("data-app"), url, title, text, resolveAsset(post.thumbnail));
    });
  });
}

document.addEventListener("DOMContentLoaded", initChrome);
document.addEventListener("DOMContentLoaded", initPWAInstallMenu);
document.addEventListener("DOMContentLoaded", renderRightAside);

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

  // ---------------- Dark mode toggle (satu ikon Matahari/Bulan di header) ----------------
  const THEME_KEY = "fueeru_theme";
  const themeToggleBtn = document.getElementById("btnThemeToggle");

  function getCurrentTheme() {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }
  function applyTheme(theme) {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const next = getCurrentTheme() === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* localStorage tidak tersedia, abaikan */
      }
      applyTheme(next);
    });
  }
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

  // Mark active nav link (sidebar mobile + menubar desktop, termasuk yang di dalam submenu/dropdown)
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".sidebar-nav a, .menubar-inner a, .menubar-dropdown-menu a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === current) {
      a.classList.add("active");
      const submenuLi = a.closest(".has-submenu");
      if (submenuLi) submenuLi.classList.add("open");
      const dropdownWrap = a.closest(".menubar-dropdown");
      if (dropdownWrap) dropdownWrap.classList.add("open");
    }
  });

  // ---------------- Sidebar: submenu dropdown (Formulir / Panduan) ----------------
  document.querySelectorAll(".submenu-toggle").forEach((btn) => {
    btn.addEventListener("click", function () {
      const li = btn.closest(".has-submenu");
      if (li) li.classList.toggle("open");
    });
  });

  // ---------------- Menubar desktop: dropdown (Formulir / Panduan) ----------------
  document.querySelectorAll(".menubar-dropdown-toggle").forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const wrap = btn.closest(".menubar-dropdown");
      const wasOpen = wrap.classList.contains("open");
      document.querySelectorAll(".menubar-dropdown.open").forEach((d) => d.classList.remove("open"));
      if (!wasOpen) wrap.classList.add("open");
    });
  });
  document.addEventListener("click", function () {
    document.querySelectorAll(".menubar-dropdown.open").forEach((d) => d.classList.remove("open"));
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

/** Aktifkan navigasi kiri/kanan untuk galeri gambar (hasil upload banyak
 * gambar sekaligus di editor Admin) di dalam `container`. Geser antar
 * gambar pakai transform (bukan scroll manual). Galeri berisi 1 gambar
 * saja: tombol navigasi otomatis disembunyikan. */
function initImgGalleries(container) {
  (container || document).querySelectorAll(".img-gallery").forEach((gallery) => {
    // Pakai properti JS biasa (bukan dataset/atribut HTML) sebagai penanda
    // "sudah dipasangi event" — dataset akan ikut tersimpan ke HTML
    // postingan dan bikin tombol navigasi kelihatan tapi tidak berfungsi
    // saat konten itu dimuat ulang di halaman lain.
    if (gallery._navBound) return;
    gallery._navBound = true;
    const track = gallery.querySelector(".img-gallery-track");
    const imgs = track ? track.children : [];
    if (imgs.length <= 1) {
      gallery.classList.add("single-image");
      return;
    }
    let index = 0;
    function update() {
      if (track) track.style.transform = "translateX(-" + index * 100 + "%)";
    }
    const prevBtn = gallery.querySelector(".img-gallery-nav.prev");
    const nextBtn = gallery.querySelector(".img-gallery-nav.next");
    if (prevBtn) {
      prevBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        index = (index - 1 + imgs.length) % imgs.length;
        update();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        index = (index + 1) % imgs.length;
        update();
      });
    }
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

/** Kartu tunggal "Rekomendasi" di beranda: landscape, geser kiri/kanan,
 * penanda bulat, dan geser otomatis tiap 5 detik. Ukuran kartu tetap
 * (aspect-ratio gambar + tinggi judul 3 baris), isi kontennya saja yang
 * berganti saat pindah slide. */
function initFeatureCarousel(posts) {
  const card = document.getElementById("featureCard");
  if (!card || !posts || posts.length === 0) return;

  const thumb = document.getElementById("featureThumb");
  const mediaLink = document.getElementById("featureLink");
  const titleLink = document.getElementById("featureTitleLink");
  const titleEl = document.getElementById("featureTitle");
  const dotsWrap = document.getElementById("featureDots");
  const prevBtn = document.getElementById("featurePrev");
  const nextBtn = document.getElementById("featureNext");

  const total = posts.length;
  let index = 0;
  let timer = null;

  dotsWrap.innerHTML = posts
    .map((_, i) => `<button type="button" class="feature-dot" aria-label="Ke slide ${i + 1}"></button>`)
    .join("");
  const dots = dotsWrap.querySelectorAll(".feature-dot");

  function render() {
    const p = posts[index];
    const href = `${siteBase()}post.html?id=${encodeURIComponent(p.id)}`;
    thumb.src = resolveAsset(p.thumbnail);
    thumb.alt = `Thumbnail ${p.title}`;
    thumb.onerror = function () {
      this.onerror = null;
      this.src = resolveAsset("webpictures/postplaceholder.webp");
    };
    if (mediaLink) mediaLink.href = href;
    if (titleLink) titleLink.href = href;
    if (titleEl) titleEl.textContent = p.title;
    dots.forEach((d, i) => d.classList.toggle("active", i === index));
  }

  function resetAutoplay() {
    if (timer) clearInterval(timer);
    if (total > 1) {
      timer = setInterval(() => {
        index = (index + 1) % total;
        render();
      }, 5000);
    }
  }

  function goTo(i) {
    index = (i + total) % total;
    render();
    resetAutoplay();
  }

  dots.forEach((d, i) => d.addEventListener("click", () => goTo(i)));
  if (prevBtn) prevBtn.addEventListener("click", () => goTo(index - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => goTo(index + 1));

  render();
  resetAutoplay();
}

/** Ikon-ikon kecil untuk meta info postingan (tanggal & kategori). */
function calendarIconSvg() {
  return `<svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
}
function jenisIconSvg() {
  return `<svg class="pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="6"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="11" r="1" fill="currentColor" stroke="none"/></svg>`;
}
function platformIconSvg(name) {
  const n = (name || "").toLowerCase();
  if (n === "android") {
    return `<svg class="pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="8" width="12" height="10" rx="2"/><line x1="9" y1="4" x2="9" y2="8"/><line x1="15" y1="4" x2="15" y2="8"/><line x1="3" y1="10" x2="3" y2="16"/><line x1="21" y1="10" x2="21" y2="16"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><circle cx="9.5" cy="12" r=".6" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12" r=".6" fill="currentColor" stroke="none"/></svg>`;
  }
  if (n === "pc") {
    return `<svg class="pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>`;
  }
  return `<svg class="pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`;
}
function bahasaIconSvg() {
  return `<svg class="pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 010 18a14 14 0 010-18"/></svg>`;
}
/** Baris meta info (tanggal + jenis + platform + bahasa) dengan ikon,
 * dipakai bareng di daftar postingan (postItemHtml) & halaman detail post. */
function metaRowInnerHtml(p) {
  return `
    <span class="meta-date">${calendarIconSvg()}${escapeHtml(formatDate(p.date))}</span>
    <span class="pill">${jenisIconSvg()}${escapeHtml(p.jenis)}</span>
    ${(p.platform || []).map((t) => `<span class="pill">${platformIconSvg(t)}${escapeHtml(t)}</span>`).join("")}
    ${p.bahasa ? `<span class="pill">${bahasaIconSvg()}${escapeHtml(p.bahasa)}</span>` : ""}`;
}

/** Render 1 kartu post untuk daftar postingan (Update Terbaru, Kategori,
 * Pencarian). Hanya thumbnail + judul (maks 3 baris) + tanggal — tanpa
 * tag kategori/genre — supaya ukuran kartu selalu tetap. Markup SAMA
 * persis untuk tampilan List & Grid; bedanya murni CSS lewat atribut
 * data-view di kontainer (lihat .post-items[data-view]). */
function postItemHtml(p) {
  const href = `${siteBase()}post.html?id=${encodeURIComponent(p.id)}`;
  return `
    <a class="post-item" href="${href}">
      <img class="pi-thumb" src="${resolveAsset(p.thumbnail)}" alt="Thumbnail ${escapeHtml(p.title)}" loading="lazy" ${thumbFallbackAttr()}>
      <div class="pi-body">
        <div class="pi-title">${escapeHtml(p.title)}</div>
        <div class="pi-date">${calendarIconSvg()}${escapeHtml(formatDate(p.date))}</div>
      </div>
    </a>`;
}

/** Tombol toggle tampilan List/Grid (icon Matahari/Bulan-style: 1 tombol,
 * ikonnya gantian sesuai tampilan aktif saat ini). */
function viewToggleButtonHtml(toggleBtnId) {
  return `
    <button type="button" class="icon-btn view-toggle-btn" id="${toggleBtnId}" aria-label="Ganti tampilan daftar postingan">
      <svg class="icon-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
      <svg class="icon-list" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
    </button>`;
}

/** HTML section-head yang punya tombol toggle tampilan List/Grid di
 * ujung kanan — dipakai di semua halaman daftar postingan. */
function sectionHeadWithViewToggleHtml(headingHtml, toggleBtnId, extraClass) {
  return `
    <div class="section-head${extraClass ? " " + extraClass : ""}">
      ${headingHtml}
      ${viewToggleButtonHtml(toggleBtnId)}
    </div>`;
}

/** Preferensi tampilan List/Grid pengunjung (localStorage), fallback ke
 * default yang diatur Admin (Pengaturan > Style), fallback akhir "list". */
function getPostViewPreference() {
  try {
    const v = localStorage.getItem("fueeru_postview");
    if (v === "list" || v === "grid") return v;
    if (localStorage.getItem("fueeru_postview_default_cache") === "grid") return "grid";
  } catch (e) {}
  return "list";
}
function setPostViewPreference(v) {
  try { localStorage.setItem("fueeru_postview", v); } catch (e) {}
}

/** Pasang tombol toggle List/Grid pada 1 kontainer daftar postingan.
 * Cukup 1x panggil setelah listEl & btn ada di DOM (boleh sebelum atau
 * sesudah listEl diisi kartu, karena yang berubah cuma atribut data-view). */
function wireViewToggle(toggleBtnId, listElId) {
  const btn = document.getElementById(toggleBtnId);
  const listEl = document.getElementById(listElId);
  if (!btn || !listEl) return () => "list";
  let view = getPostViewPreference();
  function apply() {
    listEl.setAttribute("data-view", view);
    btn.setAttribute("data-view", view);
  }
  apply();
  btn.addEventListener("click", () => {
    view = view === "grid" ? "list" : "grid";
    setPostViewPreference(view);
    apply();
  });
  return () => view;
}

/** Jumlah post per halaman untuk daftar postingan: 10 di mobile, 20 di
 * desktop (breakpoint sama dengan CSS: 980px). */
function getPostPageSize() {
  return window.matchMedia && window.matchMedia("(min-width: 980px)").matches ? 20 : 10;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/* =========================================================
   Custom Select — pengganti window pilihan bawaan browser/OS
   untuk elemen <select> di halaman publik (mis. Engine Game di
   form Request Game). Sama seperti versi Admin Panel.
   ========================================================= */
const customSelectRegistry = {};

function buildCustomSelect(select) {
  const wrap = document.createElement("div");
  wrap.className = "custom-select";
  wrap.setAttribute("data-for", select.id);

  select.parentNode.insertBefore(wrap, select);
  select.classList.add("native-select-hidden");
  select.setAttribute("tabindex", "-1");
  select.setAttribute("aria-hidden", "true");
  wrap.appendChild(select);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "custom-select-btn";
  btn.innerHTML =
    '<span class="custom-select-label"></span>' +
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  wrap.appendChild(btn);

  const menu = document.createElement("div");
  menu.className = "custom-select-menu";
  wrap.appendChild(menu);

  const labelEl = btn.querySelector(".custom-select-label");

  function closeMenu() {
    menu.classList.remove("show");
    btn.classList.remove("open");
  }
  function renderOptions() {
    menu.innerHTML = Array.from(select.options)
      .map(function (o) {
        return (
          '<button type="button" data-value="' +
          escapeHtml(o.value) +
          '" class="' +
          (o.value === select.value ? "selected" : "") +
          '">' +
          escapeHtml(o.textContent) +
          "</button>"
        );
      })
      .join("");
  }
  function syncLabel() {
    const opt = select.options[select.selectedIndex];
    labelEl.textContent = opt ? opt.textContent : "";
  }

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    const isOpen = menu.classList.contains("show");
    document.querySelectorAll(".custom-select-menu.show").forEach(function (m) {
      m.classList.remove("show");
      if (m.previousElementSibling) m.previousElementSibling.classList.remove("open");
    });
    if (!isOpen) {
      renderOptions();
      menu.classList.add("show");
      btn.classList.add("open");
    }
  });
  menu.addEventListener("click", function (e) {
    const optBtn = e.target.closest("button[data-value]");
    if (!optBtn) return;
    select.value = optBtn.getAttribute("data-value");
    syncLabel();
    closeMenu();
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  document.addEventListener("click", closeMenu);

  syncLabel();
  customSelectRegistry[select.id] = { syncLabel: syncLabel };
}

/** Sinkronkan label tombol custom select dengan nilai <select> aslinya —
 * dipanggil setiap kali kode mengubah `.value` select secara terprogram. */
function refreshCustomSelect(select) {
  if (!select) return;
  const entry = customSelectRegistry[select.id];
  if (entry) entry.syncLabel();
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
    id: "telegram",
    label: "Telegram",
    bg: "#26a5e4",
    icon: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M21.9 3.5L2.6 11c-1 .4-1 1.7.1 2l4.7 1.5 1.8 5.7c.2.7 1.1.9 1.6.3l2.6-2.9 4.8 3.6c.7.5 1.7.1 1.9-.8l3-16.1c.2-1-.8-1.7-1.6-1.3zM8.6 14l9.6-6.7L9.9 15.8l-.3 3-1-4.8z"/></svg>`,
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
  {
    id: "linkedin",
    label: "LinkedIn",
    bg: "#0a66c2",
    icon: `<span style="font-family:'Poppins',sans-serif;font-weight:800;font-size:15px;color:#fff;">in</span>`,
  },
  {
    id: "tumblr",
    label: "Tumblr",
    bg: "#36465d",
    icon: `<span style="font-family:'Poppins',sans-serif;font-weight:800;font-size:19px;color:#fff;">t</span>`,
  },
  {
    id: "email",
    label: "Email",
    bg: "#6b8299",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`,
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
    case "linkedin":
      window.open("https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url), "_blank", "noopener");
      break;
    case "tumblr":
      window.open(
        "https://www.tumblr.com/widgets/share/tool?canonicalUrl=" + encodeURIComponent(url) + "&title=" + encodeURIComponent(title) + "&caption=" + encodeURIComponent(text),
        "_blank",
        "noopener"
      );
      break;
    default:
      // Fallback kalau ada app tanpa URL share resmi di web — link
      // disalin supaya bisa ditempel manual di aplikasinya.
      shareCopyToClipboard(url).then((ok) => {
        shareShowToast(ok ? `Link disalin — tempel di ${SHARE_APPS.find((a) => a.id === appId).label}` : "Gagal menyalin link");
      });
      break;
  }
}

/** Modal konfirmasi umum untuk halaman publik (mis. sebelum kirim Laporkan
 * Masalah / Request Game). `onConfirm` dipanggil kalau user menekan tombol OK. */
function openConfirmDialog(message, onConfirm, opts) {
  opts = opts || {};
  const backdrop = document.createElement("div");
  backdrop.className = "confirm-dialog-backdrop";
  backdrop.innerHTML = `
    <div class="confirm-dialog-box">
      <div class="confirm-dialog-title">${escapeHtml(opts.title || "Konfirmasi")}</div>
      <div class="confirm-dialog-message">${escapeHtml(message)}</div>
      <div class="confirm-dialog-actions">
        <button type="button" class="confirm-dialog-cancel">${escapeHtml(opts.cancelLabel || "Batal")}</button>
        <button type="button" class="confirm-dialog-ok">${escapeHtml(opts.confirmLabel || "Kirim")}</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  function close() {
    backdrop.remove();
  }
  backdrop.querySelector(".confirm-dialog-cancel").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector(".confirm-dialog-ok").addEventListener("click", () => {
    close();
    if (onConfirm) onConfirm();
  });
}

function openShareModal(post) {
  const url = window.location.href;
  const title = post.title;
  const text = `${title} — Fueeru Game`;
  const platform = post.platform || [];
  const metaText = [platform.join(", "), post.bahasa, post.jenis].filter(Boolean).join(" • ");

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
document.addEventListener("DOMContentLoaded", applySiteSettings);

/* =========================================================
   Terapkan Pengaturan Website (Admin Panel > Pengaturan) ke halaman publik:
   font, warna aksen, teks pengumuman, teks sidebar, teks footer + link
   sosial media. Dipanggil sekali di setiap halaman publik saat dimuat.
   ========================================================= */
async function applySiteSettings() {
  const settings = await getSettings();

  // ---- Font & warna ----
  applySiteFont(settings.site_font || "qanelas");
  if (settings.site_color) applySiteColor(settings.site_color);

  // ---- Mode tampilan default ----
  // Kalau pengunjung belum pernah memilih mode sendiri (localStorage kosong)
  // dan admin sudah atur default-nya, ikuti itu. Nilainya juga di-cache
  // supaya kunjungan berikutnya langsung tepat sejak baris pertama (lihat
  // script kecil inline di <head> tiap halaman).
  try {
    if (settings.theme_default) {
      localStorage.setItem("fueeru_theme_default_cache", settings.theme_default);
      if (!localStorage.getItem("fueeru_theme")) {
        const shouldBeDark = settings.theme_default !== "light";
        document.documentElement.classList.toggle("dark", shouldBeDark);
      }
    }
  } catch (e) {}

  // ---- Tampilan daftar postingan default (List/Grid) ----
  // Sama seperti mode tampilan: dicache untuk dipakai daftar postingan
  // saat visitor belum pernah memilih tampilan sendiri.
  try {
    if (settings.postview_default) {
      localStorage.setItem("fueeru_postview_default_cache", settings.postview_default);
    }
  } catch (e) {}

  // ---- Teks Pengumuman ----
  const bar = document.getElementById("announcementBar");
  if (bar) {
    if (settings.text_announcement_active === "1" && settings.text_announcement) {
      const track = document.getElementById("announcementBarTrack");
      const t1 = document.getElementById("announcementBarText1");
      const t2 = document.getElementById("announcementBarText2");
      t1.textContent = settings.text_announcement;
      t2.textContent = settings.text_announcement;
      if (settings.text_announcement_link) {
        track.href = settings.text_announcement_link;
        track.classList.remove("no-link");
      } else {
        track.removeAttribute("href");
        track.classList.add("no-link");
        track.addEventListener("click", (e) => e.preventDefault());
      }
      bar.hidden = false;
    } else {
      bar.hidden = true;
    }
  }

  // ---- Teks Sidebar (copyright) ----
  const sidebarFoot = document.getElementById("sidebarFootText");
  if (sidebarFoot && settings.text_sidebar_copyright) {
    sidebarFoot.textContent = settings.text_sidebar_copyright;
  }

  // ---- Teks Footer + link sosial media ----
  const footTagline = document.getElementById("footTaglineText");
  if (footTagline && settings.text_footer) {
    footTagline.textContent = settings.text_footer;
  }
  const footSocial = document.getElementById("footSocialLinks");
  if (footSocial && settings.text_footer_social_links) {
    try {
      const links = JSON.parse(settings.text_footer_social_links);
      if (Array.isArray(links) && links.length) {
        footSocial.innerHTML = links
          .map((l) => {
            const url = typeof l === "string" ? l : l.url;
            if (!url) return "";
            const meta = detectSocialPlatform(url);
            return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="foot-social-icon" style="background:${meta.color};" title="${meta.label}" aria-label="${meta.label}">${meta.svg}</a>`;
          })
          .join("");
      }
    } catch (e) {}
  }
}

/** Deteksi platform sosial media dari domain URL, dipakai untuk menampilkan
 * icon otomatis di footer (Pengaturan > Pengaturan Teks > Teks Footer). */
function detectSocialPlatform(url) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch (e) {
    host = url.toLowerCase();
  }
  const ICON_GENERIC = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.07 0l2.83-2.83a5 5 0 00-7.07-7.07L11.5 4.5"/><path d="M14 11a5 5 0 00-7.07 0L4.1 13.83a5 5 0 007.07 7.07l1.36-1.36"/></svg>`;
  const PLATFORMS = [
    { match: "facebook.com", label: "Facebook", color: "#1877f2", svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0022 12z"/></svg>` },
    { match: "instagram.com", label: "Instagram", color: "linear-gradient(135deg,#f58529,#dd2a7b,#8134af,#515bd4)", svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none"/></svg>` },
    { match: "x.com", label: "X", color: "#000", svg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M18.9 3H21l-6.55 7.49L22.2 21h-6.4l-5-6.55L4.9 21H2.8l7-8.01L1.8 3h6.56l4.53 5.99L18.9 3zm-1.12 16.17h1.15L7.28 4.75H6.05l11.73 14.42z"/></svg>` },
    { match: "twitter.com", label: "Twitter", color: "#1da1f2", svg: `<svg viewBox="0 0 24 24" width="19" height="19" fill="#fff"><path d="M22 5.9c-.7.3-1.5.5-2.3.6.8-.5 1.5-1.3 1.8-2.3-.8.5-1.6.8-2.6 1a4 4 0 00-6.9 3.7A11.5 11.5 0 013 4.9a4 4 0 001.3 5.4c-.7 0-1.3-.2-1.9-.5v.1a4 4 0 003.2 4 4 4 0 01-1.8.1 4 4 0 003.8 2.8A8.1 8.1 0 012 18.4a11.5 11.5 0 006.3 1.8c7.5 0 11.6-6.2 11.6-11.6v-.5c.8-.6 1.5-1.3 2.1-2.2z"/></svg>` },
    { match: ["whatsapp.com", "wa.me"], label: "WhatsApp", color: "#25d366", svg: `<svg viewBox="0 0 24 24" width="19" height="19" fill="#fff"><path d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm0 18a8 8 0 01-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1112 20zm4.4-5.9c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.6.1-.1.2-.6.8-.8 1-.1.1-.3.2-.5.1a6.5 6.5 0 01-3.3-2.9c-.2-.4.2-.4.6-1.2.1-.1 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3 1 2.5c.1.1 1.7 2.6 4.1 3.6.6.2 1 .4 1.4.5.6.2 1.1.1 1.5-.1.5-.1 1.4-.6 1.6-1.1.2-.5.2-.9.1-1z"/></svg>` },
    { match: ["telegram.org", "t.me"], label: "Telegram", color: "#26a5e4", svg: `<svg viewBox="0 0 24 24" width="19" height="19" fill="#fff"><path d="M21.9 3.5L2.7 11c-.9.4-.9 1.6.1 1.9l4.6 1.5 1.8 5.6c.2.7 1.1.9 1.6.3l2.5-2.7 4.7 3.5c.7.5 1.7.1 1.9-.7l3.3-15.1c.2-.9-.7-1.7-1.5-1.3zM9 14.5L18 8.2c.3-.2.6.2.3.4l-7.6 6.9-.3 3-1.4-3z"/></svg>` },
    { match: ["discord.com", "discord.gg"], label: "Discord", color: "#5865f2", svg: `<svg viewBox="0 0 24 24" width="19" height="19" fill="#fff"><path d="M20 5.5A17 17 0 0015.7 4l-.3.6a13 13 0 013.8 1.6A15 15 0 004.6 6.2 13 13 0 018.4 4.6L8 4a17 17 0 00-4.3 1.5C1.7 9 1.1 12.4 1.3 15.7A16 16 0 006.1 18l.8-1.2a10 10 0 01-1.6-.8l.4-.3a12 12 0 0012.6 0l.4.3c-.5.3-1 .6-1.6.8l.8 1.2a16 16 0 004.8-2.3c.4-4-.6-7.3-2.7-10.2zM8.7 13.9c-.8 0-1.4-.7-1.4-1.6s.6-1.6 1.4-1.6c.8 0 1.5.7 1.4 1.6 0 .9-.6 1.6-1.4 1.6zm6.6 0c-.8 0-1.4-.7-1.4-1.6s.6-1.6 1.4-1.6c.8 0 1.4.7 1.4 1.6 0 .9-.6 1.6-1.4 1.6z"/></svg>` },
    { match: "youtube.com", label: "YouTube", color: "#ff0000", svg: `<svg viewBox="0 0 24 24" width="19" height="19" fill="#fff"><path d="M23 12s0-3.6-.5-5.3c-.2-1-1-1.7-2-1.9C18.7 4.3 12 4.3 12 4.3s-6.7 0-8.5.5c-1 .2-1.8.9-2 1.9C1 8.4 1 12 1 12s0 3.6.5 5.3c.2 1 1 1.7 2 1.9 1.8.5 8.5.5 8.5.5s6.7 0 8.5-.5c1-.2 1.8-.9 2-1.9.5-1.7.5-5.3.5-5.3zM9.8 15.5v-7l6 3.5-6 3.5z"/></svg>` },
    { match: "tiktok.com", label: "TikTok", color: "#000", svg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M16.6 5.8a4.3 4.3 0 01-3-3.8h-3v13.7a2.6 2.6 0 11-1.8-2.5v-3.1a5.7 5.7 0 105 5.6V9.4a7.3 7.3 0 004.3 1.4V7.7a4.3 4.3 0 01-1.5-1.9z"/></svg>` },
    { match: "github.com", label: "GitHub", color: "#181717", svg: `<svg viewBox="0 0 24 24" width="19" height="19" fill="#fff"><path d="M12 2a10 10 0 00-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1-1.5-1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-4.9 0-1.1.4-2 1-2.6-.1-.3-.5-1.4.1-2.8 0 0 .8-.3 2.7 1a9.4 9.4 0 015 0c1.9-1.3 2.7-1 2.7-1 .6 1.4.2 2.5.1 2.8.6.6 1 1.5 1 2.6 0 3.8-2.4 4.6-4.6 4.9.4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0012 2z"/></svg>` }
  ];
  for (const p of PLATFORMS) {
    const matches = Array.isArray(p.match) ? p.match : [p.match];
    if (matches.some((m) => host === m || host.endsWith("." + m))) {
      return { label: p.label, color: p.color, svg: p.svg };
    }
  }
  return { label: "Link", color: "var(--sky-500)", svg: ICON_GENERIC };
}

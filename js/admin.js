/* =========================================================
   Fueeru Game — Admin Panel logic
   Kata sandi (sementara): admin123
   ========================================================= */

const ADMIN_PASSWORD = "admin123";
const SESSION_KEY = "fueeru_admin_session";
const PAGE_SIZE = 10;

let editingId = null; // null = mode tambah, string = mode edit
let currentGenres = []; // genre yang sedang dipilih di form

// ---------- Top-level views ----------
const viewLogin = document.getElementById("viewLogin");
const adminShell = document.getElementById("adminShell");

function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

function doLogin() {
  sessionStorage.setItem(SESSION_KEY, "1");
  viewLogin.classList.add("hidden");
  adminShell.classList.remove("hidden");
  showSub("viewMenu");
}

function doLogout() {
  sessionStorage.removeItem(SESSION_KEY);
  document.getElementById("passwordInput").value = "";
  document.getElementById("loginError").textContent = "";
  adminShell.classList.add("hidden");
  viewLogin.classList.remove("hidden");
}

document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const val = document.getElementById("passwordInput").value;
  const errorEl = document.getElementById("loginError");
  if (val === ADMIN_PASSWORD) {
    errorEl.textContent = "";
    doLogin();
  } else {
    errorEl.textContent = "Kata sandi salah. Coba lagi.";
  }
});

document.getElementById("btnLogout").addEventListener("click", doLogout);

// ---------- Sub-view switching within adminShell ----------
const SUB_VIEWS = ["viewMenu", "viewPosts", "viewForm", "viewReports", "viewFiles", "viewFileEdit"];
function showSub(id) {
  SUB_VIEWS.forEach((v) => document.getElementById(v).classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

document.getElementById("menuAturPostingan").addEventListener("click", () => {
  postSearchQuery = "";
  document.getElementById("postSearchInput").value = "";
  postsPage = 1;
  showSub("viewPosts");
  renderPostsList();
});
document.getElementById("menuLihatLaporan").addEventListener("click", () => {
  reportSearchQuery = "";
  document.getElementById("reportSearchInput").value = "";
  reportsPage = 1;
  showSub("viewReports");
  renderReportsList();
});
document.getElementById("menuManajemenFile").addEventListener("click", () => {
  navigateToFolder("");
  showSub("viewFiles");
});
document.getElementById("btnBackFromPosts").addEventListener("click", () => showSub("viewMenu"));
document.getElementById("btnBackFromReports").addEventListener("click", () => showSub("viewMenu"));
document.getElementById("btnBackFromForm").addEventListener("click", () => {
  showSub("viewPosts");
  renderPostsList();
});
document.getElementById("btnBackFromFiles").addEventListener("click", () => {
  if (currentFolderPath === "") {
    showSub("viewMenu");
  } else {
    navigateToFolder(parentOf(currentFolderPath));
  }
});
document.getElementById("btnBackFromFileEdit").addEventListener("click", () => {
  showSub("viewFiles");
  renderFilesView();
});

function escapeHtmlAdmin(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

// =========================================================
// Modal konfirmasi generik (pengganti confirm() bawaan browser)
// =========================================================
const confirmModalBackdrop = document.getElementById("confirmModalBackdrop");
const confirmModalTitle = document.getElementById("confirmModalTitle");
const confirmModalMessage = document.getElementById("confirmModalMessage");
const btnConfirmModalCancel = document.getElementById("btnConfirmModalCancel");
const btnConfirmModalOk = document.getElementById("btnConfirmModalOk");
let confirmModalCallback = null;

function openConfirmModal(message, onConfirm, opts) {
  opts = opts || {};
  confirmModalTitle.textContent = opts.title || "Konfirmasi Hapus";
  confirmModalMessage.textContent = message;
  btnConfirmModalOk.textContent = opts.confirmLabel || "Hapus";
  confirmModalCallback = onConfirm;
  confirmModalBackdrop.classList.add("show");
}
function closeConfirmModal() {
  confirmModalBackdrop.classList.remove("show");
  confirmModalCallback = null;
}
btnConfirmModalCancel.addEventListener("click", closeConfirmModal);
confirmModalBackdrop.addEventListener("click", function (e) {
  if (e.target === confirmModalBackdrop) closeConfirmModal();
});
btnConfirmModalOk.addEventListener("click", function () {
  const cb = confirmModalCallback;
  closeConfirmModal();
  if (cb) cb();
});

// =========================================================
// ATUR POSTINGAN (list + search + pagination)
// =========================================================
let postSearchQuery = "";
let postsPage = 1;

document.getElementById("postSearchInput").addEventListener("input", function () {
  postSearchQuery = this.value.trim().toLowerCase();
  postsPage = 1;
  renderPostsList();
});

function renderPostsList() {
  let posts = loadPosts().slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  if (postSearchQuery) {
    posts = posts.filter((p) => p.title.toLowerCase().includes(postSearchQuery));
  }

  const list = document.getElementById("adminPostList");
  if (posts.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <h3>Tidak ada postingan</h3>
        <p>${postSearchQuery ? "Tidak ada postingan yang cocok dengan pencarian." : 'Klik "Tambahkan Postingan" untuk membuat postingan pertama.'}</p>
      </div>`;
    renderPagination("postsPagination", 0, PAGE_SIZE, 1, () => {});
    return;
  }

  const totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  if (postsPage > totalPages) postsPage = totalPages;
  const start = (postsPage - 1) * PAGE_SIZE;
  const pagePosts = posts.slice(start, start + PAGE_SIZE);

  list.innerHTML = pagePosts
    .map(
      (p) => `
    <div class="admin-post-item">
      <img src="${p.thumbnail}" alt="">
      <div class="api-body">
        <div class="api-title">${escapeHtmlAdmin(p.title)}</div>
        <div class="api-meta">${escapeHtmlAdmin(p.jenis)} • ${escapeHtmlAdmin(formatDate(p.date))}</div>
      </div>
      <div class="api-actions">
        <button type="button" class="btn-edit" data-id="${p.id}">Edit</button>
        <button type="button" class="btn-delete" data-id="${p.id}">Hapus</button>
      </div>
    </div>`
    )
    .join("");

  list.querySelectorAll(".btn-edit").forEach((btn) =>
    btn.addEventListener("click", () => openEditForm(btn.getAttribute("data-id")))
  );
  list.querySelectorAll(".btn-delete").forEach((btn) =>
    btn.addEventListener("click", () => deletePost(btn.getAttribute("data-id")))
  );

  renderPagination("postsPagination", posts.length, PAGE_SIZE, postsPage, (page) => {
    postsPage = page;
    renderPostsList();
  });
}

function deletePost(id) {
  const post = getPostById(id);
  if (!post) return;
  openConfirmModal(
    `Hapus postingan "${post.title}"? Tindakan ini tidak bisa dibatalkan.`,
    function () {
      const posts = loadPosts().filter((p) => p.id !== id);
      savePosts(posts);
      renderPostsList();
      showToast("Postingan dihapus");
    },
    { title: "Hapus Postingan" }
  );
}

// =========================================================
// FORM TAMBAH / EDIT POSTINGAN
// =========================================================
const fieldTitle = document.getElementById("fieldTitle");
const fieldImage = document.getElementById("fieldImage");
const fieldJenis = document.getElementById("fieldJenis");
const editorContent = document.getElementById("editorContent");
const uploadPreview = document.getElementById("uploadPreview");
const uploadLabel = document.getElementById("uploadLabel");
let currentThumbnailData = "";

function populateJenisSelect() {
  fieldJenis.innerHTML = JENIS_LIST.map((j) => `<option value="${j}">${j}</option>`).join("");
}

// ---------- Genre tag input ----------
const genreInputField = document.getElementById("genreInputField");
const genreSuggestions = document.getElementById("genreSuggestions");
const genreChipsHolder = document.getElementById("genreChipsHolder");

function renderGenreChips() {
  genreChipsHolder.innerHTML = currentGenres
    .map(
      (g, i) => `
      <span class="tag-chip">
        ${escapeHtmlAdmin(g)}
        <button type="button" data-idx="${i}" aria-label="Hapus genre ${escapeHtmlAdmin(g)}">×</button>
      </span>`
    )
    .join("");
  genreChipsHolder.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-idx"), 10);
      currentGenres.splice(idx, 1);
      renderGenreChips();
    });
  });
}

function addGenre(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const exists = currentGenres.some((g) => g.toLowerCase() === trimmed.toLowerCase());
  if (!exists) currentGenres.push(trimmed);
  genreInputField.value = "";
  hideGenreSuggestions();
  renderGenreChips();
}

function showGenreSuggestions() {
  const val = genreInputField.value.trim().toLowerCase();
  if (!val) {
    hideGenreSuggestions();
    return;
  }
  const allGenres = getAllGenres();
  const matches = allGenres.filter(
    (g) => g.toLowerCase().includes(val) && !currentGenres.some((cg) => cg.toLowerCase() === g.toLowerCase())
  );
  if (matches.length === 0) {
    hideGenreSuggestions();
    return;
  }
  genreSuggestions.innerHTML = matches
    .slice(0, 8)
    .map((g) => `<button type="button" data-genre="${escapeHtmlAdmin(g)}">${escapeHtmlAdmin(g)}</button>`)
    .join("");
  genreSuggestions.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault(); // supaya tidak kehilangan fokus sebelum click terproses
      addGenre(btn.getAttribute("data-genre"));
    });
  });
  genreSuggestions.classList.add("show");
}
function hideGenreSuggestions() {
  genreSuggestions.classList.remove("show");
  genreSuggestions.innerHTML = "";
}

genreInputField.addEventListener("input", showGenreSuggestions);
genreInputField.addEventListener("focus", showGenreSuggestions);
genreInputField.addEventListener("blur", () => setTimeout(hideGenreSuggestions, 120));
genreInputField.addEventListener("keydown", function (e) {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addGenre(genreInputField.value);
  } else if (e.key === "Backspace" && genreInputField.value === "" && currentGenres.length) {
    currentGenres.pop();
    renderGenreChips();
  }
});

// ---------- Form reset / open ----------
function resetForm() {
  editingId = null;
  fieldTitle.value = "";
  fieldImage.value = "";
  currentThumbnailData = "";
  uploadPreview.style.display = "none";
  uploadPreview.src = "";
  uploadLabel.textContent = "Klik untuk upload gambar header";
  populateJenisSelect();
  fieldJenis.value = JENIS_LIST[0];
  currentGenres = [];
  renderGenreChips();
  genreInputField.value = "";
  editorContent.innerHTML = "";
  document.getElementById("formHeading").textContent = "Tambah Postingan";
}

function openAddForm() {
  resetForm();
  showSub("viewForm");
  fieldTitle.focus();
}

function openEditForm(id) {
  const post = getPostById(id);
  if (!post) return;
  resetForm();
  editingId = id;
  document.getElementById("formHeading").textContent = "Edit Postingan";
  fieldTitle.value = post.title;
  populateJenisSelect();
  fieldJenis.value = post.jenis;
  currentGenres = (post.genres || []).slice();
  renderGenreChips();
  editorContent.innerHTML = post.content;
  currentThumbnailData = post.thumbnail;
  uploadPreview.src = post.thumbnail;
  uploadPreview.style.display = "block";
  uploadLabel.textContent = "Klik untuk mengganti gambar header";
  showSub("viewForm");
}

document.getElementById("btnAddPost").addEventListener("click", openAddForm);
document.getElementById("btnCancelForm").addEventListener("click", () => {
  showSub("viewPosts");
  renderPostsList();
});

// Upload gambar header -> dataURL
fieldImage.addEventListener("change", function () {
  const file = fieldImage.files && fieldImage.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    currentThumbnailData = e.target.result;
    uploadPreview.src = currentThumbnailData;
    uploadPreview.style.display = "block";
    uploadLabel.textContent = "Klik untuk mengganti gambar header";
  };
  reader.readAsDataURL(file);
});

// ---------- Rich text toolbar ----------
document.getElementById("editorToolbar").addEventListener("click", function (e) {
  const btn = e.target.closest("button[data-cmd]");
  if (!btn) return;
  editorContent.focus();
  document.execCommand(btn.getAttribute("data-cmd"), false, null);
});

document.getElementById("btnInsertImage").addEventListener("click", function () {
  document.getElementById("contentImageInput").click();
});

document.getElementById("contentImageInput").addEventListener("change", function (e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    editorContent.focus();
    document.execCommand("insertImage", false, ev.target.result);
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

// ---------- Sisipkan Link (modal 2 field) ----------
const linkModalBackdrop = document.getElementById("linkModalBackdrop");
const linkUrlInput = document.getElementById("linkUrlInput");
const linkTextInput = document.getElementById("linkTextInput");
let savedSelectionRange = null;

function saveSelection() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    savedSelectionRange = sel.getRangeAt(0).cloneRange();
  }
}
function restoreSelection() {
  if (!savedSelectionRange) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedSelectionRange);
}

document.getElementById("btnInsertLink").addEventListener("click", function () {
  saveSelection();
  linkUrlInput.value = "";
  linkTextInput.value = "";
  linkModalBackdrop.classList.add("show");
  setTimeout(() => linkUrlInput.focus(), 100);
});

document.getElementById("btnCancelLink").addEventListener("click", function () {
  linkModalBackdrop.classList.remove("show");
});
linkModalBackdrop.addEventListener("click", function (e) {
  if (e.target === linkModalBackdrop) linkModalBackdrop.classList.remove("show");
});

document.getElementById("btnConfirmLink").addEventListener("click", function () {
  const url = linkUrlInput.value.trim();
  if (!url) {
    linkUrlInput.focus();
    return;
  }
  const text = linkTextInput.value.trim() || url;
  editorContent.focus();
  restoreSelection();
  const safeUrl = escapeHtmlAdmin(url);
  const safeText = escapeHtmlAdmin(text);
  document.execCommand(
    "insertHTML",
    false,
    `<a href="${safeUrl}" target="_blank" rel="noopener" style="color:#2fa8e0;text-decoration:underline;">${safeText}</a>&nbsp;`
  );
  linkModalBackdrop.classList.remove("show");
});

// ---------- Publish (save) ----------
document.getElementById("postForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const title = fieldTitle.value.trim();
  if (!title) {
    fieldTitle.focus();
    return;
  }
  const content = editorContent.innerHTML.trim();
  const jenis = fieldJenis.value;
  const genres = currentGenres.slice();
  const posts = loadPosts();

  if (editingId) {
    const idx = posts.findIndex((p) => p.id === editingId);
    if (idx !== -1) {
      posts[idx] = {
        ...posts[idx],
        title,
        jenis,
        genres,
        content,
        thumbnail: currentThumbnailData || posts[idx].thumbnail
      };
    }
  } else {
    const newPost = {
      id: "post-" + Date.now(),
      title,
      jenis,
      genres,
      date: new Date().toISOString().slice(0, 10),
      thumbnail: currentThumbnailData || "postheader/post001.png",
      content
    };
    posts.unshift(newPost);
  }

  savePosts(posts);
  showSub("viewPosts");
  renderPostsList();
  showToast(editingId ? "Postingan diperbarui" : "Postingan dipublikasikan");
});

// =========================================================
// LIHAT LAPORAN (list + search + hapus semua + pagination)
// =========================================================
let reportSearchQuery = "";
let reportsPage = 1;

document.getElementById("reportSearchInput").addEventListener("input", function () {
  reportSearchQuery = this.value.trim().toLowerCase();
  reportsPage = 1;
  renderReportsList();
});

function formatReportDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) +
      ", " + d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return iso;
  }
}

function renderReportsList() {
  let reports = loadReports();
  if (reportSearchQuery) {
    reports = reports.filter(
      (r) =>
        r.title.toLowerCase().includes(reportSearchQuery) ||
        (r.name || "").toLowerCase().includes(reportSearchQuery) ||
        r.content.toLowerCase().includes(reportSearchQuery)
    );
  }

  const list = document.getElementById("adminReportList");
  if (reports.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <h3>Tidak ada laporan</h3>
        <p>${reportSearchQuery ? "Tidak ada laporan yang cocok dengan pencarian." : "Belum ada laporan yang masuk."}</p>
      </div>`;
    renderPagination("reportsPagination", 0, PAGE_SIZE, 1, () => {});
    return;
  }

  const totalPages = Math.max(1, Math.ceil(reports.length / PAGE_SIZE));
  if (reportsPage > totalPages) reportsPage = totalPages;
  const start = (reportsPage - 1) * PAGE_SIZE;
  const pageReports = reports.slice(start, start + PAGE_SIZE);

  list.innerHTML = pageReports
    .map(
      (r) => `
    <div class="admin-post-item">
      <div class="api-body">
        <div class="api-title">${escapeHtmlAdmin(r.title)}</div>
        <div class="api-meta">${escapeHtmlAdmin(formatReportDate(r.date))}</div>
      </div>
      <div class="api-actions">
        <button type="button" class="btn-edit" data-id="${r.id}">Lihat</button>
        <button type="button" class="btn-delete" data-id="${r.id}">Hapus</button>
      </div>
    </div>`
    )
    .join("");

  list.querySelectorAll(".btn-edit").forEach((btn) =>
    btn.addEventListener("click", () => openViewReportModal(btn.getAttribute("data-id")))
  );
  list.querySelectorAll(".btn-delete").forEach((btn) =>
    btn.addEventListener("click", () => deleteReport(btn.getAttribute("data-id")))
  );

  renderPagination("reportsPagination", reports.length, PAGE_SIZE, reportsPage, (page) => {
    reportsPage = page;
    renderReportsList();
  });
}

// ---------- Modal: Lihat detail laporan ----------
const viewReportModalBackdrop = document.getElementById("viewReportModalBackdrop");
const viewReportModalBody = document.getElementById("viewReportModalBody");

function openViewReportModal(id) {
  const reports = loadReports();
  const r = reports.find((rep) => rep.id === id);
  if (!r) return;

  function row(label, value, isEmpty) {
    return `
      <div class="vrb-row">
        <div class="vrb-label">${escapeHtmlAdmin(label)}</div>
        <div class="vrb-value${isEmpty ? " empty" : ""}">${isEmpty ? value : escapeHtmlAdmin(value)}</div>
      </div>`;
  }

  let html = "";
  html += row("Judul Laporan", r.title, false);
  html += row("Nama", r.name || "Anonim", !r.name);
  html += row("Media Balasan", r.contactMedia || "Tidak diisi", !r.contactMedia);
  html += row("Isi Laporan", r.content, false);
  if (r.attachment) {
    html += `
      <div class="vrb-row">
        <div class="vrb-label">Lampiran</div>
        <div class="vrb-value">
          <a class="rep-attachment" href="${r.attachment.dataUrl}" download="${escapeHtmlAdmin(r.attachment.name)}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            ${escapeHtmlAdmin(r.attachment.name)}
          </a>
        </div>
      </div>`;
  }
  html += row("Tanggal", formatReportDate(r.date), false);

  viewReportModalBody.innerHTML = html;
  viewReportModalBackdrop.classList.add("show");
}

document.getElementById("btnCloseViewReport").addEventListener("click", function () {
  viewReportModalBackdrop.classList.remove("show");
});
viewReportModalBackdrop.addEventListener("click", function (e) {
  if (e.target === viewReportModalBackdrop) viewReportModalBackdrop.classList.remove("show");
});

function deleteReport(id) {
  openConfirmModal(
    "Hapus laporan ini? Tindakan ini tidak bisa dibatalkan.",
    function () {
      const reports = loadReports().filter((r) => r.id !== id);
      saveReports(reports);
      renderReportsList();
      showToast("Laporan dihapus");
    },
    { title: "Hapus Laporan" }
  );
}

document.getElementById("btnDeleteAllReports").addEventListener("click", function () {
  if (loadReports().length === 0) return;
  openConfirmModal(
    "Yakin ingin hapus semua laporan?",
    function () {
      saveReports([]);
      reportsPage = 1;
      renderReportsList();
      showToast("Semua laporan dihapus");
    },
    { title: "Hapus Semua Laporan" }
  );
});

// =========================================================
// MANAJEMEN FILE (virtual file manager, lihat js/vfs.js)
// =========================================================
const GRID_PAGE_SIZE = 15; // folder & gambar
const FILE_PAGE_SIZE = 10; // file teks/lainnya

let currentFolderPath = "";
let fileSearchQuery = "";
let fileSortOrder = "asc";
let vfsGridPage = 1;
let vfsFilePage = 1;
let currentEditingFilePath = null;
let currentPreviewImagePath = null;

function navigateToFolder(path) {
  currentFolderPath = path;
  fileSearchQuery = "";
  document.getElementById("fileSearchInput").value = "";
  vfsGridPage = 1;
  vfsFilePage = 1;
  renderFilesView();
}

function fileIconSvg() {
  return `<svg class="vfs-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
}
function folderIconSvg() {
  return `<svg class="vfs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>`;
}

function renderFilesView() {
  document.getElementById("filesHeading").textContent =
    currentFolderPath === "" ? "Manajemen File" : nameOf(currentFolderPath);

  const { folders, files } = vfsList(currentFolderPath);
  const q = fileSearchQuery.toLowerCase();
  const matchQ = (n) => !q || n.name.toLowerCase().includes(q);

  const imageFiles = files.filter((f) => f.isImage && matchQ(f));
  const otherFiles = files.filter((f) => !f.isImage && matchQ(f));
  const matchedFolders = folders.filter(matchQ);

  const dir = fileSortOrder === "desc" ? -1 : 1;
  const byName = (a, b) => a.name.localeCompare(b.name, "id") * dir;

  const gridItems = matchedFolders.slice().sort(byName).concat(imageFiles.slice().sort(byName));
  const listItems = otherFiles.slice().sort(byName);

  // ---- Grid: folder + gambar (15/halaman) ----
  const gridTotalPages = Math.max(1, Math.ceil(gridItems.length / GRID_PAGE_SIZE));
  if (vfsGridPage > gridTotalPages) vfsGridPage = gridTotalPages;
  const gridStart = (vfsGridPage - 1) * GRID_PAGE_SIZE;
  const gridPageItems = gridItems.slice(gridStart, gridStart + GRID_PAGE_SIZE);

  const gridEl = document.getElementById("vfsGrid");
  if (gridItems.length === 0) {
    gridEl.innerHTML = "";
  } else {
    gridEl.innerHTML = gridPageItems
      .map((node) => {
        if (node.type === "folder") {
          return `
            <div class="vfs-item">
              <button type="button" class="vfs-item-open" data-open-folder="${escapeHtmlAdmin(node.path)}">
                ${folderIconSvg()}
                <span class="vfs-name">${escapeHtmlAdmin(node.name)}</span>
              </button>
              <button type="button" class="vfs-item-menu-btn" data-menu-node="${escapeHtmlAdmin(node.path)}" aria-label="Menu ${escapeHtmlAdmin(node.name)}">⋮</button>
            </div>`;
        }
        const src = vfsImageSrc(node);
        return `
          <div class="vfs-item">
            <button type="button" class="vfs-item-open" data-open-image="${escapeHtmlAdmin(node.path)}">
              <img class="vfs-thumb" src="${src}" alt="${escapeHtmlAdmin(node.name)}" loading="lazy">
              <span class="vfs-name">${escapeHtmlAdmin(node.name)}</span>
            </button>
            <button type="button" class="vfs-item-menu-btn" data-menu-node="${escapeHtmlAdmin(node.path)}" aria-label="Menu ${escapeHtmlAdmin(node.name)}">⋮</button>
          </div>`;
      })
      .join("");
  }
  renderPagination("vfsGridPagination", gridItems.length, GRID_PAGE_SIZE, vfsGridPage, (page) => {
    vfsGridPage = page;
    renderFilesView();
  });

  // ---- List: file lainnya (10/halaman) ----
  const fileTotalPages = Math.max(1, Math.ceil(listItems.length / FILE_PAGE_SIZE));
  if (vfsFilePage > fileTotalPages) vfsFilePage = fileTotalPages;
  const fileStart = (vfsFilePage - 1) * FILE_PAGE_SIZE;
  const filePageItems = listItems.slice(fileStart, fileStart + FILE_PAGE_SIZE);

  const listEl = document.getElementById("vfsFileList");
  if (gridItems.length === 0 && listItems.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <h3>Tidak ada apa-apa di sini</h3>
        <p>${fileSearchQuery ? "Tidak ada folder/file yang cocok dengan pencarian." : "Folder ini masih kosong."}</p>
      </div>`;
  } else if (listItems.length === 0) {
    listEl.innerHTML = "";
  } else {
    listEl.innerHTML = filePageItems
      .map(
        (node) => `
      <div class="vfs-file-row">
        <button type="button" class="vfs-file-open" data-open-file="${escapeHtmlAdmin(node.path)}">
          ${fileIconSvg()}
          <span class="vfs-file-name">${escapeHtmlAdmin(node.name)}</span>
        </button>
        <button type="button" class="vfs-file-menu-btn" data-menu-node="${escapeHtmlAdmin(node.path)}" aria-label="Menu ${escapeHtmlAdmin(node.name)}">⋮</button>
      </div>`
      )
      .join("");
  }
  renderPagination("vfsFilePagination", listItems.length, FILE_PAGE_SIZE, vfsFilePage, (page) => {
    vfsFilePage = page;
    renderFilesView();
  });

  // ---- Bind events ----
  document.querySelectorAll("[data-open-folder]").forEach((btn) =>
    btn.addEventListener("click", () => navigateToFolder(btn.getAttribute("data-open-folder")))
  );
  document.querySelectorAll("[data-open-image]").forEach((btn) =>
    btn.addEventListener("click", () => openImagePreview(btn.getAttribute("data-open-image")))
  );
  document.querySelectorAll("[data-open-file]").forEach((btn) =>
    btn.addEventListener("click", () => openFileEdit(btn.getAttribute("data-open-file")))
  );
  document.querySelectorAll("[data-menu-node]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openVfsContextMenu(btn.getAttribute("data-menu-node"), btn);
    })
  );
}

function deleteVfsNode(path) {
  const node = vfsGetNode(path);
  if (!node) return;
  const isFolder = node.type === "folder";
  openConfirmModal(
    isFolder
      ? `Hapus folder "${node.name}" beserta seluruh isinya? Tindakan ini tidak bisa dibatalkan.`
      : `Hapus file "${node.name}"? Tindakan ini tidak bisa dibatalkan.`,
    function () {
      vfsDeleteNode(path);
      renderFilesView();
      showToast(isFolder ? "Folder dihapus" : "File dihapus");
    },
    { title: isFolder ? "Hapus Folder" : "Hapus File" }
  );
}

document.getElementById("fileSearchInput").addEventListener("input", function () {
  fileSearchQuery = this.value.trim();
  vfsGridPage = 1;
  vfsFilePage = 1;
  renderFilesView();
});

document.getElementById("fileSortSelect").addEventListener("change", function () {
  fileSortOrder = this.value;
  renderFilesView();
});

// ---------- Dropdown "Tambahkan" ----------
const addDropdownMenu = document.getElementById("addDropdownMenu");
document.getElementById("btnAddDropdownToggle").addEventListener("click", function (e) {
  e.stopPropagation();
  addDropdownMenu.classList.toggle("show");
});
document.addEventListener("click", function () {
  addDropdownMenu.classList.remove("show");
});

// ---------- Modal: Tambahkan Folder ----------
const addFolderModalBackdrop = document.getElementById("addFolderModalBackdrop");
const newFolderNameInput = document.getElementById("newFolderNameInput");

document.getElementById("btnOpenAddFolderModal").addEventListener("click", function () {
  addDropdownMenu.classList.remove("show");
  newFolderNameInput.value = "";
  addFolderModalBackdrop.classList.add("show");
  setTimeout(() => newFolderNameInput.focus(), 100);
});
document.getElementById("btnCancelAddFolder").addEventListener("click", () => {
  addFolderModalBackdrop.classList.remove("show");
});
addFolderModalBackdrop.addEventListener("click", (e) => {
  if (e.target === addFolderModalBackdrop) addFolderModalBackdrop.classList.remove("show");
});
document.getElementById("btnConfirmAddFolder").addEventListener("click", function () {
  const name = newFolderNameInput.value.trim();
  if (!name) {
    newFolderNameInput.focus();
    return;
  }
  if (vfsNodeExists(currentFolderPath, name)) {
    showToast("Sudah ada folder/file dengan nama itu");
    return;
  }
  vfsAddFolder(currentFolderPath, name);
  addFolderModalBackdrop.classList.remove("show");
  renderFilesView();
  showToast("Folder ditambahkan");
});

// ---------- Modal: Tambahkan File ----------
const addFileModalBackdrop = document.getElementById("addFileModalBackdrop");
const newFileNameInput = document.getElementById("newFileNameInput");
const uploadFileInput = document.getElementById("uploadFileInput");
const uploadFileLabel = document.getElementById("uploadFileLabel");
let pendingUploadFile = null;

document.getElementById("btnOpenAddFileModal").addEventListener("click", function () {
  addDropdownMenu.classList.remove("show");
  newFileNameInput.value = "";
  uploadFileInput.value = "";
  uploadFileLabel.textContent = "Klik untuk pilih file";
  pendingUploadFile = null;
  addFileModalBackdrop.classList.add("show");
  setTimeout(() => newFileNameInput.focus(), 100);
});
document.getElementById("btnCancelAddFile").addEventListener("click", () => {
  addFileModalBackdrop.classList.remove("show");
});
addFileModalBackdrop.addEventListener("click", (e) => {
  if (e.target === addFileModalBackdrop) addFileModalBackdrop.classList.remove("show");
});

document.getElementById("btnConfirmAddFile").addEventListener("click", function () {
  const name = newFileNameInput.value.trim();
  if (!name) {
    newFileNameInput.focus();
    return;
  }
  if (vfsNodeExists(currentFolderPath, name)) {
    showToast("Sudah ada folder/file dengan nama itu");
    return;
  }
  vfsAddFile(currentFolderPath, name, { content: "" });
  addFileModalBackdrop.classList.remove("show");
  renderFilesView();
  showToast("File ditambahkan");
});

uploadFileInput.addEventListener("change", function () {
  const file = uploadFileInput.files && uploadFileInput.files[0];
  if (!file) return;
  pendingUploadFile = file;
  uploadFileLabel.textContent = file.name;
});

document.getElementById("btnConfirmUploadFile").addEventListener("click", function () {
  if (!pendingUploadFile) {
    showToast("Pilih file terlebih dahulu");
    return;
  }
  const file = pendingUploadFile;
  if (vfsNodeExists(currentFolderPath, file.name)) {
    showToast("Sudah ada folder/file dengan nama itu");
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    if (isImageName(file.name)) {
      vfsAddFile(currentFolderPath, file.name, { dataUrl: e.target.result });
    } else {
      vfsAddFile(currentFolderPath, file.name, { content: typeof e.target.result === "string" ? e.target.result : "" });
    }
    addFileModalBackdrop.classList.remove("show");
    renderFilesView();
    showToast("File berhasil diupload");
  };
  if (isImageName(file.name)) {
    reader.readAsDataURL(file);
  } else {
    reader.readAsText(file);
  }
});

// ---------- View: Edit File ----------
function openFileEdit(path) {
  const node = vfsGetNode(path);
  if (!node) return;
  currentEditingFilePath = path;
  document.getElementById("fileEditHeading").textContent = node.name;
  const textarea = document.getElementById("fileEditTextarea");
  const note = document.getElementById("fileEditNote");
  textarea.value = "";
  note.textContent = "";

  if (node.content != null) {
    textarea.value = node.content;
    showSub("viewFileEdit");
    return;
  }

  if (node.original) {
    // Coba muat isi asli file lewat fetch() — hanya berhasil jika situs
    // dibuka lewat server/http, tidak berhasil jika dibuka via file://
    note.textContent = "Memuat isi file…";
    showSub("viewFileEdit");
    fetch(node.path)
      .then((res) => {
        if (!res.ok) throw new Error("fetch gagal");
        return res.text();
      })
      .then((text) => {
        if (currentEditingFilePath !== path) return;
        textarea.value = text;
        note.textContent = "";
      })
      .catch(() => {
        if (currentEditingFilePath !== path) return;
        note.textContent =
          "Isi asli file ini tidak bisa dimuat di mode ini (perlu dibuka lewat server, bukan langsung dari file). Kamu tetap bisa menulis ulang isinya di bawah lalu Simpan.";
      });
  } else {
    showSub("viewFileEdit");
  }
}

document.getElementById("btnSaveFileEdit").addEventListener("click", function () {
  if (!currentEditingFilePath) return;
  const content = document.getElementById("fileEditTextarea").value;
  vfsUpdateFileContent(currentEditingFilePath, content);
  showToast("File disimpan");
  showSub("viewFiles");
  renderFilesView();
});

// ---------- Modal: Preview Gambar ----------
const imagePreviewModalBackdrop = document.getElementById("imagePreviewModalBackdrop");
const imagePreviewImg = document.getElementById("imagePreviewImg");
const imagePreviewName = document.getElementById("imagePreviewName");
const replaceImageInput = document.getElementById("replaceImageInput");

function openImagePreview(path) {
  const node = vfsGetNode(path);
  if (!node) return;
  currentPreviewImagePath = path;
  imagePreviewName.textContent = node.name;
  imagePreviewImg.src = vfsImageSrc(node);
  imagePreviewModalBackdrop.classList.add("show");
}
document.getElementById("btnClosePreview").addEventListener("click", () => {
  imagePreviewModalBackdrop.classList.remove("show");
});
imagePreviewModalBackdrop.addEventListener("click", (e) => {
  if (e.target === imagePreviewModalBackdrop) imagePreviewModalBackdrop.classList.remove("show");
});
document.getElementById("btnReplaceImage").addEventListener("click", () => {
  replaceImageInput.click();
});
replaceImageInput.addEventListener("change", function () {
  const file = replaceImageInput.files && replaceImageInput.files[0];
  if (!file || !currentPreviewImagePath) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    vfsReplaceImage(currentPreviewImagePath, e.target.result);
    imagePreviewImg.src = e.target.result;
    renderFilesView();
    showToast("Gambar diganti");
  };
  reader.readAsDataURL(file);
  replaceImageInput.value = "";
});
document.getElementById("btnDeleteImageFromPreview").addEventListener("click", () => {
  if (!currentPreviewImagePath) return;
  const path = currentPreviewImagePath;
  const node = vfsGetNode(path);
  if (!node) return;
  openConfirmModal(
    `Hapus file "${node.name}"? Tindakan ini tidak bisa dibatalkan.`,
    function () {
      vfsDeleteNode(path);
      imagePreviewModalBackdrop.classList.remove("show");
      renderFilesView();
      showToast("File dihapus");
    },
    { title: "Hapus File" }
  );
});

// =========================================================
// Menu titik-tiga (⋮): Ganti Nama, Detail, Download, Hapus
// =========================================================
const vfsContextMenu = document.getElementById("vfsContextMenu");
const vfsContextDownload = document.getElementById("vfsContextDownload");
let contextMenuTargetPath = null;

function openVfsContextMenu(path, triggerBtn) {
  const node = vfsGetNode(path);
  if (!node) return;
  contextMenuTargetPath = path;

  // Opsi Download hanya untuk file (bukan folder)
  vfsContextDownload.classList.toggle("hidden-action", node.type === "folder");

  const rect = triggerBtn.getBoundingClientRect();
  const menuWidth = 180;
  let left = rect.right - menuWidth;
  if (left < 8) left = 8;
  if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
  let top = rect.bottom + 6;
  vfsContextMenu.style.left = left + "px";
  vfsContextMenu.style.top = top + "px";
  vfsContextMenu.classList.add("show");

  // Jika menu akan terpotong di bawah layar, tampilkan di atas tombol
  requestAnimationFrame(() => {
    const menuRect = vfsContextMenu.getBoundingClientRect();
    if (menuRect.bottom > window.innerHeight - 8) {
      vfsContextMenu.style.top = rect.top - menuRect.height - 6 + "px";
    }
  });
}
function closeVfsContextMenu() {
  vfsContextMenu.classList.remove("show");
  contextMenuTargetPath = null;
}
document.addEventListener("click", function (e) {
  if (!vfsContextMenu.contains(e.target)) closeVfsContextMenu();
});
document.addEventListener("scroll", closeVfsContextMenu, true);

vfsContextMenu.addEventListener("click", function (e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn || !contextMenuTargetPath) return;
  const path = contextMenuTargetPath;
  const action = btn.getAttribute("data-action");
  closeVfsContextMenu();

  if (action === "rename") openRenameModal(path);
  else if (action === "detail") openDetailModal(path);
  else if (action === "download") downloadVfsNode(path);
  else if (action === "delete") deleteVfsNode(path);
});

// ---------- Ganti Nama ----------
const renameModalBackdrop = document.getElementById("renameModalBackdrop");
const renameInput = document.getElementById("renameInput");
let renamingPath = null;

function openRenameModal(path) {
  const node = vfsGetNode(path);
  if (!node) return;
  renamingPath = path;
  renameInput.value = node.name;
  renameModalBackdrop.classList.add("show");
  setTimeout(() => {
    renameInput.focus();
    renameInput.select();
  }, 100);
}
document.getElementById("btnCancelRename").addEventListener("click", () => {
  renameModalBackdrop.classList.remove("show");
});
renameModalBackdrop.addEventListener("click", (e) => {
  if (e.target === renameModalBackdrop) renameModalBackdrop.classList.remove("show");
});
document.getElementById("btnConfirmRename").addEventListener("click", async function () {
  if (!renamingPath) return;
  const newName = renameInput.value.trim();
  if (!newName) {
    renameInput.focus();
    return;
  }
  const node = vfsGetNode(renamingPath);
  if (!node) return;
  if (newName === node.name) {
    renameModalBackdrop.classList.remove("show");
    return;
  }
  const parent = parentOf(renamingPath);
  if (vfsNodeExists(parent, newName)) {
    showToast("Sudah ada folder/file dengan nama itu");
    return;
  }
  // Simpan dulu byte asli gambar (jika ada) supaya thumbnail tidak rusak
  await vfsTryPreserveImageBytes(renamingPath);
  vfsRenameNode(renamingPath, newName);
  renameModalBackdrop.classList.remove("show");
  renderFilesView();
  showToast("Nama berhasil diubah");
});

// ---------- Detail ----------
const detailModalBackdrop = document.getElementById("detailModalBackdrop");
const detailModalTitle = document.getElementById("detailModalTitle");
const detailModalBody = document.getElementById("detailModalBody");

function detailRow(label, value) {
  return `
    <div class="vrb-row">
      <div class="vrb-label">${escapeHtmlAdmin(label)}</div>
      <div class="vrb-value">${escapeHtmlAdmin(value)}</div>
    </div>`;
}

function openDetailModal(path) {
  const node = vfsGetNode(path);
  if (!node) return;

  if (node.type === "folder") {
    const stats = vfsFolderStats(path);
    detailModalTitle.textContent = "Detail Folder";
    detailModalBody.innerHTML =
      detailRow("Nama Folder", node.name) +
      detailRow("Jalur Folder", "/" + node.path) +
      detailRow(
        "Ukuran Folder",
        formatBytes(stats.totalSize) + (stats.hasUnknownSize ? " (sebagian file asli tidak diketahui ukurannya)" : "")
      ) +
      detailRow("Tanggal Ditambahkan", formatReportDate(node.dateAdded)) +
      detailRow("Isi Folder", `${stats.folderCount} folder, ${stats.fileCount} file`);
  } else {
    const size = vfsFileSizeBytes(node);
    detailModalTitle.textContent = "Detail File";
    detailModalBody.innerHTML =
      detailRow("Nama File", node.name) +
      detailRow("Jalur File", "/" + node.path) +
      detailRow("Ukuran File", size == null ? "Tidak diketahui (file asli di server)" : formatBytes(size)) +
      detailRow("Tanggal Ditambahkan", formatReportDate(node.dateAdded));
  }
  detailModalBackdrop.classList.add("show");
}
document.getElementById("btnCloseDetail").addEventListener("click", () => {
  detailModalBackdrop.classList.remove("show");
});
detailModalBackdrop.addEventListener("click", (e) => {
  if (e.target === detailModalBackdrop) detailModalBackdrop.classList.remove("show");
});

// ---------- Download ----------
function downloadVfsNode(path) {
  const node = vfsGetNode(path);
  if (!node || node.type !== "file") return;
  const a = document.createElement("a");
  a.download = node.name;
  if (node.dataUrl) {
    a.href = node.dataUrl;
  } else if (node.content != null) {
    a.href = URL.createObjectURL(new Blob([node.content], { type: "text/plain" }));
  } else if (node.original) {
    a.href = node.path;
  } else {
    showToast("File ini belum memiliki isi untuk diunduh");
    return;
  }
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// =========================================================
// Pagination component (dipakai list post & laporan)
// =========================================================
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
  for (let i = 1; i <= totalPages; i++) {
    html += `<button data-page="${i}" class="${i === currentPage ? "active" : ""}">${i}</button>`;
  }
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

// ---------- Toast ----------
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", function () {
  populateJenisSelect();
  renderGenreChips();
  if (isLoggedIn()) {
    viewLogin.classList.add("hidden");
    adminShell.classList.remove("hidden");
    showSub("viewMenu");
  } else {
    viewLogin.classList.remove("hidden");
    adminShell.classList.add("hidden");
    document.getElementById("passwordInput").focus();
  }
});

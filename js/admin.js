/* =========================================================
   Fueeru Game — Admin Panel logic
   Kata sandi (sementara): admin123
   Kata sandi darurat (recovery, hardcode): GINTAMA12345
   ========================================================= */

const SESSION_KEY = "fueeru_admin_session";
const REMEMBER_KEY = "fueeru_admin_remember";
const PAGE_SIZE = 10;
const EMERGENCY_PASSWORD = "GINTAMA12345";

let editingId = null; // null = mode tambah, string = mode edit
let currentGenres = []; // genre yang sedang dipilih di form

// ---------- Top-level views ----------
const viewLogin = document.getElementById("viewLogin");
const viewRecovery = document.getElementById("viewRecovery");
const adminShell = document.getElementById("adminShell");

function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === "1" || localStorage.getItem(REMEMBER_KEY) === "1";
}

function doLogin(remember) {
  sessionStorage.setItem(SESSION_KEY, "1");
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, "1");
  }
  viewLogin.classList.add("hidden");
  adminShell.classList.remove("hidden");
  showSub("viewMenu");
  pushBackTrap(); // baseline: 1x tombol back dari menu utama akan keluar dari Admin Panel
  checkBackupReminder();
  updateNotifBadge();
  purgeOldTrash();
}

function doLogout() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  document.getElementById("passwordInput").value = "";
  document.getElementById("rememberMeInput").checked = false;
  document.getElementById("loginError").textContent = "";
  adminShell.classList.add("hidden");
  viewLogin.classList.remove("hidden");
}

document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const val = document.getElementById("passwordInput").value;
  const errorEl = document.getElementById("loginError");
  const remember = document.getElementById("rememberMeInput").checked;
  if (val === getAdminPassword()) {
    errorEl.textContent = "";
    doLogin(remember);
  } else {
    errorEl.textContent = "Kata sandi salah. Coba lagi.";
  }
});

// ---------- Recovery Password ----------
document.getElementById("btnForgotPassword").addEventListener("click", function (e) {
  e.preventDefault();
  document.getElementById("recoveryForm").reset();
  document.getElementById("recoveryError").textContent = "";
  viewLogin.classList.add("hidden");
  viewRecovery.classList.remove("hidden");
});
document.getElementById("btnBackToLogin").addEventListener("click", function (e) {
  e.preventDefault();
  viewRecovery.classList.add("hidden");
  viewLogin.classList.remove("hidden");
});
document.getElementById("recoveryForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const emergencyVal = document.getElementById("emergencyPasswordInput").value;
  const newVal = document.getElementById("newPasswordRecoveryInput").value;
  const errorEl = document.getElementById("recoveryError");

  if (emergencyVal !== EMERGENCY_PASSWORD) {
    errorEl.textContent = "Kata sandi darurat salah.";
    return;
  }
  if (newVal.trim().length < 4) {
    errorEl.textContent = "Kata sandi baru minimal 4 karakter.";
    return;
  }
  setAdminPassword(newVal.trim());
  errorEl.textContent = "";
  viewRecovery.classList.add("hidden");
  doLogin();
  showToast("Kata sandi berhasil diubah");
});

document.getElementById("btnLogout").addEventListener("click", function () {
  openConfirmModal(
    "Yakin ingin keluar dari Admin Panel?",
    doLogout,
    { title: "Keluar dari Admin Panel", confirmLabel: "Ya, Keluar" }
  );
});

// ---------- Sub-view switching within adminShell ----------
const SUB_VIEWS = [
  "viewMenu",
  "viewPosts",
  "viewForm",
  "viewPages",
  "viewPageEdit",
  "viewReports",
  "viewFiles",
  "viewFileEdit",
  "viewBackup",
  "viewInfo",
  "viewRecycleBin",
  "viewRecycleBinList"
];
function showSub(id) {
  SUB_VIEWS.forEach((v) => document.getElementById(v).classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  if (id === "viewMenu" && typeof updateNotifBadge === "function") updateNotifBadge();
}

document.getElementById("menuAturPostingan").addEventListener("click", () => {
  postSearchQuery = "";
  document.getElementById("postSearchInput").value = "";
  postsPage = 1;
  showSub("viewPosts");
  renderPostsList();
});
document.getElementById("menuHalaman").addEventListener("click", () => {
  showSub("viewPages");
});
document.getElementById("btnBackFromPages").addEventListener("click", () => showSub("viewMenu"));
document.getElementById("btnBackFromPageEdit").addEventListener("click", () => showSub("viewPages"));

// ---------- Edit Halaman (Tutorial Main / Cara Download / Donasi / Tentang) ----------
let currentEditingPageId = null;
const editorContentPageEl = document.getElementById("editorContentPage");

document.querySelectorAll(".page-picker-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const pageId = btn.getAttribute("data-page-id");
    const pageLabel = btn.querySelector("span").textContent;
    currentEditingPageId = pageId;
    document.getElementById("pageEditHeading").textContent = pageLabel;
    editorContentPageEl.innerHTML = getPageContent(pageId).content;
    showSub("viewPageEdit");
  });
});

document.getElementById("btnSavePage").addEventListener("click", function () {
  if (!currentEditingPageId) return;
  const result = savePageContent(currentEditingPageId, editorContentPageEl.innerHTML.trim());
  if (result === "storage-full") {
    showToast("Gagal menyimpan — penyimpanan penuh. Coba gambar yang lebih kecil.");
    return;
  }
  showToast("Halaman disimpan");
});

document.getElementById("menuLihatLaporan").addEventListener("click", () => {
  reportSearchQuery = "";
  document.getElementById("reportSearchInput").value = "";
  reportsPage = 1;
  showSub("viewReports");
  renderReportsList();
});
document.getElementById("menuInformasiWeb").addEventListener("click", () => {
  renderInfoView();
  showSub("viewInfo");
});
document.getElementById("btnBackFromInfo").addEventListener("click", () => showSub("viewMenu"));
document.getElementById("menuManajemenFile").addEventListener("click", () => {
  navigateToFolder("");
  showSub("viewFiles");
});
document.getElementById("menuRecycleBin").addEventListener("click", () => {
  renderRecycleBinCounts();
  showSub("viewRecycleBin");
});
document.getElementById("btnBackFromRecycleBin").addEventListener("click", () => showSub("viewMenu"));
document.getElementById("btnOpenTrashPosts").addEventListener("click", () => openTrashList("posts"));
document.getElementById("btnOpenTrashReports").addEventListener("click", () => openTrashList("reports"));
document.getElementById("btnBackFromRecycleBinList").addEventListener("click", () => {
  showSub("viewRecycleBin");
  renderRecycleBinCounts();
});
document.getElementById("menuBackupRestore").addEventListener("click", () => {
  resetRestoreForm();
  updateBackupPostCount();
  showSub("viewBackup");
});
document.getElementById("btnBackFromBackup").addEventListener("click", () => showSub("viewMenu"));
document.getElementById("btnBackFromPosts").addEventListener("click", () => showSub("viewMenu"));
document.getElementById("btnBackFromReports").addEventListener("click", () => showSub("viewMenu"));
document.getElementById("btnBackFromForm").addEventListener("click", () => {
  goBackFromForm();
});
function goBackFromForm(onLeft) {
  if (isFormDirty()) {
    openConfirmModal(
      "Postingan belum disimpan, yakin ingin kembali dan membatalkannya?",
      function () {
        showSub("viewPosts");
        renderPostsList();
        if (onLeft) onLeft();
      },
      { title: "Batalkan Perubahan", confirmLabel: "Ya, Kembali" }
    );
  } else {
    showSub("viewPosts");
    renderPostsList();
    if (onLeft) onLeft();
  }
}
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

// =========================================================
// Tombol back HP (hardware/browser back) di dalam Admin Panel
// Supaya menekan tombol back HP berperilaku SAMA seperti menekan
// ikon "<" pada menu yang sedang terbuka — bukan langsung menutup
// seluruh panel admin.
//
// Caranya: setiap kali kita "sudah aman" untuk keluar sepenuhnya dari
// Admin Panel (yaitu saat berada di viewMenu), kita TIDAK menambah
// history entry apa pun. Tapi selama masih berada di salah satu
// sub-menu, kita selalu menjaga agar selalu ada 1 history entry
// "jebakan" (trap) tersisa, sehingga 1x tombol back HP hanya akan
// memicu event popstate (kita tangani sendiri seperti klik "<"),
// bukan benar-benar menutup halaman.
// =========================================================
function pushBackTrap() {
  history.pushState({ fueeruAdminTrap: true }, "", location.href);
}
function getCurrentSubView() {
  return SUB_VIEWS.find((v) => !document.getElementById(v).classList.contains("hidden"));
}

window.addEventListener("popstate", function () {
  // Masih di layar login / belum masuk admin shell -> biarkan browser
  // berperilaku normal (misal keluar dari halaman admin.html).
  if (!viewLogin.classList.contains("hidden") || adminShell.classList.contains("hidden")) return;

  const current = getCurrentSubView();
  // Sudah di menu utama Admin Panel -> ini "akar" navigasi admin,
  // biarkan tombol back berikutnya benar-benar keluar dari halaman.
  if (!current || current === "viewMenu") return;

  if (current === "viewForm") {
    if (isFormDirty()) {
      // Batalkan dulu "pop" yang barusan terjadi, tampilkan konfirmasi
      // seperti saat ikon "<" ditekan. Trap di-pasang lagi supaya
      // tombol back tidak langsung menutup panel selama modal terbuka.
      pushBackTrap();
    }
    goBackFromForm(function () {
      pushBackTrap(); // sudah pindah ke viewPosts -> pasang trap lagi
    });
    return;
  }

  if (current === "viewFiles") {
    if (currentFolderPath === "") {
      showSub("viewMenu"); // sudah di folder akar -> jangan pasang trap lagi
    } else {
      navigateToFolder(parentOf(currentFolderPath));
      pushBackTrap();
    }
    return;
  }

  if (current === "viewFileEdit") {
    showSub("viewFiles");
    renderFilesView();
    pushBackTrap();
    return;
  }

  if (current === "viewRecycleBinList") {
    showSub("viewRecycleBin");
    renderRecycleBinCounts();
    pushBackTrap();
    return;
  }

  if (current === "viewPageEdit") {
    showSub("viewPages");
    pushBackTrap();
    return;
  }

  // viewPosts, viewReports, viewBackup, viewInfo, viewRecycleBin, viewPages -> kembali ke menu utama
  showSub("viewMenu");
});

function escapeHtmlAdmin(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/* admin.html sekarang berada di folder utama (sama seperti index.html),
   jadi aset di folder root (webpictures, dsb.) tidak butuh prefix. */
const ADMIN_ASSET_BASE = "";
function resolveAdminAsset(path) {
  if (!path) return path;
  if (/^(data:|https?:\/\/|\/)/i.test(path)) return path;
  return ADMIN_ASSET_BASE + path;
}

/** Aktifkan fungsi buka/tutup (toggle) untuk kotak spoiler di dalam
 * `container` — dipakai bersama oleh Preview Postingan di Admin.
 * Label "SPOILER" tetap ada, klik lagi untuk menutup kembali. */
function initSpoilersAdmin(container) {
  (container || document).querySelectorAll(".spoiler-content").forEach((box) => {
    const label = box.querySelector(".spoiler-label");
    if (!label || label.dataset.spoilerBound) return;
    label.dataset.spoilerBound = "1";
    label.addEventListener("click", function () {
      box.classList.toggle("revealed");
    });
  });
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
      <img src="${resolveAdminAsset(p.thumbnail)}" alt="">
      <div class="api-body">
        <div class="api-title">${escapeHtmlAdmin(p.title)}</div>
        <div class="api-meta">${escapeHtmlAdmin(p.jenis)} • ${
        p.published === false ? '<span class="draft-label">Draft</span>' : escapeHtmlAdmin(formatDate(p.date))
      }</div>
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
    `Hapus postingan "${post.title}"? Postingan akan dipindahkan ke Recycle Bin dan bisa dipulihkan dalam 30 hari.`,
    function () {
      trashPost(id);
      renderPostsList();
      showToast("Postingan dipindahkan ke Recycle Bin");
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
  captureFormSnapshot();
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
  uploadPreview.src = resolveAdminAsset(post.thumbnail);
  uploadPreview.style.display = "block";
  uploadLabel.textContent = "Klik untuk mengganti gambar header";
  showSub("viewForm");
  captureFormSnapshot();
}

// ---------- Deteksi perubahan yang belum disimpan ----------
// Dipakai supaya window "Batalkan Perubahan" hanya muncul jika memang
// ada perubahan yang belum disimpan, bukan setiap kali menekan "<".
let formSnapshot = null;
function getFormSnapshotData() {
  return {
    title: fieldTitle.value.trim(),
    jenis: fieldJenis.value,
    genres: currentGenres.slice(),
    content: editorContent.innerHTML.trim(),
    thumbnail: currentThumbnailData || ""
  };
}
function captureFormSnapshot() {
  formSnapshot = JSON.stringify(getFormSnapshotData());
}
function isFormDirty() {
  if (formSnapshot === null) return false;
  return JSON.stringify(getFormSnapshotData()) !== formSnapshot;
}

document.getElementById("btnAddPost").addEventListener("click", openAddForm);

/** Kompres & resize gambar upload sebelum disimpan sebagai dataURL.
 * Ini PENTING: localStorage punya batas ukuran (biasanya ~5-10MB per
 * situs). Foto asli dari HP/kamera bisa beberapa MB, dan kalau
 * langsung disimpan mentah sebagai base64 (ukurannya membengkak ~33%),
 * localStorage bisa penuh sehingga penyimpanan GAGAL TOTAL secara diam-diam
 * (postingan jadi tidak pernah tersimpan). Fungsi ini me-resize gambar ke
 * ukuran maksimum yang wajar & mengompresnya jadi WebP (jauh lebih kecil
 * dari JPEG di kualitas visual yang setara) — dengan fallback otomatis ke
 * JPEG kalau browser-nya kebetulan tidak mendukung ekspor WebP dari canvas.
 * Return: Promise<string dataURL>. */
function compressImageFile(file, maxDim, quality) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onerror = function () {
      reject(new Error("Gagal membaca file gambar"));
    };
    reader.onload = function (e) {
      const img = new Image();
      img.onerror = function () {
        reject(new Error("Gagal memuat gambar"));
      };
      img.onload = function () {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        const limit = maxDim || 1280;
        if (w > limit || h > limit) {
          if (w >= h) {
            h = Math.round((h * limit) / w);
            w = limit;
          } else {
            w = Math.round((w * limit) / h);
            h = limit;
          }
        }
        try {
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          // Latar putih dulu, supaya PNG transparan tidak jadi hitam saat
          // dikonversi ke WebP/JPEG (keduanya dipakai tanpa alpha di sini).
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const q = quality || 0.82;
          let dataUrl = canvas.toDataURL("image/webp", q);
          // Sebagian kecil browser lawas diam-diam fallback ke PNG kalau
          // tidak mendukung ekspor WebP dari canvas — deteksi & pakai JPEG
          // sebagai cadangan supaya ukurannya tetap kecil.
          if (!dataUrl || dataUrl.indexOf("data:image/webp") !== 0) {
            dataUrl = canvas.toDataURL("image/jpeg", q);
          }
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}


// Upload gambar header -> dikompres & di-resize dulu, baru jadi dataURL
fieldImage.addEventListener("change", function () {
  const file = fieldImage.files && fieldImage.files[0];
  if (!file) return;
  uploadLabel.textContent = "Memproses gambar…";
  compressImageFile(file, 1280, 0.82)
    .then(function (dataUrl) {
      currentThumbnailData = dataUrl;
      uploadPreview.src = currentThumbnailData;
      uploadPreview.style.display = "block";
      uploadLabel.textContent = "Klik untuk mengganti gambar header";
    })
    .catch(function () {
      uploadLabel.textContent = "Klik untuk upload gambar header";
      showToast("Gagal memproses gambar, coba gambar lain");
    });
});

// =========================================================
// Rich text toolbar (Isi Postingan & Edit Halaman)
// Dibuat sebagai factory function supaya bisa dipakai ulang oleh 2
// editor berbeda (form postingan & form Halaman) tanpa duplikasi logika.
// =========================================================
function initRichTextEditor(cfg) {
  const toolbarEl = document.getElementById(cfg.toolbarId);
  const contentEl = document.getElementById(cfg.contentId);
  let savedSelectionRange = null;

  // Klik tombol toolbar TIDAK boleh menghilangkan seleksi teks yang
  // sedang aktif di contentEl (perilaku default browser: elemen yang
  // di-mousedown akan mengambil fokus & mengosongkan seleksi lama).
  toolbarEl.addEventListener("mousedown", function (e) {
    if (e.target.closest("button")) e.preventDefault();
  });

  // Simpan & pulihkan posisi seleksi/kursor di dalam contentEl. Wajib
  // dipakai setiap kali sebuah aksi toolbar membuka dialog/file picker
  // native (yang membuat fokus browser berpindah keluar dari contentEl),
  // supaya sisipan (gambar/link) tidak gagal karena seleksinya sudah hilang.
  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && contentEl.contains(sel.anchorNode)) {
      savedSelectionRange = sel.getRangeAt(0).cloneRange();
    }
  }
  function restoreSelection() {
    contentEl.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    if (savedSelectionRange) {
      sel.addRange(savedSelectionRange);
    } else {
      const range = document.createRange();
      range.selectNodeContents(contentEl);
      range.collapse(false);
      sel.addRange(range);
    }
  }

  // Bungkus seleksi aktif dengan sebuah elemen (dipakai untuk ukuran
  // huruf, spoiler, & label). Fallback ke extractContents bila
  // surroundContents gagal (mis. seleksi memotong beberapa elemen
  // blok berbeda).
  function wrapSelection(el) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    if (!contentEl.contains(range.commonAncestorContainer)) return false;
    try {
      range.surroundContents(el);
    } catch (err) {
      try {
        const content = range.extractContents();
        el.appendChild(content);
        range.insertNode(el);
      } catch (err2) {
        return false;
      }
    }
    const newRange = document.createRange();
    newRange.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(newRange);
    savedSelectionRange = newRange.cloneRange();
    return true;
  }

  // ---------- Tombol format dasar (data-cmd) & ukuran huruf (data-fontsize) ----------
  toolbarEl.addEventListener("click", function (e) {
    const cmdBtn = e.target.closest("button[data-cmd]");
    if (cmdBtn) {
      contentEl.focus();
      document.execCommand(cmdBtn.getAttribute("data-cmd"), false, null);
      return;
    }
    const fsBtn = e.target.closest("button[data-fontsize]");
    if (fsBtn) {
      applyFontSize(fsBtn.getAttribute("data-fontsize"));
    }
  });

  function applyFontSize(size) {
    contentEl.focus();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      showToast("Pilih teks yang ingin diubah ukurannya terlebih dahulu");
      return;
    }
    const span = document.createElement("span");
    span.className = size === "small" ? "fs-sm" : size === "large" ? "fs-lg" : "fs-md";
    wrapSelection(span);
  }

  // ---------- Sisipkan Gambar ----------
  document.getElementById(cfg.insertImageBtnId).addEventListener("click", function () {
    saveSelection();
    document.getElementById(cfg.imageInputId).click();
  });

  document.getElementById(cfg.imageInputId).addEventListener("change", function (e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    compressImageFile(file, 1000, 0.8)
      .then(function (dataUrl) {
        restoreSelection();
        const sel = window.getSelection();
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const img = document.createElement("img");
        img.src = dataUrl;
        img.alt = "";
        range.insertNode(img);
        range.setStartAfter(img);
        range.setEndAfter(img);
        sel.removeAllRanges();
        sel.addRange(range);
        savedSelectionRange = range.cloneRange();
      })
      .catch(function () {
        showToast("Gagal memproses gambar, coba gambar lain");
      });
  });

  // ---------- Sisipkan Link (pakai modal bersama linkModalBackdrop) ----------
  document.getElementById(cfg.insertLinkBtnId).addEventListener("click", function () {
    saveSelection();
    activeRichEditor = api; // tandai editor ini sebagai target modal link
    linkUrlInput.value = "";
    linkTextInput.value = savedSelectionRange ? savedSelectionRange.toString() : "";
    linkModalBackdrop.classList.add("show");
    setTimeout(() => linkUrlInput.focus(), 100);
  });

  // ---------- Warna Teks ----------
  const colorSwatchMenuEl = document.getElementById(cfg.colorMenuId);
  document.getElementById(cfg.colorBtnId).addEventListener("click", function (e) {
    e.stopPropagation();
    saveSelection();
    activeRichEditor = api;
    colorSwatchMenuEl.classList.toggle("show");
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#" + cfg.colorWrapId)) colorSwatchMenuEl.classList.remove("show");
  });
  colorSwatchMenuEl.addEventListener("click", function (e) {
    const swatch = e.target.closest(".color-swatch");
    if (!swatch) return;
    const color = swatch.getAttribute("data-color");
    restoreSelection();
    if (window.getSelection().isCollapsed) {
      showToast("Pilih teks yang ingin diberi warna terlebih dahulu");
    } else {
      document.execCommand("foreColor", false, color);
    }
    colorSwatchMenuEl.classList.remove("show");
  });

  // ---------- Kutipan ----------
  document.getElementById(cfg.quoteBtnId).addEventListener("click", function () {
    contentEl.focus();
    document.execCommand("formatBlock", false, "blockquote");
  });

  // ---------- Ubah huruf besar/kecil (siklus: kecil -> BESAR -> Kapital Awal) ----------
  document.getElementById(cfg.caseToggleBtnId).addEventListener("click", function () {
    contentEl.focus();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentEl.contains(sel.anchorNode)) {
      showToast("Pilih teks yang ingin diubah terlebih dahulu");
      return;
    }
    const range = sel.getRangeAt(0);
    const text = range.toString();
    const lower = text.toLowerCase();
    const upper = text.toUpperCase();
    let next;
    if (text === lower && lower !== upper) {
      next = upper;
    } else if (text === upper && lower !== upper) {
      next = toTitleCase(text);
    } else {
      next = lower;
    }
    range.deleteContents();
    const textNode = document.createTextNode(next);
    range.insertNode(textNode);
    const newRange = document.createRange();
    newRange.selectNode(textNode);
    sel.removeAllRanges();
    sel.addRange(newRange);
    savedSelectionRange = newRange.cloneRange();
  });

  // ---------- Spoiler ----------
  // Bungkus teks dan/atau gambar yang dipilih ke dalam kotak spoiler:
  // label "SPOILER" yang bisa diklik pengunjung untuk membuka isinya.
  document.getElementById(cfg.spoilerBtnId).addEventListener("click", function () {
    contentEl.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !contentEl.contains(sel.anchorNode)) {
      showToast("Pilih teks atau gambar yang ingin dijadikan spoiler terlebih dahulu");
      return;
    }
    const range = sel.getRangeAt(0);
    if (!contentEl.contains(range.commonAncestorContainer)) return;

    let extracted;
    try {
      extracted = range.extractContents();
    } catch (err) {
      showToast("Gagal membuat spoiler pada seleksi ini");
      return;
    }
    if (!extracted || !extracted.hasChildNodes()) {
      showToast("Gagal membuat spoiler pada seleksi ini");
      return;
    }

    const inner = document.createElement("span");
    inner.className = "spoiler-inner";
    inner.appendChild(extracted);

    const label = document.createElement("span");
    label.className = "spoiler-label";
    label.setAttribute("contenteditable", "false");
    label.textContent = "SPOILER";

    const wrapper = document.createElement("span");
    wrapper.className = "spoiler-content";
    wrapper.appendChild(label);
    wrapper.appendChild(inner);

    range.insertNode(wrapper);

    const newRange = document.createRange();
    newRange.setStartAfter(wrapper);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    savedSelectionRange = newRange.cloneRange();
  });

  // ---------- Label ----------
  // Bungkus teks (bisa lebih dari 1 paragraf) yang dipilih dengan kotak
  // berborder biru muda (mirip kotak pembungkus di menu Informasi Web).
  document.getElementById(cfg.labelBtnId).addEventListener("click", function () {
    contentEl.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !contentEl.contains(sel.anchorNode)) {
      showToast("Pilih teks yang ingin diberi Label terlebih dahulu");
      return;
    }
    const div = document.createElement("div");
    div.className = "label-box";
    if (!wrapSelection(div)) {
      showToast("Gagal membuat Label pada seleksi ini");
    }
  });

  const api = { saveSelection, restoreSelection, contentEl };
  return api;
}

function toTitleCase(str) {
  return str.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ---------- Modal bersama: Sisipkan Link (dipakai oleh semua editor) ----------
const linkModalBackdrop = document.getElementById("linkModalBackdrop");
const linkUrlInput = document.getElementById("linkUrlInput");
const linkTextInput = document.getElementById("linkTextInput");
let activeRichEditor = null; // editor mana yang sedang memakai modal link / dropdown warna

document.getElementById("btnCancelLink").addEventListener("click", function () {
  linkModalBackdrop.classList.remove("show");
});
linkModalBackdrop.addEventListener("click", function (e) {
  if (e.target === linkModalBackdrop) linkModalBackdrop.classList.remove("show");
});

document.getElementById("btnConfirmLink").addEventListener("click", function () {
  if (!activeRichEditor) return;
  const url = linkUrlInput.value.trim();
  if (!url) {
    linkUrlInput.focus();
    return;
  }
  const text = linkTextInput.value.trim() || url;
  activeRichEditor.restoreSelection();
  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.style.color = "#2fa8e0";
  a.style.textDecoration = "underline";
  a.textContent = text;
  range.insertNode(a);
  range.setStartAfter(a);
  range.setEndAfter(a);
  sel.removeAllRanges();
  sel.addRange(range);
  linkModalBackdrop.classList.remove("show");
});

// ---------- Instance editor: Isi Postingan ----------
initRichTextEditor({
  toolbarId: "editorToolbar",
  contentId: "editorContent",
  insertImageBtnId: "btnInsertImage",
  imageInputId: "contentImageInput",
  insertLinkBtnId: "btnInsertLink",
  colorBtnId: "btnTextColor",
  colorMenuId: "colorSwatchMenu",
  colorWrapId: "colorDropdownWrap",
  quoteBtnId: "btnQuote",
  caseToggleBtnId: "btnCaseToggle",
  spoilerBtnId: "btnSpoiler",
  labelBtnId: "btnLabel"
});

// ---------- Instance editor: Edit Halaman ----------
initRichTextEditor({
  toolbarId: "editorToolbarPage",
  contentId: "editorContentPage",
  insertImageBtnId: "btnInsertImagePage",
  imageInputId: "contentImageInputPage",
  insertLinkBtnId: "btnInsertLinkPage",
  colorBtnId: "btnTextColorPage",
  colorMenuId: "colorSwatchMenuPage",
  colorWrapId: "colorDropdownWrapPage",
  quoteBtnId: "btnQuotePage",
  caseToggleBtnId: "btnCaseTogglePage",
  spoilerBtnId: "btnSpoilerPage",
  labelBtnId: "btnLabelPage"
});

// =========================================================
// Preview Postingan
// =========================================================
const previewModalBackdrop = document.getElementById("previewModalBackdrop");
const previewModalBody = document.getElementById("previewModalBody");

function closePreviewModal() {
  previewModalBackdrop.classList.remove("show");
}
document.getElementById("btnClosePreviewForm2").addEventListener("click", closePreviewModal);
previewModalBackdrop.addEventListener("click", function (e) {
  if (e.target === previewModalBackdrop) closePreviewModal();
});

document.getElementById("btnPreviewForm").addEventListener("click", function () {
  const title = fieldTitle.value.trim() || "(Judul belum diisi)";
  const jenis = fieldJenis.value;
  const genres = currentGenres.slice();
  const content = editorContent.innerHTML.trim() || "<p><em>(Isi postingan masih kosong)</em></p>";
  const thumbnail =
    currentThumbnailData ||
    (editingId ? (getPostById(editingId) || {}).thumbnail : null) ||
    "webpictures/postplaceholder.webp";

  previewModalBody.innerHTML = `
    <div class="preview-badge">Pratinjau — belum dipublikasikan</div>
    <h1 class="post-detail-title">${escapeHtmlAdmin(title)}</h1>
    <img class="post-detail-img" src="${resolveAdminAsset(thumbnail)}" alt="">
    <div class="post-detail-content">${content}</div>
    <div class="post-detail-meta">
      <span><strong>Tanggal:</strong> ${escapeHtmlAdmin(formatReportDate(new Date().toISOString()))}</span>
      <span class="pill">${escapeHtmlAdmin(jenis)}</span>
    </div>
    ${genres.length ? `<div class="genre-chip-row" style="margin-top:12px;">${genres.map((g) => `<span class="genre-chip">${escapeHtmlAdmin(g)}</span>`).join("")}</div>` : ""}
  `;
  // Spoiler di preview sebelumnya tidak berfungsi sama sekali —
  // pasang handler toggle yang sama seperti di halaman publik.
  initSpoilersAdmin(previewModalBody);
  previewModalBackdrop.classList.add("show");
});

// ---------- Simpan (draft) / Publish ----------
/** Ambil & validasi field form. Return null kalau tidak valid (judul kosong). */
function readPostFormFields() {
  const title = fieldTitle.value.trim();
  if (!title) {
    fieldTitle.focus();
    return null;
  }
  return {
    title,
    content: editorContent.innerHTML.trim(),
    jenis: fieldJenis.value,
    genres: currentGenres.slice()
  };
}

/** Simpan form. publish=true -> Publish (postingan jadi live, tampil di
 * publik). publish=false -> Simpan (draft, TIDAK tampil di publik) —
 * berlaku apa adanya setiap kali ditekan, tidak peduli status
 * sebelumnya, supaya "Simpan" selalu berarti draft dan "Publish" selalu
 * berarti live.
 * Return: "ok" | "invalid" (judul kosong) | "storage-full" (localStorage
 * penuh, biasanya karena gambar terlalu besar — lihat compressImageFile). */
function savePostForm(publish) {
  const fields = readPostFormFields();
  if (!fields) return "invalid";
  const { title, content, jenis, genres } = fields;
  const posts = loadPosts();
  let newPostId = null;

  if (editingId) {
    const idx = posts.findIndex((p) => p.id === editingId);
    if (idx !== -1) {
      const wasPublished = posts[idx].published !== false;
      posts[idx] = {
        ...posts[idx],
        title,
        jenis,
        genres,
        content,
        thumbnail: currentThumbnailData || posts[idx].thumbnail,
        published: publish,
        // Kalau baru pertama kali dipublish sekarang, catat tanggal publish-nya.
        date: publish && !wasPublished ? new Date().toISOString().slice(0, 10) : posts[idx].date
      };
    }
  } else {
    const newPost = {
      id: "post-" + Date.now(),
      title,
      jenis,
      genres,
      date: new Date().toISOString().slice(0, 10),
      thumbnail: currentThumbnailData || "webpictures/postplaceholder.webp",
      content,
      published: publish
    };
    posts.unshift(newPost);
    newPostId = newPost.id;
  }

  const ok = savePosts(posts);
  if (!ok) return "storage-full";

  if (newPostId) {
    // Baru berhasil disimpan sebagai postingan baru -> supaya klik
    // Simpan/Publish berikutnya mengedit postingan yang sama, bukan
    // membuat duplikat baru.
    editingId = newPostId;
    document.getElementById("formHeading").textContent = "Edit Postingan";
  }
  captureFormSnapshot(); // baseline baru — belum ada perubahan sejak disimpan
  return "ok";
}

document.getElementById("btnSaveDraft").addEventListener("click", function () {
  const result = savePostForm(false);
  if (result === "invalid") return;
  if (result === "storage-full") {
    showToast("Gagal menyimpan — penyimpanan penuh. Coba gambar yang lebih kecil.");
    return;
  }
  showToast("Postingan Disimpan");
  // Sengaja TIDAK pindah ke Menu Atur Postingan — tetap di form.
});

document.getElementById("postForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const wasEditing = !!editingId;
  const result = savePostForm(true);
  if (result === "invalid") return;
  if (result === "storage-full") {
    showToast("Gagal menyimpan — penyimpanan penuh. Coba gambar yang lebih kecil.");
    return;
  }
  showSub("viewPosts");
  renderPostsList();
  showToast(wasEditing ? "Postingan diperbarui" : "Postingan dipublikasikan");
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

const REPORT_STATUS_LABELS = { belum: "Belum ditangani", sedang: "Sedang ditangani", selesai: "Sudah ditangani" };
function reportStatusIconSvg(status) {
  const s = status || "belum";
  if (s === "selesai") {
    return `<span class="report-status-icon selesai" title="${REPORT_STATUS_LABELS.selesai}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>`;
  }
  if (s === "sedang") {
    return `<span class="report-status-icon sedang" title="${REPORT_STATUS_LABELS.sedang}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg></span>`;
  }
  return `<span class="report-status-icon belum" title="${REPORT_STATUS_LABELS.belum}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>`;
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
        <div class="api-title">${reportStatusIconSvg(r.status)}${escapeHtmlAdmin(r.title)}</div>
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
  currentViewingReportId = r.id;
  const radio = document.querySelector(`input[name="reportStatus"][value="${r.status || "belum"}"]`);
  if (radio) radio.checked = true;
  viewReportModalBackdrop.classList.add("show");
}

let currentViewingReportId = null;
document.getElementById("btnUpdateReportStatus").addEventListener("click", function () {
  if (!currentViewingReportId) return;
  const selected = document.querySelector('input[name="reportStatus"]:checked');
  if (!selected) return;
  const reports = loadReports();
  const idx = reports.findIndex((r) => r.id === currentViewingReportId);
  if (idx === -1) return;
  reports[idx].status = selected.value;
  saveReports(reports);
  viewReportModalBackdrop.classList.remove("show");
  renderReportsList();
  showToast("Status laporan diperbarui");
});

document.getElementById("btnCloseViewReport").addEventListener("click", function () {
  viewReportModalBackdrop.classList.remove("show");
});
viewReportModalBackdrop.addEventListener("click", function (e) {
  if (e.target === viewReportModalBackdrop) viewReportModalBackdrop.classList.remove("show");
});

function deleteReport(id) {
  openConfirmModal(
    "Hapus laporan ini? Laporan akan dipindahkan ke Recycle Bin dan bisa dipulihkan dalam 30 hari.",
    function () {
      trashReport(id);
      renderReportsList();
      showToast("Laporan dipindahkan ke Recycle Bin");
    },
    { title: "Hapus Laporan" }
  );
}

document.getElementById("btnDeleteAllReports").addEventListener("click", function () {
  const reports = loadReports();
  if (reports.length === 0) return;
  openConfirmModal(
    "Yakin ingin hapus semua laporan? Laporan akan dipindahkan ke Recycle Bin dan bisa dipulihkan dalam 30 hari.",
    function () {
      reports.forEach((r) => trashReport(r.id));
      reportsPage = 1;
      renderReportsList();
      showToast("Semua laporan dipindahkan ke Recycle Bin");
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

document.getElementById("btnRefreshFiles").addEventListener("click", function () {
  const btn = this;
  btn.classList.remove("is-spinning");
  void btn.offsetWidth; // restart animasi kalau diklik berkali-kali
  btn.classList.add("is-spinning");

  const added = vfsSyncWithSeed();
  vfsGridPage = 1;
  vfsFilePage = 1;
  renderFilesView();
  showToast(added > 0 ? `${added} folder/file baru ditemukan & ditambahkan` : "Tidak ada folder/file baru");

  setTimeout(() => btn.classList.remove("is-spinning"), 650);
});

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
  if (!node.isText) {
    showToast("File ini tidak bisa dibuka");
    return;
  }
  currentEditingFilePath = path;
  document.getElementById("fileEditHeading").textContent = node.name;
  const textarea = document.getElementById("fileEditTextarea");
  const note = document.getElementById("fileEditNote");
  textarea.value = "";
  note.textContent = "";
  pushBackTrap();

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
    fetch(vfsRealPath(node.path))
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
    a.href = vfsRealPath(node.path);
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

// =========================================================
// Backup & Restore (data postingan)
// =========================================================
const restoreFileInput = document.getElementById("restoreFileInput");
const restoreFileNameEl = document.getElementById("restoreFileName");
const restoreFileLabel = document.querySelector(".backup-file-label");
const btnRestoreBackup = document.getElementById("btnRestoreBackup");
const backupStatusEl = document.getElementById("backupStatus");
let pendingRestoreData = null; // array post hasil parsing file yang dipilih

function updateBackupPostCount() {
  const n = loadPosts().length;
  document.getElementById("backupPostCount").textContent =
    n === 0 ? "Belum ada postingan tersimpan." : `Saat ini ada ${n} postingan tersimpan.`;
}

function resetRestoreForm() {
  restoreFileInput.value = "";
  restoreFileNameEl.textContent = "Belum ada file dipilih";
  restoreFileLabel.classList.remove("has-file");
  btnRestoreBackup.disabled = true;
  pendingRestoreData = null;
  backupStatusEl.textContent = "";
  backupStatusEl.className = "backup-status";
  document.querySelector('input[name="restoreMode"][value="merge"]').checked = true;
}

function setBackupStatus(msg, type) {
  backupStatusEl.textContent = msg;
  backupStatusEl.className = "backup-status" + (type ? " " + type : "");
}

// ---------- Backup (download) ----------
document.getElementById("btnDownloadBackup").addEventListener("click", function () {
  const posts = loadPosts();
  const payload = {
    app: "fueeru-game-backup",
    type: "posts",
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    count: posts.length,
    posts: posts
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `fueeru-posts-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  markBackupDone();
  // Backup baru saja dilakukan -> hapus notifikasi pengingat backup yang lama (kalau ada)
  saveNotifications(loadNotifications().filter((n) => n.type !== "backup_reminder"));
  showToast("Backup postingan berhasil diunduh");
});

// ---------- Restore (pilih file) ----------
restoreFileInput.addEventListener("change", function () {
  const file = restoreFileInput.files && restoreFileInput.files[0];
  pendingRestoreData = null;
  btnRestoreBackup.disabled = true;
  setBackupStatus("", "");

  if (!file) {
    restoreFileNameEl.textContent = "Belum ada file dipilih";
    restoreFileLabel.classList.remove("has-file");
    return;
  }
  restoreFileNameEl.textContent = file.name;
  restoreFileLabel.classList.add("has-file");

  const reader = new FileReader();
  reader.onload = function () {
    try {
      const parsed = JSON.parse(reader.result);
      const posts = Array.isArray(parsed) ? parsed : parsed.posts;
      if (!Array.isArray(posts)) {
        throw new Error("Format file tidak dikenali (tidak ditemukan daftar postingan).");
      }
      const valid = posts.every(
        (p) => p && typeof p === "object" && typeof p.id === "string" && typeof p.title === "string"
      );
      if (!valid || posts.length === 0) {
        throw new Error("Isi file tidak sesuai format data postingan Fueeru Game.");
      }
      pendingRestoreData = posts;
      btnRestoreBackup.disabled = false;
      setBackupStatus(`File valid — berisi ${posts.length} postingan, siap dipulihkan.`, "success");
    } catch (err) {
      pendingRestoreData = null;
      btnRestoreBackup.disabled = true;
      setBackupStatus("Gagal membaca file: " + err.message, "error");
    }
  };
  reader.onerror = function () {
    setBackupStatus("Gagal membaca file. Coba lagi.", "error");
  };
  reader.readAsText(file);
});

// ---------- Restore (eksekusi) ----------
btnRestoreBackup.addEventListener("click", function () {
  if (!pendingRestoreData) return;
  const mode = document.querySelector('input[name="restoreMode"]:checked').value;
  const incoming = pendingRestoreData;

  const message =
    mode === "replace"
      ? `Semua postingan yang ada sekarang (${loadPosts().length}) akan DIHAPUS dan diganti dengan ${incoming.length} postingan dari file backup. Lanjutkan?`
      : `${incoming.length} postingan dari file backup akan digabungkan dengan data yang ada (postingan dengan ID sama akan diperbarui). Lanjutkan?`;

  openConfirmModal(
    message,
    function () {
      let finalPosts;
      if (mode === "replace") {
        finalPosts = incoming.slice();
      } else {
        const existing = loadPosts();
        const map = new Map(existing.map((p) => [p.id, p]));
        incoming.forEach((p) => map.set(p.id, p));
        finalPosts = Array.from(map.values());
      }
      savePosts(finalPosts);
      updateBackupPostCount();
      resetRestoreForm();
      setBackupStatus(`Berhasil dipulihkan — total sekarang ${finalPosts.length} postingan.`, "success");
      showToast("Data postingan berhasil dipulihkan");
    },
    { title: "Konfirmasi Restore", confirmLabel: mode === "replace" ? "Ya, Timpa Semua" : "Ya, Gabungkan" }
  );
});

// =========================================================
// Informasi Web (statistik + kata sandi admin)
// =========================================================
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function renderInfoView() {
  const visitStats = getVisitStats();
  const posts = loadPosts();
  const reports = loadReports();
  const viewStats = getPostViewStats();

  document.getElementById("infoTotalVisits").textContent = visitStats.total;
  document.getElementById("infoVisitsThisWeek").textContent = visitStats.thisWeek;
  document.getElementById("infoVisitsLastWeek").textContent = visitStats.lastWeek;
  document.getElementById("infoTotalPosts").textContent = posts.length;
  document.getElementById("infoTotalReports").textContent = reports.length;
  document.getElementById("infoReportsPending").textContent = reports.filter(
    (r) => (r.status || "belum") === "belum"
  ).length;
  document.getElementById("infoStorageSize").textContent = formatBytes(getStorageSizeEstimate());

  document.getElementById("infoViewsTotal").textContent = viewStats.total;
  document.getElementById("infoViewsThisWeek").textContent = viewStats.thisWeek;
  document.getElementById("infoViewsLastWeek").textContent = viewStats.lastWeek;

  document.getElementById("infoCurrentPassword").textContent = getAdminPassword();
  document.getElementById("newPasswordInput").value = "";
  document.getElementById("passwordStatus").textContent = "";
  document.getElementById("passwordStatus").className = "backup-status";
}

document.getElementById("btnSavePassword").addEventListener("click", function () {
  const input = document.getElementById("newPasswordInput");
  const statusEl = document.getElementById("passwordStatus");
  const val = input.value.trim();
  if (val.length < 4) {
    statusEl.textContent = "Kata sandi minimal 4 karakter.";
    statusEl.className = "backup-status error";
    return;
  }
  setAdminPassword(val);
  document.getElementById("infoCurrentPassword").textContent = val;
  input.value = "";
  statusEl.textContent = "Kata sandi admin berhasil diganti.";
  statusEl.className = "backup-status success";
  showToast("Kata sandi admin diperbarui");
});

// ---------- Modal: Notifikasi ----------
const notifModalBackdrop = document.getElementById("notifModalBackdrop");
let notifPage = 1;
const NOTIF_ICONS = {
  report: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L14.71 3.86a2 2 0 00-3.42 0z"/></svg>`,
  backup_reminder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8H3v13h18V8z"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>`
};

function updateNotifBadge() {
  const badge = document.getElementById("notifBadge");
  const n = loadNotifications().length;
  if (n > 0) {
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function renderNotifModal() {
  const notifs = loadNotifications();
  const list = document.getElementById("notifList");

  if (notifs.length === 0) {
    list.innerHTML = `<div class="empty-state"><h3>Tidak ada notifikasi</h3></div>`;
    renderPagination("notifPagination", 0, PAGE_SIZE, 1, () => {});
    return;
  }

  const totalPages = Math.max(1, Math.ceil(notifs.length / PAGE_SIZE));
  if (notifPage > totalPages) notifPage = totalPages;
  const start = (notifPage - 1) * PAGE_SIZE;
  const pageNotifs = notifs.slice(start, start + PAGE_SIZE);

  list.innerHTML = pageNotifs
    .map(
      (n) => `
    <div class="notif-item type-${n.type}">
      <span class="notif-icon">${NOTIF_ICONS[n.type] || NOTIF_ICONS.report}</span>
      <div class="notif-body">
        <div class="notif-text">${escapeHtmlAdmin(n.text)}</div>
        <div class="notif-time">${escapeHtmlAdmin(formatReportDate(n.date))}</div>
      </div>
    </div>`
    )
    .join("");

  renderPagination("notifPagination", notifs.length, PAGE_SIZE, notifPage, (page) => {
    notifPage = page;
    renderNotifModal();
  });
}

document.getElementById("btnNotifications").addEventListener("click", function () {
  notifPage = 1;
  renderNotifModal();
  notifModalBackdrop.classList.add("show");
});
document.getElementById("btnCloseNotifs").addEventListener("click", function () {
  notifModalBackdrop.classList.remove("show");
});
notifModalBackdrop.addEventListener("click", function (e) {
  if (e.target === notifModalBackdrop) notifModalBackdrop.classList.remove("show");
});
document.getElementById("btnClearNotifs").addEventListener("click", function () {
  if (loadNotifications().length === 0) return;
  openConfirmModal(
    "Hapus semua notifikasi?",
    function () {
      clearAllNotifications();
      notifPage = 1;
      renderNotifModal();
      updateNotifBadge();
      showToast("Semua notifikasi dihapus");
    },
    { title: "Hapus Semua Notifikasi", confirmLabel: "Ya, Hapus" }
  );
});

// ---------- Modal: Views Postingan ----------
const postViewsModalBackdrop = document.getElementById("postViewsModalBackdrop");
let postViewsPage = 1;

document.getElementById("btnViewPostViews").addEventListener("click", function () {
  postViewsPage = 1;
  renderPostViewsModal();
  postViewsModalBackdrop.classList.add("show");
});
document.getElementById("btnClosePostViews").addEventListener("click", function () {
  postViewsModalBackdrop.classList.remove("show");
});
postViewsModalBackdrop.addEventListener("click", function (e) {
  if (e.target === postViewsModalBackdrop) postViewsModalBackdrop.classList.remove("show");
});
document.getElementById("postViewsSort").addEventListener("change", function () {
  postViewsPage = 1;
  renderPostViewsModal();
});

function renderPostViewsModal() {
  const sortMode = document.getElementById("postViewsSort").value;
  let posts = loadPosts().map((p) => ({ ...p, _views: getViewsForPost(p.id) }));

  posts.sort((a, b) => {
    if (sortMode === "views_desc") return b._views - a._views;
    if (sortMode === "views_asc") return a._views - b._views;
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    return sortMode === "terlama" ? ta - tb : tb - ta;
  });

  const list = document.getElementById("postViewsList");
  if (posts.length === 0) {
    list.innerHTML = `<div class="empty-state"><h3>Belum ada postingan</h3></div>`;
    renderPagination("postViewsPagination", 0, PAGE_SIZE, 1, () => {});
    return;
  }

  const totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  if (postViewsPage > totalPages) postViewsPage = totalPages;
  const start = (postViewsPage - 1) * PAGE_SIZE;
  const pagePosts = posts.slice(start, start + PAGE_SIZE);

  list.innerHTML = pagePosts
    .map(
      (p) => `
    <div class="post-view-item">
      <img src="${resolveAdminAsset(p.thumbnail)}" alt="">
      <div class="pvi-body">
        <div class="pvi-title">${escapeHtmlAdmin(p.title)}</div>
        <div class="pvi-meta">${escapeHtmlAdmin(p.jenis)} • ${
        p.published === false ? '<span class="draft-label">Draft</span>' : escapeHtmlAdmin(formatDate(p.date))
      }</div>
      </div>
      <div class="pvi-count">Jumlah Views:<br>${p._views}</div>
    </div>`
    )
    .join("");

  renderPagination("postViewsPagination", posts.length, PAGE_SIZE, postViewsPage, (page) => {
    postViewsPage = page;
    renderPostViewsModal();
  });
}

// =========================================================
// RECYCLE BIN
// =========================================================
let trashViewType = "posts"; // "posts" | "reports"
let trashSearchQuery = "";
let trashSortMode = "az"; // az | za | newest | oldest
let trashPage = 1;

function renderRecycleBinCounts() {
  document.getElementById("trashPostCount").textContent = loadTrashPosts().length;
  document.getElementById("trashReportCount").textContent = loadTrashReports().length;
}

function openTrashList(type) {
  trashViewType = type;
  trashSearchQuery = "";
  trashSortMode = "az";
  trashPage = 1;
  document.getElementById("trashSearchInput").value = "";
  document.getElementById("trashSortSelect").value = "az";
  document.getElementById("recycleBinListHeading").textContent = type === "posts" ? "Postingan" : "Laporan";
  showSub("viewRecycleBinList");
  renderTrashList();
}

function getFilteredTrash() {
  const raw = trashViewType === "posts" ? loadTrashPosts() : loadTrashReports();
  const q = trashSearchQuery.trim().toLowerCase();
  const filtered = q ? raw.filter((item) => (item.title || "").toLowerCase().includes(q)) : raw.slice();
  filtered.sort((a, b) => {
    if (trashSortMode === "az") return (a.title || "").localeCompare(b.title || "");
    if (trashSortMode === "za") return (b.title || "").localeCompare(a.title || "");
    if (trashSortMode === "newest") return new Date(b.deletedAt) - new Date(a.deletedAt);
    return new Date(a.deletedAt) - new Date(b.deletedAt); // oldest
  });
  return filtered;
}

function findTrashItem(id) {
  const raw = trashViewType === "posts" ? loadTrashPosts() : loadTrashReports();
  return raw.find((item) => item.id === id);
}

function renderTrashList() {
  const filtered = getFilteredTrash();
  const list = document.getElementById("trashList");

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><h3>Recycle Bin kosong</h3></div>`;
    renderPagination("trashPagination", 0, PAGE_SIZE, 1, () => {});
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (trashPage > totalPages) trashPage = totalPages;
  const start = (trashPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  list.innerHTML = pageItems
    .map(
      (item) => `
    <div class="trash-item" data-id="${item.id}">
      <div class="trash-item-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <div class="trash-item-title">${escapeHtmlAdmin(item.title || "(Tanpa judul)")}</div>
        <button type="button" class="trash-item-menu-btn" data-menu-toggle="${item.id}">⋮</button>
      </div>
      <div class="trash-item-menu hidden" data-menu="${item.id}">
        <button type="button" data-action="preview" data-id="${item.id}">Buka Preview</button>
        <button type="button" data-action="detail" data-id="${item.id}">Detail</button>
        <button type="button" data-action="restore" data-id="${item.id}">Pulihkan</button>
        <button type="button" class="danger" data-action="delete" data-id="${item.id}">Hapus Permanen</button>
      </div>
    </div>`
    )
    .join("");

  list.querySelectorAll("[data-menu-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-menu-toggle");
      const menu = list.querySelector(`[data-menu="${id}"]`);
      const wasHidden = menu.classList.contains("hidden");
      list.querySelectorAll(".trash-item-menu").forEach((m) => m.classList.add("hidden"));
      if (wasHidden) menu.classList.remove("hidden");
    });
  });

  list.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      list.querySelectorAll(".trash-item-menu").forEach((m) => m.classList.add("hidden"));
      if (action === "preview") openTrashPreview(id);
      else if (action === "detail") openTrashDetail(id);
      else if (action === "restore") restoreTrashItem(id);
      else if (action === "delete") deleteTrashItemPermanently(id);
    });
  });

  renderPagination("trashPagination", filtered.length, PAGE_SIZE, trashPage, (page) => {
    trashPage = page;
    renderTrashList();
  });
}

// Tutup dropdown menu ⋮ kalau klik di luar area menu.
document.addEventListener("click", function () {
  document.querySelectorAll(".trash-item-menu").forEach((m) => m.classList.add("hidden"));
});

document.getElementById("trashSearchInput").addEventListener("input", function () {
  trashSearchQuery = this.value;
  trashPage = 1;
  renderTrashList();
});
document.getElementById("trashSortSelect").addEventListener("change", function () {
  trashSortMode = this.value;
  trashPage = 1;
  renderTrashList();
});

function restoreTrashItem(id) {
  const item = findTrashItem(id);
  if (!item) return;
  const label = trashViewType === "posts" ? "postingan" : "laporan";
  openConfirmModal(
    `Pulihkan "${item.title}"? Item akan dikembalikan ke daftar ${label} aktif.`,
    function () {
      restoreFromTrash(trashViewType, id);
      renderTrashList();
      renderRecycleBinCounts();
      showToast("Berhasil dipulihkan");
    },
    { title: "Pulihkan", confirmLabel: "Ya, Pulihkan" }
  );
}

function deleteTrashItemPermanently(id) {
  const item = findTrashItem(id);
  if (!item) return;
  openConfirmModal(
    `Hapus permanen "${item.title}"? Tindakan ini TIDAK BISA dibatalkan.`,
    function () {
      permanentlyDeleteFromTrash(trashViewType, id);
      renderTrashList();
      renderRecycleBinCounts();
      showToast("Item dihapus permanen");
    },
    { title: "Hapus Permanen", confirmLabel: "Ya, Hapus Permanen" }
  );
}

document.getElementById("btnRestoreAllTrash").addEventListener("click", function () {
  const filtered = getFilteredTrash();
  if (filtered.length === 0) return;
  const label = trashViewType === "posts" ? "postingan" : "laporan";
  openConfirmModal(
    `Pulihkan semua (${filtered.length}) ${label} yang ditampilkan?`,
    function () {
      restoreAllFromTrash(
        trashViewType,
        filtered.map((i) => i.id)
      );
      trashPage = 1;
      renderTrashList();
      renderRecycleBinCounts();
      showToast("Semua item dipulihkan");
    },
    { title: "Pulihkan Semua", confirmLabel: "Ya, Pulihkan Semua" }
  );
});

document.getElementById("btnDeleteAllTrash").addEventListener("click", function () {
  const filtered = getFilteredTrash();
  if (filtered.length === 0) return;
  const label = trashViewType === "posts" ? "postingan" : "laporan";
  openConfirmModal(
    `Hapus permanen semua (${filtered.length}) ${label} yang ditampilkan? Tindakan ini TIDAK BISA dibatalkan.`,
    function () {
      permanentlyDeleteAllFromTrash(
        trashViewType,
        filtered.map((i) => i.id)
      );
      trashPage = 1;
      renderTrashList();
      renderRecycleBinCounts();
      showToast("Semua item dihapus permanen");
    },
    { title: "Hapus Permanen Semua", confirmLabel: "Ya, Hapus Semua" }
  );
});

// ---------- Modal: Preview item Recycle Bin ----------
const trashPreviewModalBackdrop = document.getElementById("trashPreviewModalBackdrop");
function openTrashPreview(id) {
  const item = findTrashItem(id);
  if (!item) return;
  const body = document.getElementById("trashPreviewBody");
  if (trashViewType === "posts") {
    body.innerHTML = `
      <h1 class="post-detail-title" style="margin-top:0;">${escapeHtmlAdmin(item.title)}</h1>
      <img class="post-detail-img" src="${resolveAdminAsset(item.thumbnail)}" alt="">
      <div class="post-detail-content">${item.content}</div>
    `;
    initSpoilersAdmin(body);
  } else {
    function row(label, value, isEmpty) {
      return `
        <div class="vrb-row">
          <div class="vrb-label">${escapeHtmlAdmin(label)}</div>
          <div class="vrb-value${isEmpty ? " empty" : ""}">${isEmpty ? value : escapeHtmlAdmin(value)}</div>
        </div>`;
    }
    let html = "";
    html += row("Judul Laporan", item.title, false);
    html += row("Nama", item.name || "Anonim", !item.name);
    html += row("Media Balasan", item.contactMedia || "Tidak diisi", !item.contactMedia);
    html += row("Isi Laporan", item.content, false);
    if (item.attachment) {
      html += `
        <div class="vrb-row">
          <div class="vrb-label">Lampiran</div>
          <div class="vrb-value">
            <a class="rep-attachment" href="${item.attachment.dataUrl}" download="${escapeHtmlAdmin(item.attachment.name)}">${escapeHtmlAdmin(item.attachment.name)}</a>
          </div>
        </div>`;
    }
    body.innerHTML = html;
  }
  trashPreviewModalBackdrop.classList.add("show");
}
document.getElementById("btnCloseTrashPreview").addEventListener("click", function () {
  trashPreviewModalBackdrop.classList.remove("show");
});
trashPreviewModalBackdrop.addEventListener("click", function (e) {
  if (e.target === trashPreviewModalBackdrop) trashPreviewModalBackdrop.classList.remove("show");
});

// ---------- Modal: Detail item Recycle Bin ----------
const trashDetailModalBackdrop = document.getElementById("trashDetailModalBackdrop");
function openTrashDetail(id) {
  const item = findTrashItem(id);
  if (!item) return;
  const body = document.getElementById("trashDetailBody");
  body.innerHTML = `
    <div class="vrb-row">
      <div class="vrb-label">Judul</div>
      <div class="vrb-value">${escapeHtmlAdmin(item.title || "(Tanpa judul)")}</div>
    </div>
    <div class="vrb-row">
      <div class="vrb-label">Dihapus pada</div>
      <div class="vrb-value">${escapeHtmlAdmin(formatReportDate(item.deletedAt))}</div>
    </div>
  `;
  trashDetailModalBackdrop.classList.add("show");
}
document.getElementById("btnCloseTrashDetail").addEventListener("click", function () {
  trashDetailModalBackdrop.classList.remove("show");
});
trashDetailModalBackdrop.addEventListener("click", function (e) {
  if (e.target === trashDetailModalBackdrop) trashDetailModalBackdrop.classList.remove("show");
});

// ---------- Toast ----------
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

// =========================================================
// PWA Admin Panel: "Tambah ke Layar Utama" + Service Worker
// Sengaja pakai manifest terpisah (admin-manifest.json, start_url
// admin.html) supaya kalau di-install jadi app sendiri, ikonnya di
// layar utama langsung membuka Admin Panel — bukan situs publik.
// =========================================================
let deferredAdminInstallPrompt = null;

window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  deferredAdminInstallPrompt = e;
});
window.addEventListener("appinstalled", function () {
  deferredAdminInstallPrompt = null;
});

(function initAdminPWA() {
  const btn = document.getElementById("btnInstallAdminPWA");
  if (!btn) return;

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (isStandalone) {
    btn.style.display = "none";
  } else {
    btn.addEventListener("click", async function () {
      if (deferredAdminInstallPrompt) {
        deferredAdminInstallPrompt.prompt();
        try {
          await deferredAdminInstallPrompt.userChoice;
        } catch (err) {
          /* diabaikan */
        }
        deferredAdminInstallPrompt = null;
      } else {
        alert(
          "Browser ini belum menawarkan instalasi otomatis (atau Admin Panel sudah terpasang).\n\n" +
            "Di iPhone/iPad: buka menu Share lalu pilih \"Tambah ke Layar Utama\".\n" +
            "Di HP/PC lain: cari ikon Install di address bar browser."
        );
      }
    });
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(function () {
        /* diabaikan — Admin Panel tetap berjalan normal tanpa Service Worker */
      });
    });
  }
})();

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

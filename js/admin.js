/* =========================================================
   Fueeru Game — Admin Panel logic
   Kata sandi (sementara): admin123
   Recovery: kode OTP dikirim ke email admin
   ========================================================= */

const SESSION_KEY = "fueeru_admin_session";
const REMEMBER_KEY = "fueeru_admin_remember";
const PAGE_SIZE = 10;
const DATA_VERSION = "1.0"; // versi format file backup JSON (Postingan & Halaman)

let editingId = null; // null = mode tambah, string = mode edit
let currentGenres = []; // genre yang sedang dipilih di form
let publishMode = "baru"; // "baru" | "sebelumnya" | "terjadwal"
let scheduledAt = null; // ISO datetime string hasil "Atur Postingan Terjadwal", atau null

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
  fetchServerNotifications();
  startServerNotificationsPolling();
}

/** Ambil notifikasi deploy dari server (dikirim GitHub lewat webhook tiap
 * kali status Actions berubah final), lalu gabungkan ke notifikasi lokal.
 * Berlaku untuk commit dari mana saja: Admin Panel, Termux, atau GitHub.com. */
async function fetchServerNotifications() {
  if (!isLoggedIn()) return;
  try {
    const items = await apiCall("GET", "/api/notifications", undefined, true);
    if (Array.isArray(items) && items.length > 0) {
      items.forEach((n) => addNotification(n.type, n.text));
      updateNotifBadge();
      if (notifModalBackdrop.classList.contains("show")) renderNotifModal();
    }
  } catch (e) {
    // gagal ambil -> coba lagi di siklus berikutnya, tidak fatal
  }
}

let serverNotifIntervalId = null;
function startServerNotificationsPolling() {
  if (serverNotifIntervalId) return;
  serverNotifIntervalId = setInterval(fetchServerNotifications, 30000);
}

function doLogout() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  clearAdminSessionPassword();
  document.getElementById("passwordInput").value = "";
  document.getElementById("rememberMeInput").checked = false;
  document.getElementById("loginError").textContent = "";
  adminShell.classList.add("hidden");
  viewLogin.classList.remove("hidden");
}

document.getElementById("loginForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const val = document.getElementById("passwordInput").value;
  const errorEl = document.getElementById("loginError");
  const remember = document.getElementById("rememberMeInput").checked;
  errorEl.textContent = "Memeriksa…";
  const ok = await checkAdminPassword(val);
  if (ok) {
    setAdminSessionPassword(val);
    errorEl.textContent = "";
    doLogin(remember);
  } else {
    errorEl.textContent = "Kata sandi salah. Coba lagi.";
  }
});

// ---------- Modal: Notifikasi Lupa Kata Sandi (Error / Terkirim) ----------
const otpNotifModalBackdrop = document.getElementById("otpNotifModalBackdrop");
function openOtpNotif(title, message) {
  document.getElementById("otpNotifModalTitle").textContent = title;
  document.getElementById("otpNotifModalMessage").textContent = message;
  otpNotifModalBackdrop.classList.add("show");
}
function closeOtpNotif() {
  otpNotifModalBackdrop.classList.remove("show");
}
document.getElementById("btnCloseOtpNotif").addEventListener("click", closeOtpNotif);
otpNotifModalBackdrop.addEventListener("click", function (e) {
  if (e.target === otpNotifModalBackdrop) closeOtpNotif();
});

// ---------- Recovery Password (OTP via email) ----------
document.getElementById("btnForgotPassword").addEventListener("click", function (e) {
  e.preventDefault();
  document.getElementById("otpStep1").classList.remove("hidden");
  document.getElementById("recoveryForm").classList.add("hidden");
  document.getElementById("recoveryForm").reset();
  document.getElementById("otpEmailInput").value = "";
  document.getElementById("recoveryError").textContent = "";
  document.getElementById("otpRequestMsg").textContent = "";
  viewLogin.classList.add("hidden");
  viewRecovery.classList.remove("hidden");
});
document.getElementById("btnBackToLogin").addEventListener("click", function (e) {
  e.preventDefault();
  viewRecovery.classList.add("hidden");
  viewLogin.classList.remove("hidden");
});

async function sendOtp(msgEl) {
  const email = document.getElementById("otpEmailInput").value.trim();
  if (!email) {
    openOtpNotif("Error", "Masukkan email admin terlebih dahulu");
    return;
  }
  msgEl.textContent = "Mengirim…";
  try {
    await requestPasswordResetOtp(email);
    msgEl.textContent = "";
    document.getElementById("otpStep1").classList.add("hidden");
    document.getElementById("recoveryForm").classList.remove("hidden");
    openOtpNotif("Terkirim", "Kode terkirim ke " + email + ". Cek inbox (atau folder spam).");
  } catch (e) {
    msgEl.textContent = "";
    openOtpNotif("Error", e.message || "Gagal mengirim kode. Coba lagi.");
  }
}

document.getElementById("btnRequestOtp").addEventListener("click", function () {
  sendOtp(document.getElementById("otpRequestMsg"));
});
document.getElementById("btnResendOtp").addEventListener("click", function (e) {
  e.preventDefault();
  sendOtp(document.getElementById("recoveryError"));
});

document.getElementById("recoveryForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const codeVal = document.getElementById("otpCodeInput").value.trim();
  const newVal = document.getElementById("newPasswordRecoveryInput").value;
  const errorEl = document.getElementById("recoveryError");

  if (newVal.trim().length < 4) {
    openOtpNotif("Error", "Kata sandi baru minimal 4 karakter.");
    return;
  }
  errorEl.textContent = "Memproses…";
  try {
    await verifyOtpAndResetPassword(codeVal, newVal.trim());
    setAdminSessionPassword(newVal.trim());
    errorEl.textContent = "";
    viewRecovery.classList.add("hidden");
    doLogin();
    showToast("Kata sandi berhasil diubah");
  } catch (e) {
    errorEl.textContent = "";
    openOtpNotif("Error", e.message || "Kode OTP salah atau sudah kedaluwarsa.");
  }
});

/** Tampilkan window peringatan konfirmasi keluar dari Admin Panel. Dipakai
 * baik oleh tombol "Keluar" maupun oleh tombol back HP saat berada di menu
 * utama Admin Panel (lihat penanganan popstate di bawah). */
function confirmLogout() {
  openConfirmModal(
    "Yakin ingin keluar dari Admin Panel?",
    doLogout,
    { title: "Keluar dari Admin Panel", confirmLabel: "Ya, Keluar" }
  );
}
/** Pesan yang tampil saat mengklik navigasi bar kiri (tampilan desktop)
 * padahal belum login. */
const loginWarningModalBackdrop = document.getElementById("loginWarningModalBackdrop");
function requireLoginAlert() {
  loginWarningModalBackdrop.classList.add("show");
}
function closeLoginWarning() {
  loginWarningModalBackdrop.classList.remove("show");
}
document.getElementById("btnCloseLoginWarning").addEventListener("click", closeLoginWarning);
loginWarningModalBackdrop.addEventListener("click", function (e) {
  if (e.target === loginWarningModalBackdrop) closeLoginWarning();
});

// ---------- Modal: Info Instalasi PWA (pengganti alert() bawaan browser) ----------
const installInfoModalBackdrop = document.getElementById("installInfoModalBackdrop");
document.getElementById("btnCloseInstallInfo").addEventListener("click", function () {
  installInfoModalBackdrop.classList.remove("show");
});
installInfoModalBackdrop.addEventListener("click", function (e) {
  if (e.target === installInfoModalBackdrop) installInfoModalBackdrop.classList.remove("show");
});

document.getElementById("btnLogout").addEventListener("click", function () {
  if (!isLoggedIn()) {
    requireLoginAlert();
    return;
  }
  confirmLogout();
});

// ---------- Navigasi bar kiri (tampilan desktop) ----------
// Item menu di sidebar kiri hanya aktif kalau sudah login; kalau belum,
// tampilkan pesan peringatan. "Tambah ke Layar Utama" & "Kembali ke
// Website" tetap bisa dipakai kapan saja.
document.querySelectorAll("#adminSidebarDesktop .admin-menu-card").forEach(function (btn) {
  btn.addEventListener("click", function () {
    if (!isLoggedIn()) {
      requireLoginAlert();
      return;
    }
    const target = document.getElementById(btn.getAttribute("data-target"));
    if (target) target.click();
  });
});
document.getElementById("sidebarInstallPWA").addEventListener("click", function () {
  const original = document.getElementById("btnInstallAdminPWA");
  if (original) original.click();
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
  "viewBackupPosts",
  "viewBackupPages",
  "viewBackupWebsite",
  "viewDeployWebsite",
  "viewInfo",
  "viewInfoDasar",
  "viewInfoStatistik",
  "viewInfoPostinganHalaman",
  "viewInfoPerforma",
  "viewInfoRiwayatCommit",
  "viewInfoKeamanan",
  "viewRedirect",
  "viewRedirectTampilan",
  "viewRedirectDaftarLink",
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
  postStatusFilterValue = "all";
  const statusFilterEl = document.getElementById("postStatusFilter");
  statusFilterEl.value = "all";
  refreshCustomSelect(statusFilterEl);
  postsPage = 1;
  showSub("viewPosts");
  renderPostsList();
});
document.getElementById("menuHalaman").addEventListener("click", () => {
  showSub("viewPages");
});
document.getElementById("btnBackFromPages").addEventListener("click", () => showSub("viewMenu"));
document.getElementById("btnBackFromPageEdit").addEventListener("click", () => {
  goBackFromPageEdit();
});

// ---------- Edit Halaman (Tutorial Main / Cara Download / Donasi / Tentang) ----------
let currentEditingPageId = null;
const editorContentPageEl = document.getElementById("editorContentPage");

document.querySelectorAll("#viewPages .gradient-menu-card").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const pageId = btn.getAttribute("data-page-id");
    const pageLabel = btn.querySelector(".gmc-title").textContent;
    currentEditingPageId = pageId;
    document.getElementById("pageEditHeading").textContent = pageLabel;
    const pc = await getPageContent(pageId);
    editorContentPageEl.innerHTML = pc.content;
    initImgGalleriesAdmin(editorContentPageEl);
    if (richPageEditor) richPageEditor.resetHistory();
    showSub("viewPageEdit");
    capturePageFormSnapshot();
  });
});

document.getElementById("btnSavePage").addEventListener("click", async function () {
  if (!currentEditingPageId) return;
  const result = await savePageContent(currentEditingPageId, editorContentPageEl.innerHTML.trim());
  if (result === "error") {
    showToast("Gagal menyimpan — coba lagi.");
    return;
  }
  capturePageFormSnapshot();
  showToast("Halaman disimpan");
});

document.getElementById("btnPreviewPage").addEventListener("click", function () {
  const content = editorContentPageEl.innerHTML.trim() || "<p><em>(Isi halaman masih kosong)</em></p>";
  previewViewportInner.innerHTML = `
    <div class="preview-badge">Pratinjau — belum disimpan</div>
    <h1 class="post-detail-title">${escapeHtmlAdmin(document.getElementById("pageEditHeading").textContent)}</h1>
    <div class="post-detail-content">${content}</div>
  `;
  initSpoilersAdmin(previewViewportInner);
  initImgGalleriesAdmin(previewViewportInner);
  previewModalBackdrop.classList.add("show");
  applyPreviewDeviceMode("mobile");
});

// ---------- Deteksi perubahan yang belum disimpan (Edit Halaman) ----------
let pageFormSnapshot = null;
function capturePageFormSnapshot() {
  pageFormSnapshot = editorContentPageEl.innerHTML.trim();
}
function isPageFormDirty() {
  if (pageFormSnapshot === null) return false;
  return editorContentPageEl.innerHTML.trim() !== pageFormSnapshot;
}
function goBackFromPageEdit(onLeft) {
  if (isPageFormDirty()) {
    openConfirmModal(
      "Halaman belum disimpan, yakin ingin kembali dan membatalkannya?",
      function () {
        showSub("viewPages");
        if (onLeft) onLeft();
      },
      { title: "Batalkan Perubahan", confirmLabel: "Ya, Kembali" }
    );
  } else {
    showSub("viewPages");
    if (onLeft) onLeft();
  }
}

document.getElementById("menuLihatLaporan").addEventListener("click", () => {
  reportSearchQuery = "";
  document.getElementById("reportSearchInput").value = "";
  reportsPage = 1;
  showSub("viewReports");
  renderReportsList();
});
document.getElementById("menuInformasiWeb").addEventListener("click", () => {
  showSub("viewInfo");
});
document.getElementById("btnBackFromInfo").addEventListener("click", () => showSub("viewMenu"));

document.getElementById("menuRedirect").addEventListener("click", () => {
  showSub("viewRedirect");
});
document.getElementById("btnBackFromRedirect").addEventListener("click", () => showSub("viewMenu"));

document.getElementById("menuRedirectTampilan").addEventListener("click", () => {
  showSub("viewRedirectTampilan");
  renderRedirectSections();
});
document.getElementById("btnBackFromRedirectTampilan").addEventListener("click", () => showSub("viewRedirect"));

document.getElementById("menuRedirectDaftarLink").addEventListener("click", () => {
  redirectLinkSearchQuery = "";
  document.getElementById("redirectLinkSearchInput").value = "";
  showSub("viewRedirectDaftarLink");
  renderRedirectLinksList();
});
document.getElementById("btnBackFromRedirectDaftarLink").addEventListener("click", () => showSub("viewRedirect"));

document.getElementById("menuInfoDasar").addEventListener("click", async () => {
  showSub("viewInfoDasar");
  await renderInfoDasar();
});
document.getElementById("btnBackFromInfoDasar").addEventListener("click", () => showSub("viewInfo"));

document.getElementById("menuInfoStatistik").addEventListener("click", async () => {
  showSub("viewInfoStatistik");
  await renderInfoStatistik();
});
document.getElementById("btnBackFromInfoStatistik").addEventListener("click", () => showSub("viewInfo"));

document.getElementById("menuInfoPostinganHalaman").addEventListener("click", async () => {
  showSub("viewInfoPostinganHalaman");
  await renderInfoPostinganHalaman();
});
document.getElementById("btnBackFromInfoPostinganHalaman").addEventListener("click", () => showSub("viewInfo"));

document.getElementById("menuInfoPerforma").addEventListener("click", async () => {
  showSub("viewInfoPerforma");
  await renderInfoPerforma();
});
document.getElementById("btnBackFromInfoPerforma").addEventListener("click", () => showSub("viewInfo"));

document.getElementById("menuInfoRiwayatCommit").addEventListener("click", async () => {
  commitHistoryPage = 1;
  showSub("viewInfoRiwayatCommit");
  await renderCommitHistory();
});
document.getElementById("btnBackFromInfoRiwayatCommit").addEventListener("click", () => showSub("viewInfo"));

document.getElementById("menuInfoKeamanan").addEventListener("click", async () => {
  showSub("viewInfoKeamanan");
  await renderInfoKeamanan();
});
document.getElementById("btnBackFromInfoKeamanan").addEventListener("click", () => showSub("viewInfo"));

document.getElementById("btnRefreshAllInfo").addEventListener("click", async function () {
  const btn = this;
  btn.classList.remove("is-spinning");
  void btn.offsetWidth; // restart animasi kalau diklik berkali-kali
  btn.classList.add("is-spinning");
  btn.disabled = true;

  commitHistoryPage = 1;
  const results = await Promise.allSettled([
    renderInfoDasar(),
    renderInfoStatistik(),
    renderInfoPostinganHalaman(),
    renderInfoPerforma(),
    renderCommitHistory(),
    renderInfoKeamanan()
  ]);
  const failed = results.filter((r) => r.status === "rejected").length;

  btn.disabled = false;
  setTimeout(() => btn.classList.remove("is-spinning"), 650);
  showToast(
    failed === 0
      ? "Semua informasi berhasil diperbarui"
      : `Sebagian informasi gagal diperbarui (${failed}/${results.length})`
  );
});
document.getElementById("menuManajemenFile").addEventListener("click", async () => {
  showSub("viewFiles");
  await loadFilesIfNeeded();
  navigateToFolder("");
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
  renderBackupDatesInfo();
  showSub("viewBackup");
});
document.getElementById("btnBackFromBackup").addEventListener("click", () => showSub("viewMenu"));
document.getElementById("btnOpenBackupPosts").addEventListener("click", () => {
  resetRestoreForm();
  updateBackupPostCount();
  showSub("viewBackupPosts");
});
document.getElementById("btnOpenBackupPages").addEventListener("click", () => {
  resetRestorePagesForm();
  showSub("viewBackupPages");
});
document.getElementById("btnBackFromBackupPosts").addEventListener("click", () => {
  renderBackupDatesInfo();
  showSub("viewBackup");
});
document.getElementById("btnBackFromBackupPages").addEventListener("click", () => {
  renderBackupDatesInfo();
  showSub("viewBackup");
});
document.getElementById("btnOpenBackupWebsite").addEventListener("click", () => {
  showSub("viewBackupWebsite");
});
document.getElementById("btnBackFromBackupWebsite").addEventListener("click", () => {
  renderBackupDatesInfo();
  showSub("viewBackup");
});
document.getElementById("btnOpenDeployWebsite").addEventListener("click", () => {
  resetDeployForm();
  showSub("viewDeployWebsite");
});
document.getElementById("btnBackFromDeployWebsite").addEventListener("click", () => {
  renderBackupDatesInfo();
  showSub("viewBackup");
});
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
// seluruh panel admin. Dan kalau sudah di menu utama, tombol back HP
// berperilaku SAMA seperti menekan tombol "Keluar" (tampilkan window
// peringatan dulu, jangan langsung menutup Admin Panel).
//
// Caranya: kita selalu menjaga agar selalu ada 1 history entry
// "jebakan" (trap) tersisa selama masih login & berada di dalam
// Admin Panel (termasuk saat di viewMenu), sehingga 1x tombol back HP
// hanya akan memicu event popstate (kita tangani sendiri), bukan
// benar-benar menutup halaman. Trap ini dipasang pertama kali saat
// login (doLogin) maupun saat sesi lama dipulihkan setelah refresh
// (lihat DOMContentLoaded).
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
  if (!current) return;

  if (current === "viewMenu") {
    // Sudah di menu utama Admin Panel -> perlakukan tombol back HP SAMA
    // seperti menekan tombol "Keluar": tampilkan window peringatan dulu,
    // jangan langsung menutup Admin Panel. Pasang lagi trap-nya supaya
    // "pop" yang barusan terjadi tidak langsung meninggalkan halaman
    // selagi modal konfirmasi masih terbuka / kalau dibatalkan.
    pushBackTrap();
    confirmLogout();
    return;
  }

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
    if (isPageFormDirty()) {
      pushBackTrap();
    }
    goBackFromPageEdit(function () {
      pushBackTrap(); // sudah pindah ke viewPages -> pasang trap lagi
    });
    return;
  }

  if (current === "viewBackupPosts" || current === "viewBackupPages") {
    renderBackupDatesInfo();
    showSub("viewBackup");
    pushBackTrap();
    return;
  }

  if (
    current === "viewInfoDasar" ||
    current === "viewInfoStatistik" ||
    current === "viewInfoPostinganHalaman" ||
    current === "viewInfoPerforma" ||
    current === "viewInfoRiwayatCommit" ||
    current === "viewInfoKeamanan"
  ) {
    showSub("viewInfo");
    pushBackTrap();
    return;
  }

  if (current === "viewRedirectTampilan" || current === "viewRedirectDaftarLink") {
    showSub("viewRedirect");
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
/** Fallback kalau src thumbnail gagal dimuat (mis. data lama menunjuk
 * ke file yang tak pernah benar-benar ada, seperti "postheader/..."). */
function adminThumbFallbackAttr() {
  return `onerror="this.onerror=null;this.src='${resolveAdminAsset("webpictures/postplaceholder.webp")}';"`;
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

/** Aktifkan navigasi kiri/kanan untuk galeri gambar (hasil upload banyak
 * gambar sekaligus) di dalam `container` — dipakai baik di editor
 * (contenteditable, supaya bisa dicek sambil menulis) maupun Preview.
 * Geser antar gambar pakai transform (bukan scroll manual). Galeri
 * berisi 1 gambar saja: tombol navigasi otomatis disembunyikan. */
function initImgGalleriesAdmin(container) {
  (container || document).querySelectorAll(".img-gallery").forEach((gallery) => {
    // PENTING: pakai properti JS biasa (bukan dataset/atribut HTML) untuk
    // penanda "sudah dipasangi event". Kalau pakai dataset (data-*), atribut
    // itu ikut ke-serialize ke editorContent.innerHTML saat postingan
    // disimpan — akibatnya begitu HTML yang tersimpan itu dimuat ulang di
    // tempat lain (Preview, halaman publik), penanda itu sudah "ada" duluan
    // padahal event click di konteks BARU itu belum pernah dipasang sama
    // sekali, jadi tombol navigasi terlihat tapi tidak berfungsi.
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

/** Bangun markup HTML galeri gambar dari daftar dataURL. Kalau cuma 1
 * gambar, kembalikan <img> polos (perilaku lama, tanpa pembungkus). */
function buildImgGalleryHtml(dataUrls) {
  if (dataUrls.length <= 1) {
    return `<img src="${dataUrls[0]}" alt="">`;
  }
  const imgs = dataUrls.map((u) => `<img src="${u}" alt="">`).join("");
  return (
    `<span class="img-gallery" contenteditable="false">` +
    `<span class="img-gallery-track">${imgs}</span>` +
    `<button type="button" class="img-gallery-nav prev" aria-label="Gambar sebelumnya">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>` +
    `<button type="button" class="img-gallery-nav next" aria-label="Gambar berikutnya">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>` +
    `</span>`
  );
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
let postStatusFilterValue = "all";
let postsPage = 1;

document.getElementById("postSearchInput").addEventListener("input", function () {
  postSearchQuery = this.value.trim().toLowerCase();
  postsPage = 1;
  renderPostsList();
});

/** "all" | "published" | "draft" | "scheduled" — sama seperti label yang
 * ditampilkan di tiap kartu postingan (Dipublish/Draft/Terjadwal). */
function getPostStatus(p) {
  if (p.published === false) return "draft";
  if (p.scheduledAt && new Date(p.scheduledAt).getTime() > Date.now()) return "scheduled";
  return "published";
}

document.getElementById("postStatusFilter").addEventListener("change", function () {
  postStatusFilterValue = this.value;
  postsPage = 1;
  renderPostsList();
});

async function renderPostsList() {
  let posts = (await loadPosts()).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  if (postSearchQuery) {
    posts = posts.filter((p) => p.title.toLowerCase().includes(postSearchQuery));
  }
  if (postStatusFilterValue !== "all") {
    posts = posts.filter((p) => getPostStatus(p) === postStatusFilterValue);
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
      <img src="${resolveAdminAsset(p.thumbnail)}" alt="" ${adminThumbFallbackAttr()}>
      <div class="api-body">
        <div class="api-title">${escapeHtmlAdmin(p.title)}</div>
        <div class="api-meta">${escapeHtmlAdmin(p.jenis)} • ${
        p.published === false
          ? '<span class="draft-label">Draft</span>'
          : p.scheduledAt && new Date(p.scheduledAt).getTime() > Date.now()
          ? '<span class="scheduled-label">Terjadwal</span>'
          : escapeHtmlAdmin(formatDate(p.date))
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

async function deletePost(id) {
  const post = await getPostById(id);
  if (!post) return;
  openConfirmModal(
    `Hapus postingan "${post.title}"? Postingan akan dipindahkan ke Recycle Bin dan bisa dipulihkan dalam 30 hari.`,
    async function () {
      await trashPost(id);
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
const fieldPlatform = document.getElementById("fieldPlatform");
const fieldBahasa = document.getElementById("fieldBahasa");
const fieldJenis = document.getElementById("fieldJenis");
const editorContent = document.getElementById("editorContent");
const uploadPreview = document.getElementById("uploadPreview");
const uploadLabel = document.getElementById("uploadLabel");
let currentThumbnailData = "";

function populatePlatformSelect() {
  fieldPlatform.innerHTML = PLATFORM_OPTIONS.map((o) => `<option value="${o}">${o}</option>`).join("");
}
function populateBahasaSelect() {
  fieldBahasa.innerHTML = BAHASA_LIST.map((b) => `<option value="${b}">${b}</option>`).join("");
}
function populateJenisSelect() {
  fieldJenis.innerHTML = JENIS_LIST.map((j) => `<option value="${j}">${j}</option>`).join("");
}

/* =========================================================
   Custom Select — pengganti window pilihan bawaan browser/OS
   untuk semua elemen <select> di Admin Panel (Platform, Bahasa,
   Jenis Game, dan semua opsi sorting). Elemen <select> aslinya
   tetap ada di DOM (cuma disembunyikan secara visual) sebagai
   penyimpan nilai sebenarnya, supaya kode lain yang membaca/
   menulis `.value`-nya tidak perlu diubah — tombol & menu custom
   di atasnya cuma tampilan pengganti window bawaan browser.
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
          escapeHtmlAdmin(o.value) +
          '" class="' +
          (o.value === select.value ? "selected" : "") +
          '">' +
          escapeHtmlAdmin(o.textContent) +
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
 * dipanggil setiap kali kode mengubah `.value` select secara terprogram
 * (bukan lewat klik user di menu custom). */
function refreshCustomSelect(select) {
  if (!select) return;
  const entry = customSelectRegistry[select.id];
  if (entry) entry.syncLabel();
}

["fieldPlatform", "fieldBahasa", "fieldJenis", "fileSortSelect", "trashSortSelect", "postViewsSort", "postStatusFilter"].forEach(
  function (id) {
    const el = document.getElementById(id);
    if (el) buildCustomSelect(el);
  }
);

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

async function showGenreSuggestions() {
  const val = genreInputField.value.trim().toLowerCase();
  if (!val) {
    hideGenreSuggestions();
    return;
  }
  const allGenres = await getAllGenresAdmin();
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
// Fallback untuk keyboard virtual (Android/mobile) yang tidak selalu
// mengirim event "keydown" Enter yang bisa di-preventDefault — beberapa
// keyboard langsung memicu event "input" dengan inputType
// "insertLineBreak" saat tombol Enter/Done ditekan, dan fokus otomatis
// pindah ke field berikutnya (bug yang dilaporkan: pindah ke "Isi
// Postingan"). Tangani juga inputType ini supaya tetap membuat genre
// baru, bukan pindah fokus.
genreInputField.addEventListener("beforeinput", function (e) {
  if (e.inputType === "insertLineBreak") {
    e.preventDefault();
    addGenre(genreInputField.value);
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
  populatePlatformSelect();
  fieldPlatform.value = PLATFORM_OPTIONS[0];
  refreshCustomSelect(fieldPlatform);
  populateBahasaSelect();
  fieldBahasa.value = BAHASA_LIST[0];
  refreshCustomSelect(fieldBahasa);
  populateJenisSelect();
  fieldJenis.value = JENIS_LIST[0];
  refreshCustomSelect(fieldJenis);
  currentGenres = [];
  renderGenreChips();
  genreInputField.value = "";
  editorContent.innerHTML = "";
  if (richPostEditor) richPostEditor.resetHistory();
  document.getElementById("formHeading").textContent = "Tambah Postingan";
  // Opsi "Publish dengan waktu sebelumnya" hanya ada di Edit Postingan.
  document.getElementById("publishModePrevWrap").classList.add("hidden");
  publishMode = "baru";
  scheduledAt = null;
  const radioBaru = document.querySelector('input[name="publishMode"][value="baru"]');
  if (radioBaru) radioBaru.checked = true;
  clearPublishFormMsg();
  updateScheduleButtonState();
}

function openAddForm() {
  resetForm();
  showSub("viewForm");
  fieldTitle.focus({ preventScroll: true });
  captureFormSnapshot();
}

async function openEditForm(id) {
  const post = await getPostById(id);
  if (!post) return;
  resetForm();
  editingId = id;
  document.getElementById("formHeading").textContent = "Edit Postingan";
  fieldTitle.value = post.title;
  populatePlatformSelect();
  fieldPlatform.value = platformTagsToOption(post.platform);
  refreshCustomSelect(fieldPlatform);
  populateBahasaSelect();
  fieldBahasa.value = post.bahasa || BAHASA_LIST[0];
  refreshCustomSelect(fieldBahasa);
  populateJenisSelect();
  fieldJenis.value = post.jenis;
  refreshCustomSelect(fieldJenis);
  currentGenres = (post.genres || []).slice();
  renderGenreChips();
  editorContent.innerHTML = post.content;
  initImgGalleriesAdmin(editorContent);
  currentThumbnailData = post.thumbnail;
  uploadPreview.src = resolveAdminAsset(post.thumbnail);
  uploadPreview.style.display = "block";
  uploadLabel.textContent = "Klik untuk mengganti gambar header";
  document.getElementById("publishModePrevWrap").classList.remove("hidden");
  // Kalau postingan ini masih punya jadwal yang belum tiba waktunya,
  // tampilkan opsi & waktunya di form supaya tidak hilang begitu saja.
  if (post.scheduledAt && new Date(post.scheduledAt).getTime() > Date.now()) {
    publishMode = "terjadwal";
    scheduledAt = post.scheduledAt;
    const radioTerjadwal = document.querySelector('input[name="publishMode"][value="terjadwal"]');
    if (radioTerjadwal) radioTerjadwal.checked = true;
  }
  updateScheduleButtonState();
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
    platform: fieldPlatform.value,
    bahasa: fieldBahasa.value,
    jenis: fieldJenis.value,
    genres: currentGenres.slice(),
    content: editorContent.innerHTML.trim(),
    thumbnail: currentThumbnailData || "",
    publishMode: publishMode,
    scheduledAt: scheduledAt || ""
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

  // Klik tombol toolbar TIDAK boleh menghilangkan fokus/seleksi teks yang
  // sedang aktif di contentEl (perilaku default browser: elemen yang
  // disentuh/di-klik akan mengambil fokus & menutup keyboard + kehilangan
  // seleksi lama). PENTING untuk mobile: ini HARUS dicegah di event
  // "pointerdown" (bukan cuma "mousedown"), karena di Android/Chrome,
  // keyboard virtual sudah mulai ditutup begitu jari MENYENTUH tombol
  // (touchstart/pointerdown) — jauh sebelum event "mousedown" sintetis
  // sempat menyusul, jadi preventDefault di "mousedown" saja sudah
  // terlambat (itulah sebabnya keyboard sempat tertutup lalu terbuka lagi
  // / layar seperti "melompat", persis keluhan auto-scroll). Pointer
  // Events (bukan Touch Events lama) dipilih karena preventDefault di
  // sini TIDAK menekan event "click" yang menyusul, jadi tombolnya tetap
  // berfungsi normal.
  toolbarEl.addEventListener("pointerdown", function (e) {
    if (e.target.closest("button")) e.preventDefault();
  });
  // Fallback untuk browser sangat lama yang belum kenal Pointer Events.
  toolbarEl.addEventListener("mousedown", function (e) {
    if (e.target.closest("button")) e.preventDefault();
  });

  // Fokuskan kembali contentEl TANPA memicu auto-scroll (preventScroll)
  // dan TANPA membuka ulang keyboard virtual kalau contentEl memang
  // sudah menjadi elemen yang fokus saat ini (mis. tombol toolbar
  // ditekan sesaat setelah teks diseleksi — fokus tidak pernah benar-
  // benar hilang berkat preventDefault di atas, jadi tidak perlu
  // fokus ulang yang bisa memicu keyboard muncul lagi di mobile).
  function focusEditor() {
    if (document.activeElement !== contentEl) {
      contentEl.focus({ preventScroll: true });
    }
  }

  // ---------- Highlight "icon area" tombol toolbar saat ditekan ----------
  // Semua tombol toolbar (SELAIN tombol format teks Bold/Italic/
  // Underline/Strikethrough, yang statusnya persisten — lihat
  // updateFormatButtonsState) hanya menyala selama benar-benar ditekan
  // (pointerdown) dan langsung padam saat dilepas
  // (pointerup/pointercancel/pointerleave/mouseleave). Dipasang lewat
  // delegasi + listener global supaya konsisten di semua browser mobile.
  let pressedToolbarBtn = null;
  function clearToolbarPress() {
    if (pressedToolbarBtn) {
      pressedToolbarBtn.classList.remove("tb-pressing");
      pressedToolbarBtn = null;
    }
  }
  toolbarEl.addEventListener("pointerdown", function (e) {
    const btn = e.target.closest("button");
    if (btn) {
      pressedToolbarBtn = btn;
      btn.classList.add("tb-pressing");
    }
  });
  ["pointerup", "pointercancel", "pointerleave", "mouseup", "mouseleave"].forEach(function (evt) {
    document.addEventListener(evt, clearToolbarPress);
  });

  // ---------- Riwayat Undo/Redo kustom ----------
  // document.execCommand("undo"/"redo") bawaan browser HANYA mencatat
  // perubahan yang dilakukan lewat execCommand. Aksi manual di editor ini
  // (spoiler, label, ukuran huruf, sisip gambar/link, ubah kapital, clear
  // format, dll) memanipulasi DOM secara langsung sehingga tidak tercatat
  // oleh riwayat bawaan — akibatnya undo/redo bawaan jadi tidak sinkron,
  // gagal menghapus format tsb, atau malah merusak isi editor.
  // Solusinya: riwayat kustom berbasis snapshot innerHTML yang mencakup
  // SEMUA jenis aksi (toolbar maupun pengetikan biasa).
  const HISTORY_LIMIT = 100;
  const TYPING_DEBOUNCE_MS = 600;
  let undoStack = [];
  let redoStack = [];
  let isRestoringHistory = false;
  let typingSessionActive = false;
  let typingDebounceTimer = null;

  function snapshot() {
    return contentEl.innerHTML;
  }

  // Simpan state SEBELUM sebuah perubahan terjadi. Dipanggil di awal
  // setiap aksi toolbar (sebelum DOM-nya diubah) supaya undo bisa
  // mengembalikan tepat ke kondisi sebelum aksi tsb dilakukan.
  function recordBeforeChange() {
    if (isRestoringHistory) return;
    const html = snapshot();
    if (undoStack.length && undoStack[undoStack.length - 1] === html) return;
    undoStack.push(html);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
  }

  function placeCursorAtEnd() {
    const range = document.createRange();
    range.selectNodeContents(contentEl);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    savedSelectionRange = range.cloneRange();
  }

  function applyHistoryState(html) {
    isRestoringHistory = true;
    contentEl.innerHTML = html;
    isRestoringHistory = false;
    typingSessionActive = false;
    clearTimeout(typingDebounceTimer);
    focusEditor();
    placeCursorAtEnd();
    initImgGalleriesAdmin(contentEl);
  }

  function doUndo() {
    if (!undoStack.length) return;
    focusEditor();
    const current = snapshot();
    const prev = undoStack.pop();
    redoStack.push(current);
    applyHistoryState(prev);
  }

  function doRedo() {
    if (!redoStack.length) return;
    focusEditor();
    const current = snapshot();
    const next = redoStack.pop();
    undoStack.push(current);
    applyHistoryState(next);
  }

  // Reset riwayat setiap kali isi editor dimuat ulang secara terprogram
  // (form baru dibuka, postingan/halaman lain dipilih untuk diedit),
  // supaya undo tidak "bocor" ke sesi edit sebelumnya.
  function resetHistory() {
    undoStack = [];
    redoStack = [];
    typingSessionActive = false;
    clearTimeout(typingDebounceTimer);
  }

  // Pengetikan biasa (huruf per huruf) dikelompokkan jadi satu langkah
  // undo per "sesi" (dipisah oleh jeda >600ms), meniru editor pada
  // umumnya, memakai event beforeinput supaya snapshot diambil TEPAT
  // sebelum karakter tsb benar-benar disisipkan ke DOM.
  contentEl.addEventListener("beforeinput", function () {
    if (isRestoringHistory) return;
    if (!typingSessionActive) {
      recordBeforeChange();
      typingSessionActive = true;
    }
    clearTimeout(typingDebounceTimer);
    typingDebounceTimer = setTimeout(function () {
      typingSessionActive = false;
    }, TYPING_DEBOUNCE_MS);
  });

  // Tombol Undo/Redo pada keyboard (Ctrl/Cmd+Z, Ctrl/Cmd+Y atau
  // Ctrl/Cmd+Shift+Z) juga dialihkan ke riwayat kustom, supaya tidak
  // memicu undo bawaan browser yang bermasalah.
  contentEl.addEventListener("keydown", function (e) {
    const key = e.key ? e.key.toLowerCase() : "";
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || key !== "z" && key !== "y") return;
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      doUndo();
    } else if (key === "y" || (key === "z" && e.shiftKey)) {
      e.preventDefault();
      doRedo();
    }
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
    focusEditor();
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

  // ---------- Status persisten tombol format teks (Bold/Italic/Underline/Strike) ----------
  // Berbeda dari tombol lain (yang "icon area"-nya cuma nyala selagi
  // ditekan), 4 tombol ini punya status AKTIF/NONAKTIF yang bertahan:
  // begitu ditekan, langsung aktif (highlight menyala) dan teks yang
  // diketik selanjutnya memakai format tsb; ditekan lagi -> nonaktif.
  // queryCommandState mengikuti status toggle bawaan browser tsb
  // (termasuk saat kursor berpindah-pindah tanpa seleksi).
  const FORMAT_TOGGLE_CMDS = ["bold", "italic", "underline", "strikeThrough"];
  function updateFormatButtonsState() {
    const isFocused = document.activeElement === contentEl;
    FORMAT_TOGGLE_CMDS.forEach(function (cmd) {
      const btn = toolbarEl.querySelector('button[data-cmd="' + cmd + '"]');
      if (!btn) return;
      let active = false;
      if (isFocused) {
        try { active = document.queryCommandState(cmd); } catch (err) { active = false; }
      }
      btn.classList.toggle("tb-format-active", active);
    });
  }
  document.addEventListener("selectionchange", updateFormatButtonsState);

  // ---------- Tombol format dasar (data-cmd) ----------
  toolbarEl.addEventListener("click", function (e) {
    const cmdBtn = e.target.closest("button[data-cmd]");
    if (!cmdBtn) return;
    const cmd = cmdBtn.getAttribute("data-cmd");
    if (cmd === "undo") { doUndo(); return; }
    if (cmd === "redo") { doRedo(); return; }
    focusEditor();
    recordBeforeChange();
    document.execCommand(cmd, false, null);
    updateFormatButtonsState();
  });

  // ---------- Ukuran Teks (dropdown px + navigasi perkecil/perbesar) ----------
  // Trigger menampilkan ukuran teks (px) pada posisi kursor/seleksi saat
  // ini secara live (mengikuti pola editor umum: pilih teks dulu, baru
  // ubah nilainya; berpindah ke teks lain otomatis memperbarui angka
  // sesuai ukuran asli teks tsb — lihat updateFsDisplay via selectionchange).
  const fsBtnEl = document.getElementById(cfg.fsBtnId);
  const fsMenuEl = document.getElementById(cfg.fsMenuId);
  const fsValueLabelEl = document.getElementById(cfg.fsValueLabelId);
  const fsStepValueEl = document.getElementById(cfg.fsStepValueId);
  const fsStepDownEl = document.getElementById(cfg.fsStepDownId);
  const fsStepUpEl = document.getElementById(cfg.fsStepUpId);
  const FS_MIN = 8;
  const FS_MAX = 96;
  let currentFsPx = 15;
  let activeFsSpan = null; // span ukuran terakhir yang diubah, supaya klik +/- berulang tidak bikin span bersarang

  function getSelectionFontSizePx() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !contentEl.contains(sel.anchorNode)) return null;
    let node = sel.anchorNode;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (!node || !contentEl.contains(node)) return null;
    const px = parseFloat(window.getComputedStyle(node).fontSize);
    return isNaN(px) ? null : Math.round(px);
  }

  function updateFsDisplay() {
    const px = getSelectionFontSizePx();
    if (px == null) return;
    currentFsPx = px;
    fsValueLabelEl.textContent = px + "px";
    fsStepValueEl.textContent = px + "px";
  }
  document.addEventListener("selectionchange", updateFsDisplay);

  function selectionMatchesSpan(span) {
    if (!span || !contentEl.contains(span)) return false;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    const spanRange = document.createRange();
    spanRange.selectNodeContents(span);
    try {
      return range.compareBoundaryPoints(Range.START_TO_START, spanRange) === 0 &&
        range.compareBoundaryPoints(Range.END_TO_END, spanRange) === 0;
    } catch (err) {
      return false;
    }
  }

  function stepFontSize(delta) {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentEl.contains(sel.anchorNode)) {
      showToast("Pilih teks yang ingin diubah ukurannya terlebih dahulu");
      return;
    }
    const newPx = Math.max(FS_MIN, Math.min(FS_MAX, (currentFsPx || 15) + delta));
    recordBeforeChange();
    if (selectionMatchesSpan(activeFsSpan)) {
      // Seleksi masih persis span yang barusan kita ubah — update saja,
      // jangan bungkus lagi (mencegah span bersarang tak berguna).
      activeFsSpan.style.fontSize = newPx + "px";
      const newRange = document.createRange();
      newRange.selectNodeContents(activeFsSpan);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedSelectionRange = newRange.cloneRange();
    } else {
      const span = document.createElement("span");
      span.style.fontSize = newPx + "px";
      if (!wrapSelection(span)) { undoStack.pop(); return; }
      activeFsSpan = span;
    }
    currentFsPx = newPx;
    fsValueLabelEl.textContent = newPx + "px";
    fsStepValueEl.textContent = newPx + "px";
  }

  fsBtnEl.addEventListener("click", function (e) {
    e.stopPropagation();
    saveSelection();
    activeRichEditor = api;
    updateFsDisplay();
    fsMenuEl.classList.toggle("show");
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#" + cfg.fsWrapId)) fsMenuEl.classList.remove("show");
  });
  fsStepDownEl.addEventListener("click", function (e) { e.stopPropagation(); stepFontSize(-1); });
  fsStepUpEl.addEventListener("click", function (e) { e.stopPropagation(); stepFontSize(1); });

  // ---------- Sisipkan Gambar (kini bisa upload banyak gambar sekaligus) ----------
  document.getElementById(cfg.insertImageBtnId).addEventListener("click", function () {
    saveSelection();
    document.getElementById(cfg.imageInputId).click();
  });

  document.getElementById(cfg.imageInputId).addEventListener("change", function (e) {
    const files = e.target.files ? Array.prototype.slice.call(e.target.files) : [];
    e.target.value = "";
    if (!files.length) return;
    Promise.all(files.map((f) => compressImageFile(f, 1000, 0.8)))
      .then(function (dataUrls) {
        restoreSelection();
        recordBeforeChange();
        const sel = window.getSelection();
        const range = sel.getRangeAt(0);
        range.deleteContents();
        // >1 gambar diupload bersamaan -> gabung jadi satu galeri geser
        // (bukan disisip satu-satu berurutan) supaya tombol navigasi
        // kiri/kanannya cuma perlu tersedia untuk kumpulan itu.
        const wrapper = document.createElement("span");
        wrapper.innerHTML = buildImgGalleryHtml(dataUrls);
        const node = wrapper.firstChild;
        range.insertNode(node);
        initImgGalleriesAdmin(contentEl);
        range.setStartAfter(node);
        range.setEndAfter(node);
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
    resetLinkModal();
    linkTextInput.value = savedSelectionRange ? savedSelectionRange.toString() : "";
    linkModalBackdrop.classList.add("show");
    setTimeout(() => linkUrlInput.focus({ preventScroll: true }), 100);
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
      recordBeforeChange();
      document.execCommand("foreColor", false, color);
    }
    colorSwatchMenuEl.classList.remove("show");
  });

  // ---------- Kutipan ----------
  document.getElementById(cfg.quoteBtnId).addEventListener("click", function () {
    focusEditor();
    recordBeforeChange();
    document.execCommand("formatBlock", false, "blockquote");
  });

  // ---------- Ubah huruf besar/kecil (siklus: kecil -> BESAR -> Kapital Awal) ----------
  document.getElementById(cfg.caseToggleBtnId).addEventListener("click", function () {
    focusEditor();
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
    recordBeforeChange();
    range.deleteContents();
    const textNode = document.createTextNode(next);
    range.insertNode(textNode);
    const newRange = document.createRange();
    newRange.selectNode(textNode);
    sel.removeAllRanges();
    sel.addRange(newRange);
    savedSelectionRange = newRange.cloneRange();
  });

  // Sisipkan sebuah baris kosong (div+br) TEPAT SETELAH `node`, supaya
  // selalu ada tempat mengetik di LUAR fungsi toolbar (Quote/Spoiler/
  // Label) tanpa harus menekan Enter dulu untuk keluar dari fungsi tsb.
  function insertBlankLineAfter(node) {
    const line = document.createElement("div");
    line.appendChild(document.createElement("br"));
    if (node.nextSibling) {
      node.parentNode.insertBefore(line, node.nextSibling);
    } else {
      node.parentNode.appendChild(line);
    }
    return line;
  }

  // Tempatkan kursor collapsed di awal `el` (dipakai supaya kursor
  // langsung berada DI DALAM spoiler/label yang baru dibuat kosong).
  function placeCursorInside(el) {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    savedSelectionRange = r.cloneRange();
  }

  // ---------- Spoiler ----------
  // Bungkus teks dan/atau gambar yang dipilih ke dalam kotak spoiler:
  // label "SPOILER" yang bisa diklik pengunjung untuk membuka isinya.
  // Kalau tidak ada teks yang diseleksi, buat kotak spoiler kosong berisi
  // 1 baris kosong yang langsung siap ditulisi/diisi gambar.
  document.getElementById(cfg.spoilerBtnId).addEventListener("click", function () {
    focusEditor();
    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && contentEl.contains(sel.anchorNode);

    const label = document.createElement("span");
    label.className = "spoiler-label";
    label.setAttribute("contenteditable", "false");
    label.textContent = "SPOILER";

    const inner = document.createElement("span");
    inner.className = "spoiler-inner";

    const wrapper = document.createElement("span");
    wrapper.className = "spoiler-content";
    wrapper.appendChild(label);
    wrapper.appendChild(inner);

    if (hasSelection) {
      const range = sel.getRangeAt(0);
      if (!contentEl.contains(range.commonAncestorContainer)) return;
      recordBeforeChange();
      let extracted;
      try {
        extracted = range.extractContents();
      } catch (err) {
        undoStack.pop();
        showToast("Gagal membuat spoiler pada seleksi ini");
        return;
      }
      if (!extracted || !extracted.hasChildNodes()) {
        undoStack.pop();
        showToast("Gagal membuat spoiler pada seleksi ini");
        return;
      }
      inner.appendChild(extracted);
      range.insertNode(wrapper);
      insertBlankLineAfter(wrapper);
      const newRange = document.createRange();
      newRange.setStartAfter(wrapper);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedSelectionRange = newRange.cloneRange();
    } else {
      // Tanpa seleksi: sisipkan spoiler kosong (1 baris kosong di
      // dalamnya) tepat di posisi kursor.
      inner.appendChild(document.createElement("br"));
      recordBeforeChange();
      let range;
      if (sel && sel.rangeCount > 0 && contentEl.contains(sel.anchorNode)) {
        range = sel.getRangeAt(0);
      } else {
        range = document.createRange();
        range.selectNodeContents(contentEl);
        range.collapse(false);
      }
      range.deleteContents();
      range.insertNode(wrapper);
      insertBlankLineAfter(wrapper);
      placeCursorInside(inner);
    }
  });

  // ---------- Label ----------
  // Bungkus teks (bisa lebih dari 1 paragraf) yang dipilih dengan kotak
  // berborder biru muda (mirip kotak pembungkus di menu Informasi Web).
  // Kalau tidak ada teks yang diseleksi, buat kotak Label kosong berisi
  // 1 baris kosong yang langsung siap ditulisi.
  document.getElementById(cfg.labelBtnId).addEventListener("click", function () {
    focusEditor();
    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && contentEl.contains(sel.anchorNode);

    if (hasSelection) {
      recordBeforeChange();
      const div = document.createElement("div");
      div.className = "label-box";
      if (!wrapSelection(div)) {
        undoStack.pop();
        showToast("Gagal membuat Label pada seleksi ini");
        return;
      }
      insertBlankLineAfter(div);
    } else {
      const div = document.createElement("div");
      div.className = "label-box";
      div.appendChild(document.createElement("br"));
      recordBeforeChange();
      let range;
      if (sel && sel.rangeCount > 0 && contentEl.contains(sel.anchorNode)) {
        range = sel.getRangeAt(0);
      } else {
        range = document.createRange();
        range.selectNodeContents(contentEl);
        range.collapse(false);
      }
      range.deleteContents();
      range.insertNode(div);
      insertBlankLineAfter(div);
      placeCursorInside(div);
    }
  });

  // ---------- Enter di dalam Spoiler / Label ----------
  // Perilaku default browser saat Enter ditekan di dalam elemen blok
  // (spoiler-inner span yang di-display:block, atau label-box div) bisa
  // "meloncat keluar" dan malah membuat kotak baru terpisah di luar,
  // bukan menambah baris baru di DALAM kotak yang sama. Di sini Enter
  // dipaksa selalu menyisipkan <br> di posisi kursor, supaya baris baru
  // tetap berada di dalam fungsi (spoiler/label) yang sedang diedit.
  // (Toolbar Kutipan/blockquote sudah otomatis benar secara bawaan,
  // jadi tidak perlu ditangani di sini.)
  contentEl.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || e.shiftKey) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const stayInsideEl = node && node.closest ? node.closest(".spoiler-inner, .label-box") : null;
    if (!stayInsideEl || !contentEl.contains(stayInsideEl)) return;
    e.preventDefault();
    recordBeforeChange();
    document.execCommand("insertLineBreak");
  });

  // ---------- Clear All Formatting ----------
  // Hapus SELURUH format pada SELURUH isi editor (warna, ukuran,
  // bold/italic/underline/strikethrough, link, kutipan, spoiler, label,
  // dll) begitu ikon ditekan — tanpa perlu memilih teks terlebih dahulu
  // — dan kembalikan semua teks ke tampilan default. Gambar TIDAK
  // dihapus, hanya dikeluarkan dari pembungkus formatnya (mis. spoiler)
  // apa adanya.
  const BLOCK_TAGS_CLEAR = ["P", "DIV", "BLOCKQUOTE", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6"];
  function flattenForClearFormat(sourceNode, outParent) {
    Array.prototype.forEach.call(sourceNode.childNodes, function (child) {
      if (child.nodeType === Node.TEXT_NODE) {
        outParent.appendChild(document.createTextNode(child.textContent));
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      if (child.tagName === "IMG") {
        outParent.appendChild(child.cloneNode(true));
        return;
      }
      if (child.tagName === "BR") {
        outParent.appendChild(document.createElement("br"));
        return;
      }
      if (child.classList && child.classList.contains("spoiler-label")) {
        // Label "SPOILER" sintetis (bukan konten asli) — buang saja.
        return;
      }
      const isBlock = BLOCK_TAGS_CLEAR.indexOf(child.tagName) !== -1 ||
        (child.classList && child.classList.contains("label-box"));
      flattenForClearFormat(child, outParent);
      if (isBlock) outParent.appendChild(document.createElement("br"));
    });
  }

  document.getElementById(cfg.clearFormatBtnId).addEventListener("click", function () {
    focusEditor();
    if (!contentEl.hasChildNodes()) {
      showToast("Konten masih kosong, tidak ada format untuk dihapus");
      return;
    }
    recordBeforeChange();
    const frag = document.createDocumentFragment();
    flattenForClearFormat(contentEl, frag);
    while (frag.lastChild && frag.lastChild.nodeName === "BR") {
      frag.removeChild(frag.lastChild);
    }
    contentEl.innerHTML = "";
    contentEl.appendChild(frag);
    placeCursorAtEnd();
    showToast("Semua format pada isi teks telah dihapus");
  });

  const api = { saveSelection, restoreSelection, contentEl, recordBeforeChange, resetHistory };
  return api;
}

function toTitleCase(str) {
  return str.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ---------- Modal bersama: Sisipkan Link (dipakai oleh semua editor) ----------
const linkModalBackdrop = document.getElementById("linkModalBackdrop");
const linkUrlInput = document.getElementById("linkUrlInput");
const linkTextInput = document.getElementById("linkTextInput");
const linkModeTeksWrap = document.getElementById("linkModeTeksWrap");
const linkModeGambarWrap = document.getElementById("linkModeGambarWrap");
const linkImageInput = document.getElementById("linkImageInput");
const linkImagePreview = document.getElementById("linkImagePreview");
const linkImageUploadLabel = document.getElementById("linkImageUploadLabel");
const linkModalError = document.getElementById("linkModalError");
let activeRichEditor = null; // editor mana yang sedang memakai modal link / dropdown warna / dropdown ukuran teks
let linkImageData = null; // dataURL gambar yang sudah diupload di dalam modal link

function hideLinkModalError() {
  linkModalError.classList.add("hidden");
  linkModalError.textContent = "";
}

function resetLinkModal() {
  linkUrlInput.value = "";
  linkTextInput.value = "";
  linkImageData = null;
  linkImageInput.value = "";
  linkImagePreview.src = "";
  linkImagePreview.style.display = "none";
  linkImageUploadLabel.textContent = "Klik untuk upload gambar";
  hideLinkModalError();
  const teksRadio = document.querySelector('input[name="linkMode"][value="teks"]');
  if (teksRadio) teksRadio.checked = true;
  linkModeTeksWrap.classList.remove("hidden");
  linkModeGambarWrap.classList.add("hidden");
}

document.querySelectorAll('input[name="linkMode"]').forEach(function (radio) {
  radio.addEventListener("change", function () {
    if (!radio.checked) return;
    hideLinkModalError();
    if (radio.value === "gambar") {
      linkModeTeksWrap.classList.add("hidden");
      linkModeGambarWrap.classList.remove("hidden");
    } else {
      linkModeGambarWrap.classList.add("hidden");
      linkModeTeksWrap.classList.remove("hidden");
    }
  });
});

linkUrlInput.addEventListener("input", hideLinkModalError);

linkImageInput.addEventListener("change", function () {
  const file = linkImageInput.files && linkImageInput.files[0];
  if (!file) return;
  linkImageUploadLabel.textContent = "Memproses gambar…";
  compressImageFile(file, 1000, 0.8)
    .then(function (dataUrl) {
      linkImageData = dataUrl;
      linkImagePreview.src = dataUrl;
      linkImagePreview.style.display = "block";
      linkImageUploadLabel.textContent = "Klik untuk mengganti gambar";
      hideLinkModalError();
    })
    .catch(function () {
      linkImageUploadLabel.textContent = "Klik untuk upload gambar";
      showToast("Gagal memproses gambar, coba gambar lain");
    });
});

document.getElementById("btnCancelLink").addEventListener("click", function () {
  linkModalBackdrop.classList.remove("show");
});
linkModalBackdrop.addEventListener("click", function (e) {
  if (e.target === linkModalBackdrop) linkModalBackdrop.classList.remove("show");
});

document.getElementById("btnConfirmLink").addEventListener("click", function () {
  if (!activeRichEditor) return;
  const url = linkUrlInput.value.trim();
  const mode = document.querySelector('input[name="linkMode"]:checked').value;

  if (!url) {
    linkModalError.textContent = "Masukkan Link terlebih dahulu!";
    linkModalError.classList.remove("hidden");
    linkUrlInput.focus({ preventScroll: true });
    return;
  }
  if (mode === "gambar" && !linkImageData) {
    linkModalError.textContent = "Upload gambar terlebih dahulu!";
    linkModalError.classList.remove("hidden");
    return;
  }
  hideLinkModalError();

  activeRichEditor.restoreSelection();
  activeRichEditor.recordBeforeChange();
  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  if (mode === "gambar") {
    const img = document.createElement("img");
    img.src = linkImageData;
    img.alt = "";
    a.appendChild(img);
  } else {
    const text = linkTextInput.value.trim() || url;
    a.style.color = "#2fa8e0";
    a.style.textDecoration = "underline";
    a.textContent = text;
  }
  range.insertNode(a);
  range.setStartAfter(a);
  range.setEndAfter(a);
  sel.removeAllRanges();
  sel.addRange(range);
  linkModalBackdrop.classList.remove("show");
});

// ---------- Instance editor: Isi Postingan ----------
const richPostEditor = initRichTextEditor({
  toolbarId: "editorToolbar",
  contentId: "editorContent",
  insertImageBtnId: "btnInsertImage",
  imageInputId: "contentImageInput",
  insertLinkBtnId: "btnInsertLink",
  colorBtnId: "btnTextColor",
  colorMenuId: "colorSwatchMenu",
  colorWrapId: "colorDropdownWrap",
  fsWrapId: "fsDropdownWrap",
  fsBtnId: "btnFontSize",
  fsMenuId: "fsStepperMenu",
  fsValueLabelId: "fsValueLabel",
  fsStepValueId: "fsStepValue",
  fsStepDownId: "fsStepDown",
  fsStepUpId: "fsStepUp",
  quoteBtnId: "btnQuote",
  caseToggleBtnId: "btnCaseToggle",
  spoilerBtnId: "btnSpoiler",
  labelBtnId: "btnLabel",
  clearFormatBtnId: "btnClearFormat"
});

// ---------- Instance editor: Edit Halaman ----------
const richPageEditor = initRichTextEditor({
  toolbarId: "editorToolbarPage",
  contentId: "editorContentPage",
  insertImageBtnId: "btnInsertImagePage",
  imageInputId: "contentImageInputPage",
  insertLinkBtnId: "btnInsertLinkPage",
  colorBtnId: "btnTextColorPage",
  colorMenuId: "colorSwatchMenuPage",
  colorWrapId: "colorDropdownWrapPage",
  fsWrapId: "fsDropdownWrapPage",
  fsBtnId: "btnFontSizePage",
  fsMenuId: "fsStepperMenuPage",
  fsValueLabelId: "fsValueLabelPage",
  fsStepValueId: "fsStepValuePage",
  fsStepDownId: "fsStepDownPage",
  fsStepUpId: "fsStepUpPage",
  quoteBtnId: "btnQuotePage",
  caseToggleBtnId: "btnCaseTogglePage",
  spoilerBtnId: "btnSpoilerPage",
  labelBtnId: "btnLabelPage",
  clearFormatBtnId: "btnClearFormatPage"
});

// =========================================================
// Preview Postingan
// =========================================================
const previewModalBackdrop = document.getElementById("previewModalBackdrop");
const previewModalBody = document.getElementById("previewModalBody");
const previewViewport = document.getElementById("previewViewport");
const previewViewportInner = document.getElementById("previewViewportInner");
const btnPreviewMobile = document.getElementById("btnPreviewMobile");
const btnPreviewDesktop = document.getElementById("btnPreviewDesktop");
const PREVIEW_DESKTOP_WIDTH = 900; // lebar simulasi kolom konten desktop (px)
let previewDeviceMode = "mobile";

/** Render ulang tampilan preview sesuai mode aktif (Mobile/Desktop).
 * Mode Desktop me-render konten pada lebar 900px lalu diperkecil (transform
 * scale) supaya pas di dalam modal — sehingga reflow teksnya otentik sama
 * seperti dilihat di layar lebar, bukan sekadar font yang diperkecil. */
function applyPreviewDeviceMode(mode) {
  previewDeviceMode = mode;
  btnPreviewMobile.classList.toggle("active", mode === "mobile");
  btnPreviewDesktop.classList.toggle("active", mode === "desktop");

  if (mode === "desktop") {
    previewViewportInner.style.width = PREVIEW_DESKTOP_WIDTH + "px";
    const paneWidth = previewViewport.clientWidth;
    const scale = paneWidth / PREVIEW_DESKTOP_WIDTH;
    previewViewportInner.style.transform = `scale(${scale})`;
    previewViewport.style.height = (previewViewportInner.scrollHeight * scale) + "px";
  } else {
    previewViewportInner.style.width = "";
    previewViewportInner.style.transform = "";
    previewViewport.style.height = "";
  }
}
btnPreviewMobile.addEventListener("click", () => applyPreviewDeviceMode("mobile"));
btnPreviewDesktop.addEventListener("click", () => applyPreviewDeviceMode("desktop"));

function closePreviewModal() {
  previewModalBackdrop.classList.remove("show");
}
document.getElementById("btnClosePreviewForm2").addEventListener("click", closePreviewModal);
previewModalBackdrop.addEventListener("click", function (e) {
  if (e.target === previewModalBackdrop) closePreviewModal();
});

document.getElementById("btnPreviewForm").addEventListener("click", async function () {
  const title = fieldTitle.value.trim() || "(Judul belum diisi)";
  const platformTags = platformOptionToTags(fieldPlatform.value);
  const bahasa = fieldBahasa.value;
  const jenis = fieldJenis.value;
  const genres = currentGenres.slice();
  const content = editorContent.innerHTML.trim() || "<p><em>(Isi postingan masih kosong)</em></p>";
  const thumbnail =
    currentThumbnailData ||
    (editingId ? ((await getPostById(editingId)) || {}).thumbnail : null) ||
    "webpictures/postplaceholder.webp";

  previewViewportInner.innerHTML = `
    <div class="preview-badge">Pratinjau — belum dipublikasikan</div>
    <h1 class="post-detail-title">${escapeHtmlAdmin(title)}</h1>
    <img class="post-detail-img" src="${resolveAdminAsset(thumbnail)}" alt="" ${adminThumbFallbackAttr()}>
    <div class="post-detail-content">${content}</div>
    <div class="post-detail-meta">
      <span><strong>Tanggal:</strong> ${escapeHtmlAdmin(formatReportDate(new Date().toISOString()))}</span>
      <span class="pill">${escapeHtmlAdmin(jenis)}</span>
      ${platformTags.map((t) => `<span class="pill">${escapeHtmlAdmin(t)}</span>`).join("")}
      <span class="pill">${escapeHtmlAdmin(bahasa)}</span>
    </div>
    ${genres.length ? `<div class="genre-chip-row" style="margin-top:12px;">${genres.map((g) => `<span class="genre-chip">${escapeHtmlAdmin(g)}</span>`).join("")}</div>` : ""}
  `;
  // Spoiler di preview sebelumnya tidak berfungsi sama sekali —
  // pasang handler toggle yang sama seperti di halaman publik.
  initSpoilersAdmin(previewViewportInner);
  initImgGalleriesAdmin(previewViewportInner);
  previewModalBackdrop.classList.add("show");
  applyPreviewDeviceMode("mobile");
});

// ---------- Simpan (draft) / Publish ----------
/** Ambil & validasi field form. Return null kalau tidak valid (judul kosong). */
function readPostFormFields() {
  const title = fieldTitle.value.trim();
  if (!title) {
    fieldTitle.focus({ preventScroll: true });
    return null;
  }
  return {
    title,
    content: editorContent.innerHTML.trim(),
    platform: platformOptionToTags(fieldPlatform.value),
    bahasa: fieldBahasa.value,
    jenis: fieldJenis.value,
    genres: currentGenres.slice()
  };
}

/** Simpan form. publish=true -> Publish (postingan jadi live, tampil di
 * publik). publish=false -> Simpan (draft, TIDAK tampil di publik) —
 * berlaku apa adanya setiap kali ditekan, tidak peduli status
 * sebelumnya, supaya "Simpan" selalu berarti draft dan "Publish" selalu
 * berarti live.
 * Saat publish=true, publishMode ("baru" / "sebelumnya" / "terjadwal")
 * menentukan tanggal & jadwal yang dipakai — lihat opsi di bawah tombol
 * Preview/Simpan.
 * Return: "ok" | "invalid" (judul kosong) | "storage-full" (localStorage
 * penuh, biasanya karena gambar terlalu besar — lihat compressImageFile). */
async function savePostForm(publish) {
  const fields = readPostFormFields();
  if (!fields) return "invalid";
  const { title, content, platform, bahasa, jenis, genres } = fields;
  let newPostId = null;

  const useSchedule = publish && publishMode === "terjadwal" && !!scheduledAt;

  try {
    if (editingId) {
      const existing = await getPostById(editingId);
      if (existing) {
        let dateToUse = existing.date;
        let scheduledAtToUse = existing.scheduledAt || null;

        if (publish) {
          if (useSchedule) {
            dateToUse = scheduledAt.slice(0, 10);
            scheduledAtToUse = scheduledAt;
          } else if (publishMode === "sebelumnya") {
            dateToUse = existing.date;
            scheduledAtToUse = null;
          } else {
            dateToUse = new Date().toISOString().slice(0, 10);
            scheduledAtToUse = null;
          }
        }

        await updatePost(editingId, {
          ...existing,
          title,
          platform,
          bahasa,
          jenis,
          genres,
          content,
          thumbnail: currentThumbnailData || existing.thumbnail,
          published: publish,
          date: dateToUse,
          scheduledAt: scheduledAtToUse
        });
      }
    } else {
      const dateToUse = useSchedule ? scheduledAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const newPost = {
        title,
        platform,
        bahasa,
        jenis,
        genres,
        date: dateToUse,
        thumbnail: currentThumbnailData || "webpictures/postplaceholder.webp",
        content,
        published: publish,
        scheduledAt: useSchedule ? scheduledAt : null
      };
      const res = await createPost(newPost);
      newPostId = res.id;
    }
  } catch (e) {
    return "storage-full";
  }

  if (newPostId) {
    editingId = newPostId;
    document.getElementById("formHeading").textContent = "Edit Postingan";
    document.getElementById("publishModePrevWrap").classList.remove("hidden");
  }
  captureFormSnapshot();
  return "ok";
}

document.getElementById("btnSaveDraft").addEventListener("click", async function () {
  clearPublishFormMsg();
  const result = await savePostForm(false);
  if (result === "invalid") return;
  if (result === "storage-full") {
    showToast("Gagal menyimpan — coba lagi.");
    return;
  }
  showToast("Postingan Disimpan");
  // Sengaja TIDAK pindah ke Menu Atur Postingan — tetap di form.
});

document.getElementById("postForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  clearPublishFormMsg();
  if (publishMode === "terjadwal" && !scheduledAt) {
    showPublishFormMsg("Postingan terjadwal belum disetel, gagal mempublish postingan");
    return;
  }
  const wasEditing = !!editingId;
  const result = await savePostForm(true);
  if (result === "invalid") return;
  if (result === "storage-full") {
    showToast("Gagal menyimpan — coba lagi.");
    return;
  }
  showSub("viewPosts");
  renderPostsList();
  showToast(wasEditing ? "Postingan diperbarui" : "Postingan dipublikasikan");
});

// ---------- Opsi Publish: baru / waktu sebelumnya / terjadwal ----------
function showPublishFormMsg(msg) {
  const el = document.getElementById("publishFormMsg");
  el.textContent = msg;
  el.className = "backup-status error";
}
function clearPublishFormMsg() {
  const el = document.getElementById("publishFormMsg");
  el.textContent = "";
  el.className = "backup-status";
}

function renderScheduleAppliedInfo() {
  const info = document.getElementById("scheduleAppliedInfo");
  if (publishMode === "terjadwal" && scheduledAt) {
    const d = new Date(scheduledAt);
    const label =
      d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) +
      ", " +
      d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    info.textContent = "Terjadwal pada: " + label;
    info.style.display = "block";
  } else {
    info.textContent = "";
    info.style.display = "none";
  }
}

function updateScheduleButtonState() {
  const btn = document.getElementById("btnOpenSchedule");
  if (publishMode === "terjadwal") {
    btn.classList.remove("is-disabled");
  } else {
    btn.classList.add("is-disabled");
  }
  renderScheduleAppliedInfo();
}

document.querySelectorAll('input[name="publishMode"]').forEach((radio) => {
  radio.addEventListener("change", function () {
    if (!this.checked) return;
    publishMode = this.value;
    // Kalau pindah dari mode terjadwal ke mode lain, jadwal yang sudah
    // diterapkan sebelumnya dianggap batal (perlu diatur ulang kalau
    // balik ke mode terjadwal lagi).
    if (publishMode !== "terjadwal") {
      scheduledAt = null;
    }
    clearPublishFormMsg();
    updateScheduleButtonState();
  });
});

document.getElementById("btnOpenSchedule").addEventListener("click", function () {
  if (publishMode !== "terjadwal") {
    showToast("Pilih opsi Atur postingan terjadwal untuk mengatur postingan terjadwal");
    return;
  }
  openScheduleModal();
});

// ---------- Modal: Atur Postingan Terjadwal ----------
const SCHEDULE_DIGIT_IDS = ["scheduleDD", "scheduleMM", "scheduleYYYY", "scheduleHH", "scheduleMin"];
let scheduleModalSnapshot = null;

function getScheduleFieldsData() {
  const data = {};
  SCHEDULE_DIGIT_IDS.forEach((id) => {
    data[id] = document.getElementById(id).value;
  });
  return data;
}
function setScheduleFieldsFromDate(d) {
  document.getElementById("scheduleDD").value = String(d.getDate()).padStart(2, "0");
  document.getElementById("scheduleMM").value = String(d.getMonth() + 1).padStart(2, "0");
  document.getElementById("scheduleYYYY").value = String(d.getFullYear());
  document.getElementById("scheduleHH").value = String(d.getHours()).padStart(2, "0");
  document.getElementById("scheduleMin").value = String(d.getMinutes()).padStart(2, "0");
}
function clearScheduleFields() {
  SCHEDULE_DIGIT_IDS.forEach((id) => (document.getElementById(id).value = ""));
}
function setScheduleStatus(msg, type) {
  const el = document.getElementById("scheduleStatusMsg");
  el.textContent = msg || "";
  el.className = "backup-status" + (type ? " " + type : "");
}
function isScheduleDirty() {
  if (scheduleModalSnapshot === null) return false;
  return JSON.stringify(getScheduleFieldsData()) !== scheduleModalSnapshot;
}

function openScheduleModal() {
  if (scheduledAt) {
    setScheduleFieldsFromDate(new Date(scheduledAt));
  } else {
    clearScheduleFields();
  }
  setScheduleStatus("");
  scheduleModalSnapshot = JSON.stringify(getScheduleFieldsData());
  document.getElementById("scheduleModalBackdrop").classList.add("show");
  document.getElementById("scheduleDD").focus({ preventScroll: true });
}
function forceCloseScheduleModal() {
  document.getElementById("scheduleModalBackdrop").classList.remove("show");
  scheduleModalSnapshot = null;
}
function requestCloseScheduleModal() {
  if (isScheduleDirty()) {
    openConfirmModal(
      "Perubahan belum diterapkan, yakin ingin menutup jendela?",
      forceCloseScheduleModal,
      { title: "Tutup Jendela", confirmLabel: "Ya, Tutup" }
    );
  } else {
    forceCloseScheduleModal();
  }
}

function setupScheduleDigitInput(id, maxLen, nextId) {
  const el = document.getElementById(id);
  el.addEventListener("input", function () {
    this.value = this.value.replace(/\D/g, "").slice(0, maxLen);
    if (this.value.length === maxLen && nextId) {
      const next = document.getElementById(nextId);
      next.focus({ preventScroll: true });
      next.select();
    }
  });
  el.addEventListener("focus", function () {
    this.select();
  });
}
setupScheduleDigitInput("scheduleDD", 2, "scheduleMM");
setupScheduleDigitInput("scheduleMM", 2, "scheduleYYYY");
setupScheduleDigitInput("scheduleYYYY", 4, "scheduleHH");
setupScheduleDigitInput("scheduleHH", 2, "scheduleMin");
setupScheduleDigitInput("scheduleMin", 2, null);

document.getElementById("btnCloseSchedule").addEventListener("click", requestCloseScheduleModal);
document.getElementById("scheduleModalBackdrop").addEventListener("click", function (e) {
  if (e.target === this) requestCloseScheduleModal();
});

document.getElementById("btnApplySchedule").addEventListener("click", function () {
  const f = getScheduleFieldsData();
  const dd = parseInt(f.scheduleDD, 10);
  const mm = parseInt(f.scheduleMM, 10);
  const yyyy = parseInt(f.scheduleYYYY, 10);
  const hh = parseInt(f.scheduleHH, 10);
  const min = parseInt(f.scheduleMin, 10);

  const basicRangeOk =
    f.scheduleYYYY.length === 4 &&
    !isNaN(dd) && !isNaN(mm) && !isNaN(yyyy) && !isNaN(hh) && !isNaN(min) &&
    mm >= 1 && mm <= 12 &&
    dd >= 1 && dd <= 31 &&
    hh >= 0 && hh <= 23 &&
    min >= 0 && min <= 59;

  let candidate = null;
  if (basicRangeOk) {
    const d = new Date(yyyy, mm - 1, dd, hh, min, 0, 0);
    // new Date() "menormalkan" tanggal yang tidak valid (mis. 31 April
    // jadi 1 Mei) alih-alih menolaknya — cek ulang komponennya supaya
    // tanggal seperti itu tetap terdeteksi salah.
    if (
      d.getFullYear() === yyyy &&
      d.getMonth() === mm - 1 &&
      d.getDate() === dd &&
      d.getHours() === hh &&
      d.getMinutes() === min
    ) {
      candidate = d;
    }
  }

  if (!candidate) {
    setScheduleStatus("Format waktu yang disetel salah, gagal menerapkan jadwal", "error");
    return;
  }

  const now = new Date();
  if (candidate.getTime() <= now.getTime()) {
    setScheduleStatus("Format waktu telah lampau, gagal menerapkan jadwal", "error");
    return;
  }

  const maxDate = new Date(now);
  maxDate.setFullYear(maxDate.getFullYear() + 10);
  if (candidate.getTime() > maxDate.getTime()) {
    setScheduleStatus("Format waktu melebihi 10 tahun, gagal menerapkan jadwal", "error");
    return;
  }

  scheduledAt = candidate.toISOString();
  forceCloseScheduleModal();
  clearPublishFormMsg();
  updateScheduleButtonState();
  showToast("Berhasil menerapkan jadwal");
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

async function renderReportsList() {
  let reports = await loadReports();
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

async function openViewReportModal(id) {
  const reports = await loadReports();
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
document.getElementById("btnUpdateReportStatus").addEventListener("click", async function () {
  if (!currentViewingReportId) return;
  const selected = document.querySelector('input[name="reportStatus"]:checked');
  if (!selected) return;
  await setReportStatus(currentViewingReportId, selected.value);
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
    async function () {
      await trashReport(id);
      renderReportsList();
      showToast("Laporan dipindahkan ke Recycle Bin");
    },
    { title: "Hapus Laporan" }
  );
}

document.getElementById("btnDeleteAllReports").addEventListener("click", async function () {
  const reports = await loadReports();
  if (reports.length === 0) return;
  openConfirmModal(
    "Yakin ingin hapus semua laporan? Laporan akan dipindahkan ke Recycle Bin dan bisa dipulihkan dalam 30 hari.",
    async function () {
      for (const r of reports) await trashReport(r.id);
      reportsPage = 1;
      renderReportsList();
      showToast("Semua laporan dipindahkan ke Recycle Bin");
    },
    { title: "Hapus Semua Laporan" }
  );
});

// =========================================================
// PENAMPIL FILE (read-only, data live dari GitHub — lihat js/vfs.js)
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

async function loadFilesIfNeeded() {
  if (vfsLoaded) return;
  const listEl = document.getElementById("vfsFileList");
  listEl.innerHTML = `<div class="empty-state"><h3>Memuat…</h3><p>Mengambil daftar folder &amp; file dari deploy terbaru.</p></div>`;
  try {
    await vfsRefreshFromServer();
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><h3>Gagal memuat</h3><p>${escapeHtmlAdmin(e.message || "Coba tekan tombol refresh.")}</p></div>`;
  }
}

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
    currentFolderPath === "" ? "Penampil File" : nameOf(currentFolderPath);

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

document.getElementById("btnRefreshFiles").addEventListener("click", async function () {
  const btn = this;
  btn.classList.remove("is-spinning");
  void btn.offsetWidth; // restart animasi kalau diklik berkali-kali
  btn.classList.add("is-spinning");
  btn.disabled = true;

  try {
    const total = await vfsRefreshFromServer();
    vfsGridPage = 1;
    vfsFilePage = 1;
    renderFilesView();
    showToast(`Diperbarui — ${total} folder/file sesuai deploy terbaru`);
  } catch (e) {
    showToast(e.message || "Gagal mengambil data terbaru");
  }

  btn.disabled = false;
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

// ---------- View: Lihat File (read-only) ----------
function openFileEdit(path) {
  const node = vfsGetNode(path);
  if (!node) return;
  if (!node.isText) {
    showToast("File ini tidak bisa dibuka di sini");
    return;
  }
  currentEditingFilePath = path;
  document.getElementById("fileEditHeading").textContent = node.name;
  const contentEl = document.getElementById("fileEditTextarea");
  const note = document.getElementById("fileEditNote");
  contentEl.textContent = "";
  note.textContent = "Memuat isi file…";
  pushBackTrap();
  showSub("viewFileEdit");

  fetch(vfsRealPath(node.path))
    .then((res) => {
      if (!res.ok) throw new Error("fetch gagal");
      return res.text();
    })
    .then((text) => {
      if (currentEditingFilePath !== path) return;
      contentEl.textContent = text;
      note.textContent = "";
    })
    .catch(() => {
      if (currentEditingFilePath !== path) return;
      note.textContent = "Gagal memuat isi file ini.";
    });
}

// ---------- Modal: Preview Gambar ----------
const imagePreviewModalBackdrop = document.getElementById("imagePreviewModalBackdrop");
const imagePreviewImg = document.getElementById("imagePreviewImg");
const imagePreviewName = document.getElementById("imagePreviewName");

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

// =========================================================
// Menu titik-tiga (⋮): Detail & Download saja (read-only)
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

  if (action === "detail") openDetailModal(path);
  else if (action === "download") downloadVfsNode(path);
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
        formatBytes(stats.totalSize) + (stats.hasUnknownSize ? " (sebagian file tidak diketahui ukurannya)" : "")
      ) +
      detailRow("Isi Folder", `${stats.folderCount} folder, ${stats.fileCount} file`);
  } else {
    detailModalTitle.textContent = "Detail File";
    detailModalBody.innerHTML =
      detailRow("Nama File", node.name) +
      detailRow("Jalur File", "/" + node.path) +
      detailRow("Ukuran File", formatBytes(node.size));
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
  a.href = vfsRealPath(node.path);
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
const restoreFileLabel = document.querySelector('label[for="restoreFileInput"]');
const btnRestoreBackup = document.getElementById("btnRestoreBackup");
const backupStatusEl = document.getElementById("backupStatus");
let pendingRestoreData = null; // array post hasil parsing file yang dipilih

/** Tampilkan tanggal backup terakhir (Postingan & Halaman) di halaman
 * pemilihan Backup & Restore.
 * Catatan: entri "Tanggal Terakhir Melakukan Backup" sudah dihapus dari
 * tampilan (admin.html), jadi fungsi ini sengaja dikosongkan (bukan
 * dihapus) supaya pemanggilnya di bawah tidak perlu diubah satu-satu.
 * getLastBackupAt/setLastBackupAt & notifikasi pengingat backup mingguan
 * TETAP jalan seperti biasa — hanya tampilan tanggalnya yang dihilangkan. */
function renderBackupDatesInfo() {}

async function updateBackupPostCount() {
  const n = (await loadPosts()).length;
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
document.getElementById("btnDownloadBackup").addEventListener("click", async function () {
  const posts = await loadPosts();
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
  markBackupDone("posts");
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
btnRestoreBackup.addEventListener("click", async function () {
  if (!pendingRestoreData) return;
  const mode = document.querySelector('input[name="restoreMode"]:checked').value;
  const incoming = pendingRestoreData;

  const currentCount = (await loadPosts()).length;
  const message =
    mode === "replace"
      ? `Semua postingan yang ada sekarang (${currentCount}) akan DIHAPUS dan diganti dengan ${incoming.length} postingan dari file backup. Lanjutkan?`
      : `${incoming.length} postingan dari file backup akan digabungkan dengan data yang ada (postingan dengan ID sama akan diperbarui). Lanjutkan?`;

  openConfirmModal(
    message,
    async function () {
      setBackupStatus("Memulihkan…", "");
      await bulkSavePosts(incoming, mode === "replace");
      const finalCount = (await loadPosts()).length;
      updateBackupPostCount();
      resetRestoreForm();
      setBackupStatus(`Berhasil dipulihkan — total sekarang ${finalCount} postingan.`, "success");
      showToast("Data postingan berhasil dipulihkan");
    },
    { title: "Konfirmasi Restore", confirmLabel: mode === "replace" ? "Ya, Timpa Semua" : "Ya, Gabungkan" }
  );
});

// =========================================================
// Backup & Restore (isi Halaman)
// =========================================================
const restoreFileInputPages = document.getElementById("restoreFileInputPages");
const restoreFileNamePagesEl = document.getElementById("restoreFileNamePages");
const restoreFileLabelPages = document.querySelector('label[for="restoreFileInputPages"]');
const btnRestoreBackupPages = document.getElementById("btnRestoreBackupPages");
const backupStatusPagesEl = document.getElementById("backupStatusPages");
const PAGE_IDS = ["tutorial", "cara-download", "donasi", "tentang"];
let pendingRestorePagesData = null; // object { pageId: { title, content } } hasil parsing file yang dipilih

function resetRestorePagesForm() {
  restoreFileInputPages.value = "";
  restoreFileNamePagesEl.textContent = "Belum ada file dipilih";
  restoreFileLabelPages.classList.remove("has-file");
  btnRestoreBackupPages.disabled = true;
  pendingRestorePagesData = null;
  backupStatusPagesEl.textContent = "";
  backupStatusPagesEl.className = "backup-status";
  document.querySelector('input[name="restoreModePages"][value="merge"]').checked = true;
}

function setBackupPagesStatus(msg, type) {
  backupStatusPagesEl.textContent = msg;
  backupStatusPagesEl.className = "backup-status" + (type ? " " + type : "");
}

// ---------- Backup (download) ----------
document.getElementById("btnDownloadBackupPages").addEventListener("click", async function () {
  const pages = await loadAllPages();
  const payload = {
    app: "fueeru-game-backup",
    type: "pages",
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    pages: pages
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `fueeru-pages-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  markBackupDone("pages");
  showToast("Backup halaman berhasil diunduh");
});

// ---------- Restore (pilih file) ----------
restoreFileInputPages.addEventListener("change", function () {
  const file = restoreFileInputPages.files && restoreFileInputPages.files[0];
  pendingRestorePagesData = null;
  btnRestoreBackupPages.disabled = true;
  setBackupPagesStatus("", "");

  if (!file) {
    restoreFileNamePagesEl.textContent = "Belum ada file dipilih";
    restoreFileLabelPages.classList.remove("has-file");
    return;
  }
  restoreFileNamePagesEl.textContent = file.name;
  restoreFileLabelPages.classList.add("has-file");

  const reader = new FileReader();
  reader.onload = function () {
    try {
      const parsed = JSON.parse(reader.result);
      const pages = parsed && typeof parsed === "object" ? parsed.pages || parsed : null;
      if (!pages || typeof pages !== "object" || Array.isArray(pages)) {
        throw new Error("Format file tidak dikenali (tidak ditemukan data halaman).");
      }
      const validKeys = Object.keys(pages).filter(
        (id) => PAGE_IDS.includes(id) && pages[id] && typeof pages[id].content === "string"
      );
      if (validKeys.length === 0) {
        throw new Error("Isi file tidak sesuai format data halaman Fueeru Game.");
      }
      const cleaned = {};
      validKeys.forEach((id) => {
        cleaned[id] = { title: pages[id].title || DEFAULT_PAGE_TITLES[id], content: pages[id].content };
      });
      pendingRestorePagesData = cleaned;
      btnRestoreBackupPages.disabled = false;
      setBackupPagesStatus(`File valid — berisi ${validKeys.length} halaman, siap dipulihkan.`, "success");
    } catch (err) {
      pendingRestorePagesData = null;
      btnRestoreBackupPages.disabled = true;
      setBackupPagesStatus("Gagal membaca file: " + err.message, "error");
    }
  };
  reader.onerror = function () {
    setBackupPagesStatus("Gagal membaca file. Coba lagi.", "error");
  };
  reader.readAsText(file);
});

// ---------- Restore (eksekusi) ----------
btnRestoreBackupPages.addEventListener("click", async function () {
  if (!pendingRestorePagesData) return;
  const mode = document.querySelector('input[name="restoreModePages"]:checked').value;
  const incoming = pendingRestorePagesData;
  const incomingCount = Object.keys(incoming).length;

  const message =
    mode === "replace"
      ? `Seluruh isi Halaman yang ada sekarang akan DIGANTI dengan ${incomingCount} halaman dari file backup (halaman yang tidak ada di file akan kembali ke isi bawaan). Lanjutkan?`
      : `${incomingCount} halaman dari file backup akan digabungkan dengan data yang ada (halaman dengan ID sama akan diperbarui). Lanjutkan?`;

  openConfirmModal(
    message,
    async function () {
      setBackupPagesStatus("Memulihkan…", "");
      if (mode === "replace") {
        const resetPages = {};
        PAGE_IDS.forEach((id) => {
          resetPages[id] = incoming[id] ? incoming[id].content : "";
        });
        await bulkSavePages(resetPages);
      } else {
        const toSave = {};
        Object.keys(incoming).forEach((id) => (toSave[id] = incoming[id].content));
        await bulkSavePages(toSave);
      }
      resetRestorePagesForm();
      setBackupPagesStatus(`Berhasil dipulihkan — ${incomingCount} halaman diperbarui.`, "success");
      showToast("Isi Halaman berhasil dipulihkan");
    },
    { title: "Konfirmasi Restore", confirmLabel: mode === "replace" ? "Ya, Timpa Semua" : "Ya, Gabungkan" }
  );
});

// =========================================================
// Backup Website (unduh zip lengkap repo)
// =========================================================
function setBackupWebsiteStatus(msg, cls) {
  const el = document.getElementById("backupWebsiteStatus");
  el.textContent = msg;
  el.className = "backup-status" + (cls ? " " + cls : "");
}

document.getElementById("btnDownloadBackupWebsite").addEventListener("click", async function () {
  const btn = this;
  btn.disabled = true;
  setBackupWebsiteStatus("Menyiapkan file zip… (bisa makan waktu beberapa detik)", "");
  try {
    const res = await fetch("/api/backup-website", {
      headers: { "x-admin-password": getAdminSessionPassword() }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Gagal membuat backup (" + res.status + ")");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fueerugame-backup-" + new Date().toISOString().slice(0, 10) + ".zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setBackupWebsiteStatus("Backup berhasil diunduh.", "success");
  } catch (e) {
    setBackupWebsiteStatus(e.message || "Gagal membuat backup.", "error");
  }
  btn.disabled = false;
});

// =========================================================
// Deploy Website (upload .zip -> commit ke GitHub -> auto-deploy)
// =========================================================
let deployZipEntries = null; // hasil parse zip: [{ path, bytes }]
const DEPLOY_BATCH_SIZE = 35; // jaga di bawah limit 50 subrequest/permintaan Worker

function resetDeployForm() {
  deployZipEntries = null;
  document.getElementById("deployFileInput").value = "";
  document.getElementById("deployFileName").textContent = "Belum ada file dipilih";
  document.getElementById("deployFileInput").closest(".backup-file-label").classList.remove("has-file");
  document.getElementById("btnStartDeploy").disabled = true;
  document.getElementById("deployStatus").textContent = "";
  document.getElementById("deployStatus").className = "backup-status";
  document.getElementById("deployProgressWrap").classList.add("hidden");
  document.getElementById("deployProgressFill").style.width = "0%";
}

function setDeployStatus(msg, cls) {
  const el = document.getElementById("deployStatus");
  el.textContent = msg;
  el.className = "backup-status" + (cls ? " " + cls : "");
}

document.getElementById("deployFileInput").addEventListener("change", async function () {
  const file = this.files[0];
  const nameEl = document.getElementById("deployFileName");
  const labelEl = this.closest(".backup-file-label");
  const btn = document.getElementById("btnStartDeploy");
  deployZipEntries = null;
  btn.disabled = true;
  labelEl.classList.remove("has-file");
  setDeployStatus("", "");

  if (!file) {
    nameEl.textContent = "Belum ada file dipilih";
    return;
  }
  nameEl.textContent = "Membaca " + file.name + "…";
  try {
    const buf = await file.arrayBuffer();
    let entries = await readZipEntries(buf);
    entries = resolveZipRoot(entries);
    if (entries.length === 0) throw new Error("Zip kosong / tidak ada file di dalamnya.");
    deployZipEntries = entries;
    const folderSet = new Set();
    entries.forEach((e) => {
      const parts = e.path.split("/");
      for (let i = 1; i < parts.length; i++) folderSet.add(parts.slice(0, i).join("/"));
    });
    nameEl.textContent = file.name + " — " + entries.length + " file, " + folderSet.size + " folder";
    labelEl.classList.add("has-file");
    btn.disabled = false;
  } catch (e) {
    nameEl.textContent = "Belum ada file dipilih";
    deployZipEntries = null;
    openOtpNotif("Error", "Gagal mengunggah deploy, " + (e.message === "File index.html tidak ditemukan" ? "file index.html tidak ditemukan" : e.message || "file zip tidak valid") + ".");
  }
});

document.getElementById("btnStartDeploy").addEventListener("click", function () {
  if (!deployZipEntries || deployZipEntries.length === 0) return;
  const fileCount = deployZipEntries.length;
  const folderSet = new Set();
  deployZipEntries.forEach((e) => {
    const parts = e.path.split("/");
    for (let i = 1; i < parts.length; i++) folderSet.add(parts.slice(0, i).join("/"));
  });

  openConfirmModal(
    `Akan mengunggah ${fileCount} file dan ${folderSet.size} folder. File dengan nama sama akan DITIMPA, dan file yang tidak ada di zip ini akan DIHAPUS dari situs live. Lanjutkan deploy?`,
    runDeploy,
    { title: "Konfirmasi Deploy", confirmLabel: "Ya, Deploy Sekarang" }
  );
});

async function runDeploy() {
  const btn = document.getElementById("btnStartDeploy");
  const progressWrap = document.getElementById("deployProgressWrap");
  const progressFill = document.getElementById("deployProgressFill");
  const progressText = document.getElementById("deployProgressText");
  btn.disabled = true;
  progressWrap.classList.remove("hidden");
  setDeployStatus("Memulai sesi deploy…", "");

  try {
    const startRes = await apiCall("POST", "/api/deploy/start", { expectedTotal: deployZipEntries.length }, true);
    const sessionId = startRes.sessionId;

    let uploaded = 0;
    for (let i = 0; i < deployZipEntries.length; i += DEPLOY_BATCH_SIZE) {
      const batch = deployZipEntries.slice(i, i + DEPLOY_BATCH_SIZE);
      const files = batch.map((e) => ({ path: e.path, contentBase64: bytesToBase64(e.bytes) }));
      await apiCall("POST", "/api/deploy/batch", { sessionId, files }, true);
      uploaded += batch.length;
      const pct = Math.round((uploaded / deployZipEntries.length) * 100);
      progressFill.style.width = pct + "%";
      progressText.textContent = `Mengunggah… ${uploaded}/${deployZipEntries.length} file (${pct}%)`;
      setDeployStatus("Mengunggah file ke GitHub…", "");
    }

    progressText.textContent = "Merakit commit & mendorong ke GitHub…";
    setDeployStatus("Menyelesaikan deploy…", "");
    const finishRes = await apiCall("POST", "/api/deploy/finish", { sessionId }, true);

    progressFill.style.width = "100%";
    progressText.textContent = "Selesai — " + deployZipEntries.length + " file terunggah.";
    setDeployStatus("File deploy berhasil diunggah.", "success");
    showToast("Deploy berhasil dikirim");
    openOtpNotif("Berhasil", "File deploy berhasil diunggah, silahkan tunggu hingga proses deploy selesai.");
  } catch (e) {
    setDeployStatus(e.message || "Gagal deploy. Coba lagi.", "error");
    openOtpNotif("Error", e.message || "Gagal mengunggah file deploy. Coba lagi.");
  }
  btn.disabled = false;
}

// =========================================================
// Informasi Web — 6 sub-halaman
// (Informasi Dasar, Statistik Pengunjung, Postingan & Halaman,
//  Performa Teknis, Riwayat Commit, Keamanan)
// =========================================================

/** Bar sederhana (CSS-only, tanpa library) untuk daftar breakdown
 * berlabel + angka, mis. device/referrer/lokasi/genre/halaman populer. */
function renderInfoBarList(containerEl, rows, opts) {
  opts = opts || {};
  if (!rows || rows.length === 0) {
    containerEl.innerHTML = '<p class="backup-desc">' + (opts.emptyText || "Belum ada data.") + "</p>";
    return;
  }
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  containerEl.innerHTML = rows
    .map((r) => {
      const pct = Math.max(4, Math.round((r.value / max) * 100));
      return `
        <div class="info-bar-row">
          <div class="info-bar-label">
            <span>${escapeHtmlAdmin(r.label)}</span>
            <strong>${escapeHtmlAdmin(String(r.value))}</strong>
          </div>
          <div class="info-bar-track"><div class="info-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
    })
    .join("");
}

/** Grafik 24-jam (WIB) sederhana pakai bar vertikal CSS. */
function renderHourlyChart(containerEl, hourly) {
  const max = Math.max(...hourly.map((h) => h.count), 1);
  containerEl.innerHTML =
    '<div class="hourly-chart">' +
    hourly
      .map((h) => {
        const pct = Math.max(3, Math.round((h.count / max) * 100));
        return `<div class="hourly-bar-wrap" title="Jam ${h.hour}:00 — ${h.count} kunjungan">
          <div class="hourly-bar" style="height:${pct}%"></div>
          <span class="hourly-bar-label">${h.hour % 3 === 0 ? h.hour : ""}</span>
        </div>`;
      })
      .join("") +
    "</div>";
}

/** ---------------- Informasi Dasar ---------------- */
let infoBasicCache = null;
async function renderInfoDasar() {
  document.getElementById("infoSiteName").textContent = "Memuat…";
  const posts = await loadPosts();
  const reports = await loadReports();
  let basic;
  try {
    basic = await getInfoBasic();
  } catch (e) {
    basic = null;
  }
  infoBasicCache = basic;

  if (basic) {
    document.getElementById("infoSiteName").textContent = basic.siteName || "—";
    document.getElementById("infoRepoName").textContent = basic.repoOwner + "/" + basic.repoName;
    document.getElementById("infoWorkerName").textContent = basic.workerName || "—";
    document.getElementById("infoLastDeploySha").textContent = basic.lastDeploySha || "Belum ada data";
    document.getElementById("infoLastDeployAt").textContent = basic.lastDeployAt
      ? formatReportDate(basic.lastDeployAt)
      : "Belum ada data";
    const statusEl = document.getElementById("infoLastDeployStatus");
    if (basic.lastDeployStatus === "success") {
      statusEl.textContent = "Berhasil";
      statusEl.style.color = "#1f9d55";
    } else if (basic.lastDeployStatus === "failed") {
      statusEl.textContent = "Gagal";
      statusEl.style.color = "#e0453a";
    } else {
      statusEl.textContent = "Belum ada data";
      statusEl.style.color = "";
    }
  } else {
    document.getElementById("infoSiteName").textContent = "Gagal memuat";
  }

  document.getElementById("infoTotalPosts").textContent = posts.length;
  document.getElementById("infoTotalReports").textContent = reports.length;
  document.getElementById("infoReportsPending").textContent = reports.filter(
    (r) => (r.status || "belum") === "belum"
  ).length;
  document.getElementById("infoReportsSedang").textContent = reports.filter(
    (r) => (r.status || "belum") === "sedang"
  ).length;
  document.getElementById("infoReportsSelesai").textContent = reports.filter(
    (r) => (r.status || "belum") === "selesai"
  ).length;
  document.getElementById("infoStorageSize").textContent = formatBytes(getStorageSizeEstimate());
}
document.getElementById("btnOpenRepo").addEventListener("click", () => {
  if (infoBasicCache && infoBasicCache.repoUrl) window.open(infoBasicCache.repoUrl, "_blank", "noopener");
});
document.getElementById("btnOpenWorkerDashboard").addEventListener("click", () => {
  if (infoBasicCache && infoBasicCache.workerDashboardUrl) {
    window.open(infoBasicCache.workerDashboardUrl, "_blank", "noopener");
  }
});

/** ---------------- Statistik Pengunjung ---------------- */
async function renderInfoStatistik() {
  const visitStats = await getVisitStats();

  document.getElementById("infoTotalVisits").textContent = visitStats.total;
  document.getElementById("infoVisitsToday").textContent = visitStats.today;
  document.getElementById("infoVisitsThisWeek").textContent = visitStats.thisWeek;
  document.getElementById("infoVisitsLastWeek").textContent = visitStats.lastWeek;
  document.getElementById("infoVisitsAvgDay").textContent = visitStats.avgPerDay7d;

  renderHourlyChart(document.getElementById("chartHourly"), visitStats.hourly || []);

  renderInfoBarList(
    document.getElementById("chartDevice"),
    (visitStats.deviceBreakdown || []).map((r) => ({
      label: r.device === "mobile" ? "Mobile" : r.device === "desktop" ? "Desktop" : "Tidak diketahui",
      value: r.c
    }))
  );
  renderInfoBarList(
    document.getElementById("chartReferrer"),
    (visitStats.referrerBreakdown || []).map((r) => ({ label: r.referrer, value: r.c }))
  );
  renderInfoBarList(
    document.getElementById("chartLocation"),
    (visitStats.locationBreakdown || []).map((r) => ({
      label: r.city ? r.country + " — " + r.city : r.country,
      value: r.c
    }))
  );
}

/** ---------------- Postingan & Halaman ---------------- */
async function renderInfoPostinganHalaman() {
  const viewStats = await getPostViewStats();
  document.getElementById("infoViewsTotal").textContent = viewStats.total;
  document.getElementById("infoViewsToday").textContent = viewStats.today;
  document.getElementById("infoViewsThisWeek").textContent = viewStats.thisWeek;
  document.getElementById("infoViewsLastWeek").textContent = viewStats.lastWeek;

  let extra;
  try {
    extra = await getPostsHalamanStats();
  } catch (e) {
    extra = { popularThisWeek: [], topGenres: [], topPages: [] };
  }

  renderInfoBarList(
    document.getElementById("listPopularPosts"),
    extra.popularThisWeek.map((p) => ({ label: p.title, value: p.views })),
    { emptyText: "Belum ada views postingan minggu ini." }
  );
  renderInfoBarList(
    document.getElementById("listTopGenres"),
    extra.topGenres.filter((g) => g.genre).map((g) => ({ label: g.genre, value: g.views })),
    { emptyText: "Belum ada data genre." }
  );
  renderInfoBarList(
    document.getElementById("listTopPages"),
    extra.topPages.map((p) => ({ label: p.label, value: p.views })),
    { emptyText: "Belum ada data halaman." }
  );

  // Breakdown Jenis / Platform / Status publish — dihitung langsung dari
  // daftar postingan (tanpa endpoint tambahan).
  const posts = await loadPosts();

  const jenisCounts = {};
  JENIS_LIST.forEach((j) => (jenisCounts[j] = 0));
  posts.forEach((p) => {
    if (jenisCounts[p.jenis] !== undefined) jenisCounts[p.jenis]++;
  });
  renderInfoBarList(
    document.getElementById("listPostsByJenis"),
    JENIS_LIST.map((j) => ({ label: j, value: jenisCounts[j] })),
    { emptyText: "Belum ada postingan." }
  );

  const platformCounts = {};
  PLATFORM_OPTIONS.forEach((opt) => (platformCounts[opt] = 0));
  posts.forEach((p) => {
    const opt = platformTagsToOption(p.platform);
    if (platformCounts[opt] !== undefined) platformCounts[opt]++;
  });
  renderInfoBarList(
    document.getElementById("listPostsByPlatform"),
    PLATFORM_OPTIONS.map((opt) => ({ label: opt, value: platformCounts[opt] })),
    { emptyText: "Belum ada postingan." }
  );

  const statusCounts = { published: 0, draft: 0, scheduled: 0 };
  posts.forEach((p) => { statusCounts[getPostStatus(p)]++; });
  document.getElementById("infoStatusPublished").textContent = statusCounts.published;
  document.getElementById("infoStatusDraft").textContent = statusCounts.draft;
  document.getElementById("infoStatusScheduled").textContent = statusCounts.scheduled;
}

/** ---------------- Performa Teknis (Kesehatan Sistem) ---------------- */
async function renderInfoPerforma() {
  document.getElementById("healthWebhook").textContent = "Memuat…";
  document.getElementById("healthOtp").textContent = "Memuat…";
  document.getElementById("healthD1Size").textContent = "Memuat…";
  document.getElementById("healthD1Note").textContent = "";
  document.getElementById("healthOtpTotal").textContent = "…";
  document.getElementById("healthOtpUsed").textContent = "…";
  document.getElementById("healthOtpExpired").textContent = "…";
  document.getElementById("healthStaleDeployCount").textContent = "…";
  document.getElementById("healthStaleDeployNote").textContent = "";

  let health;
  try {
    health = await getInfoHealth();
  } catch (e) {
    document.getElementById("healthWebhook").textContent = "Gagal memuat";
    document.getElementById("healthOtp").textContent = "Gagal memuat";
    document.getElementById("healthD1Size").textContent = "Gagal memuat";
    document.getElementById("healthOtpTotal").textContent = "—";
    document.getElementById("healthOtpUsed").textContent = "—";
    document.getElementById("healthOtpExpired").textContent = "—";
    document.getElementById("healthStaleDeployCount").textContent = "—";
    return;
  }

  document.getElementById("healthWebhook").textContent = health.lastWebhookAt
    ? formatReportDate(health.lastWebhookAt)
    : "Belum pernah menerima sinyal";
  document.getElementById("healthOtp").textContent = health.lastOtpSentAt
    ? formatReportDate(health.lastOtpSentAt)
    : "Belum pernah mengirim OTP";

  if (health.d1SizeBytes != null) {
    document.getElementById("healthD1Size").textContent = formatBytes(health.d1SizeBytes) + " / 5 GB gratis";
  } else {
    document.getElementById("healthD1Size").textContent = "Tidak tersedia";
    document.getElementById("healthD1Note").textContent = health.d1Error || "";
  }

  const otp = health.otpStats || { total: 0, used: 0, expiredUnused: 0 };
  document.getElementById("healthOtpTotal").textContent = otp.total;
  document.getElementById("healthOtpUsed").textContent = otp.used;
  document.getElementById("healthOtpExpired").textContent = otp.expiredUnused;

  const stale = health.staleDeploySessions || { count: 0, oldest: null };
  document.getElementById("healthStaleDeployCount").textContent = stale.count;
  document.getElementById("healthStaleDeployNote").textContent =
    stale.count > 0
      ? "Sesi tertua sejak " + formatReportDate(stale.oldest) + " — otomatis dibersihkan saat deploy berikutnya dimulai."
      : "Tidak ada sesi deploy yang menggantung.";
}

/** ---------------- Riwayat Commit ---------------- */
let commitHistoryPage = 1;
async function renderCommitHistory() {
  const listEl = document.getElementById("commitHistoryList");
  const prevBtn = document.getElementById("btnCommitPrev");
  const nextBtn = document.getElementById("btnCommitNext");
  document.getElementById("commitPageLabel").textContent = "Halaman " + commitHistoryPage;
  listEl.innerHTML = '<p class="backup-desc">Memuat riwayat dari GitHub…</p>';
  prevBtn.disabled = commitHistoryPage <= 1;
  nextBtn.disabled = true;

  let data;
  try {
    data = await getCommitHistory(commitHistoryPage);
  } catch (e) {
    listEl.innerHTML = '<p class="backup-desc">Gagal memuat riwayat: ' + escapeHtmlAdmin(e.message) + "</p>";
    return;
  }

  if (data.error) {
    listEl.innerHTML = '<p class="backup-desc">' + escapeHtmlAdmin(data.error) + "</p>";
    return;
  }

  if (!data.items || data.items.length === 0) {
    listEl.innerHTML =
      '<p class="backup-desc">' +
      (commitHistoryPage === 1
        ? "Belum ada riwayat deploy."
        : "Tidak ada riwayat lagi dalam 30 hari terakhir.") +
      "</p>";
    nextBtn.disabled = true;
    return;
  }

  listEl.innerHTML = data.items
    .map((r) => {
      const isSuccess = r.conclusion === "success";
      const isRunning = r.status !== "completed";
      const badgeClass = isRunning ? "commit-badge-running" : isSuccess ? "commit-badge-success" : "commit-badge-failed";
      const badgeText = isRunning ? "Berjalan" : isSuccess ? "Berhasil" : "Gagal";
      return `
        <a class="commit-history-item" href="${escapeHtmlAdmin(r.htmlUrl)}" target="_blank" rel="noopener">
          <div class="commit-history-top">
            <span class="commit-badge ${badgeClass}">${badgeText}</span>
            <span class="commit-sha">${escapeHtmlAdmin(r.headSha)}</span>
          </div>
          <div class="commit-message">${escapeHtmlAdmin(r.commitMessage || "(tanpa pesan commit)")}</div>
          <div class="commit-date">${formatReportDate(r.createdAt)}</div>
        </a>`;
    })
    .join("");

  nextBtn.disabled = !data.hasMore;
}
document.getElementById("btnCommitPrev").addEventListener("click", async () => {
  if (commitHistoryPage <= 1) return;
  commitHistoryPage -= 1;
  await renderCommitHistory();
});
document.getElementById("btnCommitNext").addEventListener("click", async () => {
  commitHistoryPage += 1;
  await renderCommitHistory();
});

/** ---------------- Keamanan ---------------- */
async function renderInfoKeamanan() {
  document.getElementById("infoCurrentPassword").textContent = "••••••••";
  document.getElementById("btnTogglePasswordVisibility").textContent = "Lihat Kata Sandi";
  document.getElementById("newPasswordInput").value = "";
  document.getElementById("passwordStatus").textContent = "";
  document.getElementById("passwordStatus").className = "backup-status";
  document.getElementById("infoPasswordChangedAt").textContent = "Memuat…";

  const listEl = document.getElementById("listLoginFails");
  listEl.innerHTML = '<p class="backup-desc">Memuat…</p>';
  try {
    const data = await getLoginFails();
    document.getElementById("infoPasswordChangedAt").textContent = data.passwordChangedAt
      ? formatReportDate(data.passwordChangedAt)
      : "Belum pernah diganti sejak awal";
    if (!data.items || data.items.length === 0) {
      listEl.innerHTML = '<p class="backup-desc">Belum ada percobaan login gagal.</p>';
    } else {
      listEl.innerHTML =
        '<ul class="login-fail-list">' +
        data.items.map((d) => `<li>${formatReportDate(d)}</li>`).join("") +
        "</ul>";
    }
  } catch (e) {
    document.getElementById("infoPasswordChangedAt").textContent = "Gagal memuat";
    listEl.innerHTML = '<p class="backup-desc">Gagal memuat log.</p>';
  }
}

document.getElementById("btnTogglePasswordVisibility").addEventListener("click", function () {
  const el = document.getElementById("infoCurrentPassword");
  const isHidden = el.textContent === "••••••••";
  if (isHidden) {
    el.textContent = getAdminSessionPassword() || "(tidak diketahui)";
    this.textContent = "Sembunyikan Kata Sandi";
  } else {
    el.textContent = "••••••••";
    this.textContent = "Lihat Kata Sandi";
  }
});

document.getElementById("btnSavePassword").addEventListener("click", async function () {
  const input = document.getElementById("newPasswordInput");
  const statusEl = document.getElementById("passwordStatus");
  const val = input.value.trim();
  if (val.length < 4) {
    statusEl.textContent = "Kata sandi minimal 4 karakter.";
    statusEl.className = "backup-status error";
    return;
  }
  statusEl.textContent = "Menyimpan…";
  const ok = await setAdminPassword(val);
  if (!ok) {
    statusEl.textContent = "Gagal menyimpan kata sandi. Coba lagi.";
    statusEl.className = "backup-status error";
    return;
  }
  document.getElementById("infoCurrentPassword").textContent = "••••••••";
  document.getElementById("btnTogglePasswordVisibility").textContent = "Lihat Kata Sandi";
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
  backup_reminder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8H3v13h18V8z"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>`,
  deploy_success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  deploy_failed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
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
  // Tombol lonceng menampilkan window peringatan "belum login" kalau
  // belum login — berlaku di semua ukuran layar (mobile & desktop),
  // bukan langsung membuka window Notifikasi.
  if (!isLoggedIn()) {
    requireLoginAlert();
    return;
  }
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

async function renderPostViewsModal() {
  const sortMode = document.getElementById("postViewsSort").value;
  let posts = (await loadPosts()).map((p) => ({ ...p, _views: getViewsForPost(p.id) }));

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
      <img src="${resolveAdminAsset(p.thumbnail)}" alt="" ${adminThumbFallbackAttr()}>
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

async function renderRecycleBinCounts() {
  document.getElementById("trashPostCount").textContent = (await loadTrashPosts()).length;
  document.getElementById("trashReportCount").textContent = (await loadTrashReports()).length;
}

function openTrashList(type) {
  trashViewType = type;
  trashSearchQuery = "";
  trashSortMode = "az";
  trashPage = 1;
  document.getElementById("trashSearchInput").value = "";
  document.getElementById("trashSortSelect").value = "az";
  refreshCustomSelect(document.getElementById("trashSortSelect"));
  document.getElementById("recycleBinListHeading").textContent = type === "posts" ? "Postingan" : "Laporan";
  showSub("viewRecycleBinList");
  renderTrashList();
}

async function getFilteredTrash() {
  const raw = trashViewType === "posts" ? await loadTrashPosts() : await loadTrashReports();
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

async function findTrashItem(id) {
  const raw = trashViewType === "posts" ? await loadTrashPosts() : await loadTrashReports();
  return raw.find((item) => item.id === id);
}

async function renderTrashList() {
  const filtered = await getFilteredTrash();
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
  findTrashItem(id).then((item) => {
    if (!item) return;
    const label = trashViewType === "posts" ? "postingan" : "laporan";
    openConfirmModal(
      `Pulihkan "${item.title}"? Item akan dikembalikan ke daftar ${label} aktif.`,
      async function () {
        await restoreFromTrash(trashViewType, id);
        renderTrashList();
        renderRecycleBinCounts();
        showToast("Berhasil dipulihkan");
      },
      { title: "Pulihkan", confirmLabel: "Ya, Pulihkan" }
    );
  });
}

function deleteTrashItemPermanently(id) {
  findTrashItem(id).then((item) => {
    if (!item) return;
    openConfirmModal(
      `Hapus permanen "${item.title}"? Tindakan ini TIDAK BISA dibatalkan.`,
      async function () {
        await permanentlyDeleteFromTrash(trashViewType, id);
        renderTrashList();
        renderRecycleBinCounts();
        showToast("Item dihapus permanen");
      },
      { title: "Hapus Permanen", confirmLabel: "Ya, Hapus Permanen" }
    );
  });
}

document.getElementById("btnRestoreAllTrash").addEventListener("click", async function () {
  const filtered = await getFilteredTrash();
  if (filtered.length === 0) return;
  const label = trashViewType === "posts" ? "postingan" : "laporan";
  openConfirmModal(
    `Pulihkan semua (${filtered.length}) ${label} yang ditampilkan?`,
    async function () {
      await restoreAllFromTrash(
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

document.getElementById("btnDeleteAllTrash").addEventListener("click", async function () {
  const filtered = await getFilteredTrash();
  if (filtered.length === 0) return;
  const label = trashViewType === "posts" ? "postingan" : "laporan";
  openConfirmModal(
    `Hapus permanen semua (${filtered.length}) ${label} yang ditampilkan? Tindakan ini TIDAK BISA dibatalkan.`,
    async function () {
      await permanentlyDeleteAllFromTrash(
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
async function openTrashPreview(id) {
  const item = await findTrashItem(id);
  if (!item) return;
  const body = document.getElementById("trashPreviewBody");
  if (trashViewType === "posts") {
    body.innerHTML = `
      <h1 class="post-detail-title" style="margin-top:0;">${escapeHtmlAdmin(item.title)}</h1>
      <img class="post-detail-img" src="${resolveAdminAsset(item.thumbnail)}" alt="" ${adminThumbFallbackAttr()}>
      <div class="post-detail-content">${item.content}</div>
    `;
    initSpoilersAdmin(body);
    initImgGalleriesAdmin(body);
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
  findTrashItem(id).then((item) => {
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
  });
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
        document.getElementById("installInfoModalBackdrop").classList.add("show");
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
/* ---------------- Toggle mode tampilan (terang/gelap) ----------------
   Terhubung dengan toggle di sidebar website publik lewat localStorage
   kunci yang sama ("fueeru_theme"), jadi ganti mode di Admin Panel juga
   berlaku saat kembali ke halaman publik (dan sebaliknya). */
function initAdminThemeToggle() {
  const THEME_KEY = "fueeru_theme";
  const themeButtons = document.querySelectorAll(".theme-btn");
  if (!themeButtons.length) return;

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
}

// =========================================================
// Redirect Page — Tampilan Redirect (bagian + reorder) & Daftar Link
// =========================================================
let redirectSections = [];
let reorderMode = false;
let editingSectionId = null; // null = mode tambah bagian

let redirectLinks = [];
let redirectLinkSearchQuery = "";
let addLinkType = "android";
let editLinkType = "android";
let editingLinkId = null;
let contextMenuLinkId = null;

/* ---------- Tampilan Redirect: render daftar bagian ---------- */
async function renderRedirectSections() {
  const listEl = document.getElementById("redirectSectionsList");
  listEl.innerHTML = '<p class="backup-desc">Memuat…</p>';
  reorderMode = false;
  document.getElementById("btnToggleReorderSections").textContent = "Atur Posisi Bagian";
  try {
    redirectSections = await getRedirectSections();
  } catch (e) {
    listEl.innerHTML = '<p class="backup-desc">Gagal memuat data.</p>';
    return;
  }
  renderRedirectSectionsList();
}

function dragHandleSvg() {
  return '<span class="rs-drag-handle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/></svg></span>';
}

function renderRedirectSectionsList() {
  const listEl = document.getElementById("redirectSectionsList");
  if (redirectSections.length === 0) {
    listEl.innerHTML = '<p class="backup-desc">Belum ada bagian.</p>';
    return;
  }
  listEl.innerHTML = redirectSections
    .map((s) => {
      const rowClass = "redirect-section-row" + (s.locked ? " locked" : "") + (reorderMode ? " reorder-mode" : "");
      if (s.locked) {
        return `
          <div class="${rowClass}" data-id="${escapeHtmlAdmin(s.id)}">
            <div class="rs-row-top">
              <div>
                <div class="rs-row-name">${escapeHtmlAdmin(s.name)}</div>
                <div class="rs-row-locked-note">${escapeHtmlAdmin(s.description || "Bagian ini tidak dapat diedit dan dihapus")}</div>
              </div>
              ${reorderMode ? dragHandleSvg() : ""}
            </div>
          </div>`;
      }
      return `
        <div class="${rowClass}" data-id="${escapeHtmlAdmin(s.id)}">
          <div class="rs-row-top">
            <div>
              <div class="rs-row-name">${escapeHtmlAdmin(s.name)}</div>
              ${s.description ? `<div class="rs-row-desc">${escapeHtmlAdmin(s.description)}</div>` : ""}
            </div>
            ${
              reorderMode
                ? dragHandleSvg()
                : `<div class="rs-row-actions">
                    <button type="button" class="rs-action-btn rs-action-edit" data-action="edit-section" data-id="${escapeHtmlAdmin(s.id)}">Edit</button>
                    <button type="button" class="rs-action-btn rs-action-delete" data-action="delete-section" data-id="${escapeHtmlAdmin(s.id)}">Hapus</button>
                  </div>`
            }
          </div>
        </div>`;
    })
    .join("");

  if (reorderMode) attachSectionDragHandlers();
  else attachSectionActionHandlers();
}

function attachSectionActionHandlers() {
  document.querySelectorAll('#redirectSectionsList [data-action="edit-section"]').forEach((btn) => {
    btn.addEventListener("click", () => openSectionModal(btn.getAttribute("data-id")));
  });
  document.querySelectorAll('#redirectSectionsList [data-action="delete-section"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      openConfirmModal("Yakin ingin menghapus bagian ini?", async function () {
        try {
          await deleteRedirectSection(id);
          showToast("Bagian dihapus");
          renderRedirectSections();
        } catch (e) {
          showToast(e.message || "Gagal menghapus bagian");
        }
      });
    });
  });
}

/* ---------- Drag reorder (Pointer Events — jalan di HP & desktop) ---------- */
let sectionDragState = null;

function attachSectionDragHandlers() {
  document.querySelectorAll("#redirectSectionsList .redirect-section-row").forEach((row) => {
    row.addEventListener("pointerdown", onSectionDragStart);
  });
}

function onSectionDragStart(e) {
  const listEl = document.getElementById("redirectSectionsList");
  const row = e.currentTarget;
  try {
    row.setPointerCapture(e.pointerId);
  } catch (err) {}
  sectionDragState = { pointerId: e.pointerId, row };
  row.classList.add("dragging");
  document.addEventListener("pointermove", onSectionDragMove);
  document.addEventListener("pointerup", onSectionDragEnd);

  function onSectionDragMove(ev) {
    if (!sectionDragState || ev.pointerId !== sectionDragState.pointerId) return;
    const y = ev.clientY;
    const currentRows = Array.from(listEl.querySelectorAll(".redirect-section-row"));
    for (const other of currentRows) {
      if (other === sectionDragState.row) continue;
      const rect = other.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (y < mid && other.previousElementSibling !== sectionDragState.row) {
        listEl.insertBefore(sectionDragState.row, other);
        break;
      } else if (y >= mid && other.nextElementSibling !== sectionDragState.row) {
        listEl.insertBefore(sectionDragState.row, other.nextElementSibling);
        break;
      }
    }
  }
  function onSectionDragEnd(ev) {
    if (!sectionDragState || ev.pointerId !== sectionDragState.pointerId) return;
    sectionDragState.row.classList.remove("dragging");
    try {
      sectionDragState.row.releasePointerCapture(ev.pointerId);
    } catch (err) {}
    document.removeEventListener("pointermove", onSectionDragMove);
    document.removeEventListener("pointerup", onSectionDragEnd);
    sectionDragState = null;
  }
}

document.getElementById("btnToggleReorderSections").addEventListener("click", async function () {
  const btn = this;
  if (!reorderMode) {
    reorderMode = true;
    btn.textContent = "Simpan Posisi Bagian";
    renderRedirectSectionsList();
    return;
  }
  const newOrder = Array.from(document.querySelectorAll("#redirectSectionsList .redirect-section-row")).map((row) =>
    row.getAttribute("data-id")
  );
  try {
    await reorderRedirectSections(newOrder);
    showToast("Posisi bagian disimpan");
  } catch (e) {
    showToast(e.message || "Gagal menyimpan posisi");
  }
  reorderMode = false;
  btn.textContent = "Atur Posisi Bagian";
  renderRedirectSections();
});

/* ---------- Modal Tambahkan/Edit Bagian ---------- */
const sectionModalBackdrop = document.getElementById("sectionModalBackdrop");
const sectionModalTitle = document.getElementById("sectionModalTitle");
const sectionNameInput = document.getElementById("sectionNameInput");
const sectionDescInput = document.getElementById("sectionDescInput");
const sectionContentInput = document.getElementById("sectionContentInput");
const sectionModalError = document.getElementById("sectionModalError");

function hideSectionModalError() {
  sectionModalError.classList.add("hidden");
  sectionModalError.textContent = "";
}

function openSectionModal(id) {
  editingSectionId = id || null;
  hideSectionModalError();
  if (id) {
    const s = redirectSections.find((x) => x.id === id);
    if (!s) return;
    sectionModalTitle.textContent = "Edit Bagian";
    sectionNameInput.value = s.name;
    sectionDescInput.value = s.description || "";
    sectionContentInput.value = s.content || "";
  } else {
    sectionModalTitle.textContent = "Tambahkan Bagian";
    sectionNameInput.value = "";
    sectionDescInput.value = "";
    sectionContentInput.value = "";
  }
  sectionModalBackdrop.classList.add("show");
}
document.getElementById("btnAddRedirectSection").addEventListener("click", () => openSectionModal(null));
document.getElementById("btnCancelSection").addEventListener("click", () => sectionModalBackdrop.classList.remove("show"));
sectionModalBackdrop.addEventListener("click", (e) => {
  if (e.target === sectionModalBackdrop) sectionModalBackdrop.classList.remove("show");
});

document.getElementById("btnSaveSection").addEventListener("click", async function () {
  const name = sectionNameInput.value.trim();
  const description = sectionDescInput.value.trim();
  const content = sectionContentInput.value.trim();
  if (!name || !content) {
    sectionModalError.textContent = "Nama Bagian dan Isi Bagian tidak boleh kosong";
    sectionModalError.classList.remove("hidden");
    return;
  }
  try {
    if (editingSectionId) {
      await updateRedirectSection(editingSectionId, { name, description, content });
      showToast("Bagian diperbarui");
    } else {
      await createRedirectSection({ name, description, content });
      showToast("Bagian ditambahkan");
    }
    sectionModalBackdrop.classList.remove("show");
    renderRedirectSections();
  } catch (e) {
    sectionModalError.textContent = e.message || "Gagal menyimpan bagian";
    sectionModalError.classList.remove("hidden");
  }
});

/* ---------- Preview Halaman Redirect (pakai modal Preview yang sudah ada) ---------- */
document.getElementById("btnPreviewRedirectPage").addEventListener("click", function () {
  previewViewportInner.innerHTML = buildRedirectSectionsHtml(redirectSections);
  reviveRedirectScripts(previewViewportInner);
  initRedirectCountdownWidget(previewViewportInner, function () {
    showToast("ini hanya preview — tidak benar-benar menuju link");
  });
  previewModalBackdrop.classList.add("show");
  applyPreviewDeviceMode("mobile");
});

/* ---------- Daftar Link: render daftar ---------- */
async function renderRedirectLinksList() {
  const listEl = document.getElementById("redirectLinksList");
  listEl.innerHTML = '<p class="backup-desc">Memuat…</p>';
  try {
    redirectLinks = await getRedirectLinks();
  } catch (e) {
    listEl.innerHTML = '<p class="backup-desc">Gagal memuat data.</p>';
    return;
  }
  drawRedirectLinksList();
}

function linkTypeIconSvg(type) {
  if (type === "pc") {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16V11a7 7 0 0114 0v5"/><path d="M4 12v5a1 1 0 001 1h14a1 1 0 001-1v-5"/><line x1="8.5" y1="3.5" x2="7.5" y2="5.5"/><line x1="15.5" y1="3.5" x2="16.5" y2="5.5"/><line x1="9" y1="10" x2="9" y2="11"/><line x1="15" y1="10" x2="15" y2="11"/></svg>';
}

function drawRedirectLinksList() {
  const listEl = document.getElementById("redirectLinksList");
  const q = redirectLinkSearchQuery.toLowerCase();
  const filtered = q ? redirectLinks.filter((l) => l.name.toLowerCase().includes(q)) : redirectLinks;

  if (filtered.length === 0) {
    listEl.innerHTML = `<p class="backup-desc">${redirectLinks.length === 0 ? "Belum ada link." : "Tidak ada link yang cocok."}</p>`;
    return;
  }
  listEl.innerHTML = filtered
    .map(
      (l) => `
      <div class="redirect-link-row" data-id="${escapeHtmlAdmin(l.id)}">
        <span class="rl-icon">${linkTypeIconSvg(l.type)}</span>
        <div class="rl-info">
          <div class="rl-name">${escapeHtmlAdmin(l.name)}</div>
          <div class="rl-cloud">${escapeHtmlAdmin(l.cloudName)}</div>
        </div>
        <button type="button" class="rl-menu-btn" data-menu-link="${escapeHtmlAdmin(l.id)}" aria-label="Menu ${escapeHtmlAdmin(l.name)}">⋮</button>
      </div>`
    )
    .join("");

  document.querySelectorAll("#redirectLinksList .rl-menu-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openRedirectLinkContextMenu(btn.getAttribute("data-menu-link"), btn);
    });
  });
}

document.getElementById("redirectLinkSearchInput").addEventListener("input", function () {
  redirectLinkSearchQuery = this.value.trim();
  drawRedirectLinksList();
});

function fullRedirectUrl(code) {
  return window.location.origin + "/redirect" + code;
}

/* ---------- Menu titik-tiga: Detail / Edit / Hapus ---------- */
const redirectLinkContextMenu = document.getElementById("redirectLinkContextMenu");

function openRedirectLinkContextMenu(id, triggerBtn) {
  contextMenuLinkId = id;
  const rect = triggerBtn.getBoundingClientRect();
  const menuWidth = 170;
  let left = rect.right - menuWidth;
  if (left < 8) left = 8;
  if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
  redirectLinkContextMenu.style.left = left + "px";
  redirectLinkContextMenu.style.top = rect.bottom + 6 + "px";
  redirectLinkContextMenu.classList.add("show");
  requestAnimationFrame(() => {
    const menuRect = redirectLinkContextMenu.getBoundingClientRect();
    if (menuRect.bottom > window.innerHeight - 8) {
      redirectLinkContextMenu.style.top = rect.top - menuRect.height - 6 + "px";
    }
  });
}
function closeRedirectLinkContextMenu() {
  redirectLinkContextMenu.classList.remove("show");
  contextMenuLinkId = null;
}
document.addEventListener("click", function (e) {
  if (!redirectLinkContextMenu.contains(e.target)) closeRedirectLinkContextMenu();
});
document.addEventListener("scroll", closeRedirectLinkContextMenu, true);

redirectLinkContextMenu.addEventListener("click", function (e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn || !contextMenuLinkId) return;
  const id = contextMenuLinkId;
  const action = btn.getAttribute("data-action");
  closeRedirectLinkContextMenu();

  if (action === "detail") openLinkDetailModal(id);
  else if (action === "edit") openEditLinkModal(id);
  else if (action === "delete") {
    openConfirmModal("Yakin ingin menghapus link ini? Link redirect-nya tidak akan bisa dipakai lagi.", async function () {
      try {
        await deleteRedirectLink(id);
        showToast("Link dihapus");
        renderRedirectLinksList();
      } catch (e2) {
        showToast(e2.message || "Gagal menghapus link");
      }
    });
  }
});

/* ---------- Modal Detail Link ---------- */
const linkDetailModalBackdrop = document.getElementById("linkDetailModalBackdrop");
function detailRowCopyable(label, value) {
  return `
    <div class="vrb-row">
      <div class="vrb-label">${escapeHtmlAdmin(label)}</div>
      <div class="vrb-value-copy-row">
        <div class="vrb-value">${escapeHtmlAdmin(value)}</div>
        <button type="button" class="vrb-copy-btn" data-copy-value="${escapeHtmlAdmin(value)}" aria-label="Salin link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
      </div>
    </div>`;
}
function openLinkDetailModal(id) {
  const l = redirectLinks.find((x) => x.id === id);
  if (!l) return;
  document.getElementById("linkDetailBody").innerHTML =
    detailRow("Nama Link", l.name) +
    detailRow("Tipe Link", l.type === "pc" ? "PC" : "Android") +
    detailRow("Nama Cloud", l.cloudName) +
    detailRow("Link Cloud", l.cloudLink) +
    detailRowCopyable("Link Redirect", fullRedirectUrl(l.redirectCode)) +
    detailRow("Tanggal Dibuat", formatReportDate(l.createdAt));
  linkDetailModalBackdrop.classList.add("show");
}
document.getElementById("linkDetailBody").addEventListener("click", async function (e) {
  const btn = e.target.closest("[data-copy-value]");
  if (!btn) return;
  const ok = await copyTextToClipboard(btn.getAttribute("data-copy-value"));
  showToast(ok ? "Link disalin" : "Gagal menyalin link");
});
document.getElementById("btnCloseLinkDetail").addEventListener("click", () => linkDetailModalBackdrop.classList.remove("show"));
linkDetailModalBackdrop.addEventListener("click", (e) => {
  if (e.target === linkDetailModalBackdrop) linkDetailModalBackdrop.classList.remove("show");
});

/* ---------- Salin ke clipboard (dipakai modal Tambahkan & Edit Link) ---------- */
async function copyTextToClipboard(text) {
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

/* ---------- Modal Tambahkan Link ---------- */
const addLinkModalBackdrop = document.getElementById("addLinkModalBackdrop");
const linkNameInput = document.getElementById("linkNameInput");
const linkCloudNameInput = document.getElementById("linkCloudNameInput");
const linkCloudLinkInput = document.getElementById("linkCloudLinkInput");
const linkRedirectResultInput = document.getElementById("linkRedirectResultInput");
const addLinkModalError = document.getElementById("addLinkModalError");
const linkSuccessMsg = document.getElementById("linkSuccessMsg");
const btnGenerateLink = document.getElementById("btnGenerateLink");

function setLinkTypeToggle(groupSelector, type) {
  document.querySelectorAll(groupSelector + " .link-type-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-type") === type);
  });
}

document.querySelectorAll("#addLinkModalBackdrop .link-type-btn").forEach((btn) => {
  btn.addEventListener("click", function () {
    addLinkType = this.getAttribute("data-type");
    setLinkTypeToggle("#addLinkModalBackdrop", addLinkType);
  });
});
document.querySelectorAll("#editLinkModalBackdrop .link-type-btn").forEach((btn) => {
  btn.addEventListener("click", function () {
    editLinkType = this.getAttribute("data-type");
    setLinkTypeToggle("#editLinkModalBackdrop", editLinkType);
  });
});

function resetAddLinkModal() {
  linkNameInput.value = "";
  linkCloudNameInput.value = "";
  linkCloudLinkInput.value = "";
  linkRedirectResultInput.value = "";
  addLinkType = "android";
  setLinkTypeToggle("#addLinkModalBackdrop", "android");
  addLinkModalError.classList.add("hidden");
  addLinkModalError.textContent = "";
  linkSuccessMsg.classList.add("hidden");
  btnGenerateLink.disabled = false;
  btnGenerateLink.textContent = "Buat Link";
  [linkNameInput, linkCloudNameInput, linkCloudLinkInput].forEach((el) => (el.disabled = false));
  document.querySelectorAll("#addLinkModalBackdrop .link-type-btn").forEach((btn) => (btn.disabled = false));
}

document.getElementById("btnAddRedirectLink").addEventListener("click", function () {
  resetAddLinkModal();
  addLinkModalBackdrop.classList.add("show");
});

document.getElementById("btnGenerateLink").addEventListener("click", async function () {
  const name = linkNameInput.value.trim();
  const cloudName = linkCloudNameInput.value.trim();
  const cloudLink = linkCloudLinkInput.value.trim();
  if (!name || !cloudName || !cloudLink) {
    addLinkModalError.textContent = "Semua kolom harus diisi";
    addLinkModalError.classList.remove("hidden");
    return;
  }
  addLinkModalError.classList.add("hidden");
  const btn = this;
  btn.disabled = true;
  btn.textContent = "Membuat…";
  try {
    const result = await createRedirectLink({ name, type: addLinkType, cloudName, cloudLink });
    linkRedirectResultInput.value = fullRedirectUrl(result.redirectCode);
    linkSuccessMsg.classList.remove("hidden");
    btn.textContent = "Buat Link";
    // Sudah tersimpan otomatis ke Daftar Link -> kunci form supaya tidak dobel-buat.
    [linkNameInput, linkCloudNameInput, linkCloudLinkInput].forEach((el) => (el.disabled = true));
    document.querySelectorAll("#addLinkModalBackdrop .link-type-btn").forEach((b) => (b.disabled = true));
    renderRedirectLinksList();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Buat Link";
    addLinkModalError.textContent = e.message || "Gagal membuat link";
    addLinkModalError.classList.remove("hidden");
  }
});

document.getElementById("btnCopyGeneratedLink").addEventListener("click", async function () {
  if (!linkRedirectResultInput.value) return;
  const ok = await copyTextToClipboard(linkRedirectResultInput.value);
  showToast(ok ? "Link disalin" : "Gagal menyalin link");
});

document.getElementById("btnCloseAddLinkModal").addEventListener("click", function () {
  addLinkModalBackdrop.classList.remove("show");
  renderRedirectLinksList();
});

/* ---------- Modal Edit Link ---------- */
const editLinkModalBackdrop = document.getElementById("editLinkModalBackdrop");
const editLinkNameInput = document.getElementById("editLinkNameInput");
const editLinkCloudNameInput = document.getElementById("editLinkCloudNameInput");
const editLinkCloudLinkInput = document.getElementById("editLinkCloudLinkInput");
const editLinkRedirectInput = document.getElementById("editLinkRedirectInput");
const editLinkModalError = document.getElementById("editLinkModalError");

function openEditLinkModal(id) {
  const l = redirectLinks.find((x) => x.id === id);
  if (!l) return;
  editingLinkId = id;
  editLinkNameInput.value = l.name;
  editLinkCloudNameInput.value = l.cloudName;
  editLinkCloudLinkInput.value = l.cloudLink;
  editLinkRedirectInput.value = fullRedirectUrl(l.redirectCode);
  editLinkType = l.type;
  setLinkTypeToggle("#editLinkModalBackdrop", editLinkType);
  editLinkModalError.classList.add("hidden");
  editLinkModalError.textContent = "";
  editLinkModalBackdrop.classList.add("show");
}
document.getElementById("btnCancelEditLink").addEventListener("click", () => editLinkModalBackdrop.classList.remove("show"));
editLinkModalBackdrop.addEventListener("click", (e) => {
  if (e.target === editLinkModalBackdrop) editLinkModalBackdrop.classList.remove("show");
});
document.getElementById("btnCopyEditLink").addEventListener("click", async function () {
  if (!editLinkRedirectInput.value) return;
  const ok = await copyTextToClipboard(editLinkRedirectInput.value);
  showToast(ok ? "Link disalin" : "Gagal menyalin link");
});

document.getElementById("btnSaveEditLink").addEventListener("click", async function () {
  const name = editLinkNameInput.value.trim();
  const cloudName = editLinkCloudNameInput.value.trim();
  const cloudLink = editLinkCloudLinkInput.value.trim();
  if (!name || !cloudName || !cloudLink) {
    editLinkModalError.textContent = "Semua kolom harus diisi";
    editLinkModalError.classList.remove("hidden");
    return;
  }
  try {
    await updateRedirectLink(editingLinkId, { name, type: editLinkType, cloudName, cloudLink });
    showToast("Link diperbarui");
    editLinkModalBackdrop.classList.remove("show");
    renderRedirectLinksList();
  } catch (e) {
    editLinkModalError.textContent = e.message || "Gagal menyimpan link";
    editLinkModalError.classList.remove("hidden");
  }
});

document.addEventListener("DOMContentLoaded", function () {
  initAdminThemeToggle();
  populatePlatformSelect();
  populateBahasaSelect();
  populateJenisSelect();
  renderGenreChips();
  if (isLoggedIn()) {
    viewLogin.classList.add("hidden");
    adminShell.classList.remove("hidden");
    showSub("viewMenu");
    // Sesi lama dipulihkan setelah refresh/reload halaman (bukan lewat
    // doLogin) -> pasang juga trap tombol back HP di sini, supaya back
    // tetap tertangani dengan benar walau Admin Panel dibuka ulang dari
    // sesi yang sudah login sebelumnya.
    pushBackTrap();
    fetchServerNotifications();
    startServerNotificationsPolling();
  } else {
    viewLogin.classList.remove("hidden");
    adminShell.classList.add("hidden");
    document.getElementById("passwordInput").focus();
  }
});

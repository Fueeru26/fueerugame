/* =========================================================
   Fueeru Game — Service Worker
   Cache aset statis (css/js/gambar) supaya situs lebih cepat
   dibuka kedua kali & tetap bisa dibuka (versi cache) walau
   sedang tidak ada koneksi internet.

   Strategi: "stale-while-revalidate" — tampilkan versi dari
   cache dulu (kalau ada) supaya cepat, sambil diam-diam ambil
   versi terbaru dari server untuk memperbarui cache di
   belakang layar.
   ========================================================= */

const CACHE_NAME = "fueeru-game-cache-v18";

const PRECACHE_URLS = [
  "./",
  "index.html",
  "manifest.json",
  "css/style.css",
  "js/data.js",
  "js/main.js",
  "webpictures/logo.webp",
  "webpictures/header.webp",
  "webpictures/postplaceholder.webp",
  "webpictures/404.webp",
  "web/404.html",
  "web/category.html",
  "web/donasi.html",
  "web/lapor.html",
  "web/request.html",
  "web/info.html",
  "web/fitur.html",
  "web/emulator.html",
  "web/search.html",
  "web/tentang.html",
  "web/list.html",
  "web/post.html",
  "web/cara-download.html"
];

/* Cloudflare (assets.html_handling) otomatis redirect "xxx.html" -> "xxx"
   (307). Kalau response hasil redirect itu langsung disimpan ke Cache
   lalu suatu saat dipakai buat respondWith() request navigasi (buka
   halaman), Chrome akan menolaknya: "Response served by service worker
   has redirections" -> muncul sebagai ERR_FAILED / "Situs ini tidak
   dapat dijangkau", walau server aslinya baik-baik saja. Makanya sebelum
   disimpan ke cache, response yang "redirected" dibungkus ulang jadi
   Response baru (redirected: false) supaya aman dipakai lagi nanti. */
function stripRedirected(response) {
  if (!response || !response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url)
            .then((res) => cache.put(url, stripRedirected(res)))
            .catch(() => {
              /* Kalau satu URL gagal di-precache (mis. belum ada koneksi
                 saat install), jangan gagalkan instalasi SW-nya / URL lain. */
            })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Cuma tangani GET; biarkan request lain (POST, dll — situs ini
  // sebenarnya tidak punya, tapi jaga-jaga) lewat apa adanya.
  if (req.method !== "GET") return;
  // Jangan cache Admin Panel — datanya harus selalu fresh dari sesi aktif.
  // Cakup semua aset Admin Panel (admin.html, js/admin.js, css/admin.css,
  // admin-manifest.json, ikon admin), bukan cuma admin.html saja.
  if (req.url.indexOf("admin") !== -1) return;
  // Jangan cache endpoint API (/api/...) — datanya dinamis (postingan,
  // link redirect, laporan, dll) dan harus selalu diambil langsung dari
  // server, bukan versi lama dari cache. Tanpa ini, aksi di Admin Panel
  // (publish/hapus/edit) tidak langsung terlihat sampai halaman dibuka
  // ulang, karena stale-while-revalidate di bawah akan membalas cache
  // lama duluan sebelum sempat memperbarui dirinya sendiri.
  if (new URL(req.url).pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, stripRedirected(clone)));
          }
          return res;
        })
        .catch(() => cached); // offline -> pakai versi cache kalau ada
      return stripRedirected(cached) || network;
    })
  );
});

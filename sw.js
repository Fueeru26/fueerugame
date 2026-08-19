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

const CACHE_NAME = "fueeru-game-cache-v2";

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
  "web/search.html",
  "web/tentang.html",
  "web/list.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        /* Kalau salah satu URL gagal di-precache (mis. belum ada koneksi
           saat install), jangan gagalkan instalasi SW-nya. */
      })
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
  if (req.url.indexOf("admin.html") !== -1) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached); // offline -> pakai versi cache kalau ada
      return cached || network;
    })
  );
});

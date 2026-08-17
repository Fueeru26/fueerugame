/* =========================================================
   Fueeru Game — Service Worker
   Cache aset statis (css/js/gambar) supaya situs lebih cepat
   dibuka kedua kali & tetap bisa dibuka (versi cache) walau
   sedang tidak ada koneksi internet.

   Strategi:
   - HTML & JS (kode situs, sering berubah saat development):
     "network-first" — SELALU coba ambil versi terbaru dari
     server dulu; cache cuma dipakai sebagai cadangan kalau
     sedang offline/network gagal. Ini supaya perubahan yang
     baru di-deploy langsung terlihat, tidak "nyangkut" di
     cache lama seperti sebelumnya.
   - Aset lain (gambar/font/dll, jarang berubah): "cache-first"
     — tampil cepat dari cache kalau ada, sambil diam-diam
     diperbarui di belakang layar untuk kunjungan berikutnya.
   ========================================================= */

/* Naikkan angka versi ini tiap kali PRECACHE_URLS berubah, atau saat
   perlu memaksa semua browser membuang cache lama (mis. ada aset yang
   sempat ke-cache dalam kondisi rusak/gagal muat di deploy sebelumnya).
   Cache lama otomatis dihapus lewat event "activate" di bawah. */
const CACHE_NAME = "fueeru-game-cache-v3";

/* Ekstensi yang dianggap "kode situs" -> selalu network-first supaya
   update dari deploy terbaru langsung kepakai, bukan versi cache lama. */
const CODE_EXT = ["html", "js"];

function isCodeRequest(url) {
  const clean = url.split("?")[0].split("#")[0];
  if (clean.endsWith("/")) return true; // mis. "./" -> dianggap dokumen HTML
  const ext = clean.slice(clean.lastIndexOf(".") + 1).toLowerCase();
  return CODE_EXT.includes(ext);
}

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
  "web/tentang.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      /* PENTING: pakai cache.add() satu-satu (bukan cache.addAll()).
         addAll() bersifat all-or-nothing — kalau SATU SAJA URL gagal
         dimuat (mis. koneksi lambat/putus saat instalasi, atau file
         baru saja di-deploy dan belum sepenuhnya tersedia), SELURUH
         daftar gagal di-cache, termasuk aset yang sebenarnya baik-baik
         saja. Dengan Promise.allSettled + cache.add() per file, satu
         aset yang gagal tidak lagi menggagalkan/mengosongkan cache
         aset lain. */
      Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {
            /* diabaikan — aset ini akan tetap dicoba lewat network saat diminta */
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
  if (req.url.indexOf("admin.html") !== -1) return;

  if (isCodeRequest(req.url)) {
    // Network-first: utamakan versi terbaru dari server. Cache cuma
    // dipakai kalau network benar-benar gagal (mis. offline).
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Aset non-kode (gambar/font/dll): cache-first / stale-while-revalidate
  // seperti sebelumnya — cepat tampil, diperbarui di belakang layar.
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

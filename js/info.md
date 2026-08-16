# Folder: js

Berisi seluruh script situs. Tidak ada backend/server — semua data
(postingan, laporan, sesi admin, manajemen file) disimpan di
localStorage browser.

| File | Kegunaan |
|---|---|
| `data.js` | Data layer: menyimpan & mengambil postingan dan laporan dari localStorage, data postingan contoh (seed), serta fungsi bantu (format tanggal, preview teks, dll). |
| `main.js` | Logika bersama halaman publik: navbar, sidebar, overlay pencarian, render kartu/​daftar postingan, pagination, serta fungsi buka/tutup (toggle) kotak Spoiler. Juga berisi helper penyesuaian path (`SITE_BASE`/`ASSET_BASE`) supaya tautan & gambar tetap benar baik dari `index.html` (folder utama) maupun dari halaman di folder `web/`. |
| `admin.js` | Seluruh logika Admin Panel: login, dashboard, CRUD postingan, editor konten (termasuk tombol Spoiler & Preview), manajemen laporan, dan manajemen file (memakai `vfs.js`). |
| `vfs.js` | "Virtual File System" untuk fitur Manajemen File di Admin Panel — mensimulasikan struktur folder situs di atas localStorage (bukan mengubah file asli di server). |

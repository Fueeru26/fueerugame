# Folder: css

Berisi seluruh stylesheet situs.

| File | Kegunaan |
|---|---|
| `style.css` | Style utama situs publik (navbar, sidebar, kartu game, halaman postingan, dll). Dipakai di semua halaman publik (`index.html`, isi folder `web/`) **dan** dimuat juga oleh `admin.html` supaya tampilan Preview Postingan konsisten dengan tampilan publik. Juga berisi deklarasi `@font-face` untuk font custom (FredokaOne, folder `font/`). |
| `admin.css` | Style khusus Admin Panel (login, dashboard, form postingan, manajemen file, dll). Hanya dimuat oleh `admin.html`. |

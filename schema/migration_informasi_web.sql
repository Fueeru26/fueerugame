-- Migrasi untuk rombak "Informasi Web" — jalankan SEKALI di database yang
-- sudah ada (yang sudah dipakai live), supaya kolom & tabel baru tersedia.
--
--   wrangler d1 execute fueeru-db --remote --file=schema/migration_informasi_web.sql
--
-- Aman dijalankan ulang (idempotent): ALTER TABLE ADD COLUMN dibungkus
-- try/kondisi lewat pendekatan "buat tabel baru kalau kolom belum ada"
-- tidak didukung SQLite secara native, jadi kalau kolom SUDAH ada dan
-- kamu jalankan ulang file ini, D1 akan menampilkan error
-- "duplicate column name" untuk baris ALTER TABLE itu saja — abaikan,
-- baris lain tetap jalan normal.

ALTER TABLE site_visits ADD COLUMN device TEXT;
ALTER TABLE site_visits ADD COLUMN country TEXT;
ALTER TABLE site_visits ADD COLUMN city TEXT;
ALTER TABLE site_visits ADD COLUMN referrer TEXT;

CREATE TABLE IF NOT EXISTS page_views (
  id TEXT PRIMARY KEY,
  pageId TEXT NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_fail_attempts (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL
);

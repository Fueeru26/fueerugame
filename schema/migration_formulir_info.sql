-- Migration: Formulir (gabung Laporkan Masalah + Request Game) & Update Info
-- Jalankan sekali di database yang sudah ada:
--   wrangler d1 execute fueeru-db --remote --file=schema/migration_formulir_info.sql
--
-- Catatan: SQLite tidak punya "ADD COLUMN IF NOT EXISTS", jadi kalau migration
-- ini pernah dijalankan sebelumnya dan diulang, akan muncul error
-- "duplicate column name" untuk baris ALTER TABLE — itu aman diabaikan,
-- lanjut saja (baris CREATE TABLE di bawah tetap aman diulang).

ALTER TABLE reports ADD COLUMN formType TEXT NOT NULL DEFAULT 'lapor';
ALTER TABLE reports ADD COLUMN gameName TEXT;
ALTER TABLE reports ADD COLUMN engine TEXT;
ALTER TABLE reports ADD COLUMN gameLink TEXT;

CREATE TABLE IF NOT EXISTS info_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,     -- update-game | bug-fix | info-admin
  content TEXT NOT NULL,
  gameLink TEXT,
  date TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

INSERT OR IGNORE INTO pages (id, title, content) VALUES
  ('fitur', 'Fitur Tambahan', '<p>Isi halaman Fitur Tambahan.</p>');

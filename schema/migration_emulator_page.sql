-- Migration: tambah halaman Emulator
-- Jalankan sekali di database yang sudah ada:
--   wrangler d1 execute fueeru-db --remote --file=schema/migration_emulator_page.sql

INSERT OR IGNORE INTO pages (id, title, content) VALUES
  ('emulator', 'Emulator', '<p>Isi halaman Emulator.</p>');

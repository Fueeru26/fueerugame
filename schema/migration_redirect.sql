-- Migrasi untuk fitur "Redirect Page" — jalankan SEKALI di database yang
-- sudah ada (yang sudah dipakai live), supaya tabel baru tersedia.
--
--   wrangler d1 execute fueeru-db --remote --file=schema/migration_redirect.sql
--
-- Aman dijalankan ulang (idempotent): pakai CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS redirect_sections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS redirect_links (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  cloudName TEXT NOT NULL,
  cloudLink TEXT NOT NULL,
  redirectCode TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL
);

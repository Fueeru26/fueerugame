-- Fueeru Game — D1 schema
-- Jalankan sekali saat setup: wrangler d1 execute fueeru-db --remote --file=schema/schema.sql

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  jenis TEXT,
  genres TEXT,      -- JSON array, mis. ["RPG","Action"]
  platform TEXT,     -- JSON array, mis. ["Android","PC"]
  bahasa TEXT,
  date TEXT,
  thumbnail TEXT,
  content TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  scheduledAt TEXT,
  createdAt TEXT,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS trash_posts (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,   -- JSON lengkap post asli
  deletedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  title TEXT,
  name TEXT,
  contactMedia TEXT,
  content TEXT,
  attachment TEXT,   -- JSON {name, dataUrl} atau NULL
  date TEXT,
  status TEXT DEFAULT 'belum'
);

CREATE TABLE IF NOT EXISTS trash_reports (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  deletedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,   -- tutorial | cara-download | donasi | tentang
  title TEXT,
  content TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Password admin default: admin123 (ganti lewat Admin Panel setelah deploy pertama)
INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', 'admin123');

INSERT OR IGNORE INTO pages (id, title, content) VALUES
  ('tutorial', 'Tutorial Main', '<p>Isi halaman Tutorial Main.</p>'),
  ('cara-download', 'Cara Download', '<p>Isi halaman Cara Download.</p>'),
  ('donasi', 'Donasi', '<p>Isi halaman Donasi.</p>'),
  ('tentang', 'Tentang', '<p>Isi halaman Tentang.</p>');

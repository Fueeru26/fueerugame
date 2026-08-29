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
  status TEXT DEFAULT 'belum',  -- belum | sedang | selesai | ditolak
  formType TEXT NOT NULL DEFAULT 'lapor',  -- 'lapor' (Laporkan Masalah) | 'request' (Request Game)
  gameName TEXT,     -- khusus formType = 'request'
  engine TEXT,       -- khusus formType = 'request': tidak-tahu | rpgm | tyrano
  gameLink TEXT       -- khusus formType = 'request'
);

CREATE TABLE IF NOT EXISTS trash_reports (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  deletedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,   -- tutorial | cara-download | donasi | tentang | fitur
  title TEXT,
  content TEXT
);

-- Update Info: kartu yang tampil di web/info.html + menu "Update Info" di Admin Panel.
CREATE TABLE IF NOT EXISTS info_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,     -- update-game | bug-fix | info-admin
  content TEXT NOT NULL,
  gameLink TEXT,           -- khusus type update-game / bug-fix (tombol "Lihat Game")
  date TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deploy_sessions (
  id TEXT PRIMARY KEY,
  files TEXT NOT NULL DEFAULT '[]',
  expectedTotal INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS server_notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS processed_workflow_runs (
  run_id TEXT PRIMARY KEY,
  processedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_visits (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  device TEXT,      -- 'mobile' | 'desktop'
  country TEXT,      -- kode negara 2-huruf dari Cloudflare (mis. ID, US)
  city TEXT,
  referrer TEXT       -- domain perujuk, atau 'Direct' kalau kosong
);

CREATE TABLE IF NOT EXISTS post_views (
  id TEXT PRIMARY KEY,
  postId TEXT NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS page_views (
  id TEXT PRIMARY KEY,
  pageId TEXT NOT NULL,   -- tutorial | cara-download | donasi | tentang
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_fail_attempts (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL     -- hanya waktu, tanpa IP (demi privasi)
);

-- Password admin default: admin123 (ganti lewat Admin Panel setelah deploy pertama)
INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', 'admin123');

INSERT OR IGNORE INTO pages (id, title, content) VALUES
  ('tutorial', 'Tutorial Main', '<p>Isi halaman Tutorial Main.</p>'),
  ('cara-download', 'Cara Download', '<p>Isi halaman Cara Download.</p>'),
  ('donasi', 'Donasi', '<p>Isi halaman Donasi.</p>'),
  ('tentang', 'Tentang', '<p>Isi halaman Tentang.</p>'),
  ('fitur', 'Fitur Tambahan', '<p>Isi halaman Fitur Tambahan.</p>'),
  ('emulator', 'Emulator', '<p>Isi halaman Emulator.</p>');

CREATE TABLE IF NOT EXISTS redirect_sections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT,           -- kode HTML (kosong/NULL utk bagian terkunci "Redirect Countdown")
  sortOrder INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,   -- 1 = bagian "Redirect Countdown", tak bisa diedit/dihapus
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS redirect_links (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'android' | 'pc'
  cloudName TEXT NOT NULL,
  cloudLink TEXT NOT NULL,
  redirectCode TEXT NOT NULL UNIQUE,   -- kode unik di path /redirect<code>
  createdAt TEXT NOT NULL
);

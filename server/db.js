/* =====================================================
   Kết nối & khởi tạo CSDL SQLite (nguồn dữ liệu THẬT).
   Dùng SQLite TÍCH HỢP của Node (node:sqlite) — không cần biên dịch native,
   không phụ thuộc gói ngoài. Yêu cầu Node >= 22 (khuyến nghị 24+).
   Lưu file tại data/rumtran.db.
   ===================================================== */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'rumtran.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  phone              TEXT UNIQUE NOT NULL,
  name               TEXT NOT NULL DEFAULT '',
  created_at         INTEGER NOT NULL,
  loyalty_points     INTEGER NOT NULL DEFAULT 0,
  membership_tier    TEXT,
  membership_label   TEXT,
  membership_pct     INTEGER NOT NULL DEFAULT 0,
  membership_expires INTEGER,
  referral_code      TEXT UNIQUE,
  referral_balance   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bookings (
  code               TEXT PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id),
  created_at         INTEGER NOT NULL,
  status_idx         INTEGER NOT NULL DEFAULT 0,
  tech_id            INTEGER,
  total              INTEGER NOT NULL,
  member_pct         INTEGER NOT NULL DEFAULT 0,
  datetime_label     TEXT,
  urgent             INTEGER NOT NULL DEFAULT 0,
  address            TEXT,
  cust_name          TEXT,
  cust_phone         TEXT,
  note               TEXT,
  payment            TEXT NOT NULL DEFAULT 'cash',
  items_json         TEXT NOT NULL DEFAULT '[]',
  addons_json        TEXT NOT NULL DEFAULT '[]',
  rating_stars       INTEGER,
  rating_comment     TEXT
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);

CREATE TABLE IF NOT EXISTS product_orders (
  code           TEXT PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  ts             INTEGER NOT NULL,
  lines_json     TEXT NOT NULL DEFAULT '[]',
  total          INTEGER NOT NULL DEFAULT 0,
  method         TEXT NOT NULL DEFAULT 'cash',
  points_earned  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_porders_user ON product_orders(user_id);

CREATE TABLE IF NOT EXISTS points_history (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER NOT NULL REFERENCES users(id),
  ts       INTEGER NOT NULL,
  delta    INTEGER NOT NULL,
  note     TEXT
);
CREATE INDEX IF NOT EXISTS idx_points_user ON points_history(user_id);

CREATE TABLE IF NOT EXISTS referral_history (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER NOT NULL REFERENCES users(id),
  ts       INTEGER NOT NULL,
  amount   INTEGER NOT NULL,
  note     TEXT
);
CREATE INDEX IF NOT EXISTS idx_ref_user ON referral_history(user_id);

CREATE TABLE IF NOT EXISTS ktv_accounts (
  tech_id  INTEGER PRIMARY KEY,
  balance  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ktv_jobs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  tech_id   INTEGER NOT NULL,
  customer  TEXT NOT NULL,
  service   TEXT NOT NULL,
  value     INTEGER NOT NULL,
  status    TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_jobs_tech ON ktv_jobs(tech_id);

-- Kỹ thuật viên (đăng ký + duyệt, có ẢNH thật, lọc theo khu vực như Glow)
CREATE TABLE IF NOT EXISTS technicians (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL,
  phone               TEXT,
  initials            TEXT,
  gender              TEXT DEFAULT 'nu',
  area                TEXT,
  rating              REAL NOT NULL DEFAULT 5.0,
  reviews             INTEGER NOT NULL DEFAULT 0,
  distance            REAL,
  years               INTEGER NOT NULL DEFAULT 0,
  soonest             TEXT,
  certs_json          TEXT NOT NULL DEFAULT '[]',
  sample_reviews_json TEXT NOT NULL DEFAULT '[]',
  bio                 TEXT,
  photo               TEXT,
  status              TEXT NOT NULL DEFAULT 'approved',
  created_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tech_status ON technicians(status);
`);

/* ---- Migration nhẹ: thêm cột mới cho tính năng "đặt hộ người thân" ---- */
function ensureColumn(table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('bookings', 'booking_for', "booking_for TEXT NOT NULL DEFAULT 'self'"); // 'self' | 'relative'
ensureColumn('bookings', 'patient_name', 'patient_name TEXT');
ensureColumn('bookings', 'relation', 'relation TEXT');

// Giới thiệu THẬT: ai giới thiệu người này + đã cộng hoa hồng đơn đầu chưa
ensureColumn('users', 'referred_by', 'referred_by INTEGER');
ensureColumn('users', 'first_order_credited', 'first_order_credited INTEGER NOT NULL DEFAULT 0');

// Giấy tờ KTV nộp khi đăng ký — CHỈ quản trị xem, không bao giờ trả ra API công khai
ensureColumn('technicians', 'cert_photos_json', "cert_photos_json TEXT NOT NULL DEFAULT '[]'");
ensureColumn('technicians', 'cccd_front', 'cccd_front TEXT');
ensureColumn('technicians', 'cccd_back', 'cccd_back TEXT');

module.exports = db;

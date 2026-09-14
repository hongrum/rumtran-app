/* =====================================================
   RUM TRẦN KHỎE ĐẸP — API server (app THẬT)
   Express + SQLite. Server là NGUỒN DỮ LIỆU THẬT: mọi tính tiền,
   tích điểm, hoa hồng, ví KTV đều do server quyết định (client chỉ hiển thị).
   ===================================================== */
const path = require('path');
const express = require('express');
const db = require('./db');
const {
  SERVICES, ADDONS, PRODUCTS, MEMBERSHIP_PLANS, TECHS, STATUSES, CONFIG,
} = require('./data');

const app = express();
app.use(express.json());

/* ---------------- Tiện ích ---------------- */
const findService = (id) => SERVICES.find((s) => s.id === id) || null;
const findAddon = (id) => ADDONS.find((a) => a.id === id) || null;
const findProduct = (id) => PRODUCTS.find((p) => p.id === id) || null;
const findPlan = (id) => MEMBERSHIP_PLANS.find((p) => p.id === id) || null;
const findTech = (id) => TECHS.find((t) => t.id === Number(id)) || null;
const nearestTech = () => TECHS.reduce((best, t) => (t.distance < best.distance ? t : best), TECHS[0]);

function base36(n) { return n.toString(36).toUpperCase(); }
function genCode(prefix) { return prefix + base36(Date.now()).slice(-6) + Math.floor(Math.random() * 90 + 10); }
function applyPct(amount, pct) { return pct ? Math.round(amount * (1 - pct / 100)) : amount; }
// Chi phí đổi điểm cho 1 sản phẩm — tính từ CONFIG.redeemPerPoint (cửa hàng chỉnh 1 chỗ)
function productPointCost(p) { return Math.max(1, Math.ceil(p.price / CONFIG.redeemPerPoint)); }
function productWithPoints(p) { return Object.assign({}, p, { pointCost: productPointCost(p) }); }

function ensureReferralCode(user) {
  if (user.referral_code) return user.referral_code;
  let code;
  const digits = (user.phone || '').replace(/\D/g, '');
  const suffix = digits ? digits.slice(-4) : Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-4);
  do {
    code = 'RT' + suffix + base36(Date.now()).slice(-2) + Math.floor(Math.random() * 9);
  } while (db.prepare('SELECT 1 FROM users WHERE referral_code = ?').get(code));
  db.prepare('UPDATE users SET referral_code = ? WHERE id = ?').run(code, user.id);
  user.referral_code = code;
  return code;
}

function membershipPct(user) {
  if (!user.membership_tier) return 0;
  if (user.membership_expires && user.membership_expires < Date.now()) return 0;
  return user.membership_pct || 0;
}

function addPoints(userId, delta, note) {
  db.prepare('UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?').run(delta, userId);
  db.prepare('INSERT INTO points_history (user_id, ts, delta, note) VALUES (?,?,?,?)')
    .run(userId, Date.now(), delta, note);
}

function publicUser(u) {
  return {
    id: u.id,
    phone: u.phone,
    name: u.name,
    loyaltyPoints: u.loyalty_points,
    membership: u.membership_tier
      ? { tier: u.membership_tier, label: u.membership_label, discountPct: u.membership_pct, expiresAt: u.membership_expires }
      : { tier: null, discountPct: 0, label: null, expiresAt: null },
    referral: { code: u.referral_code, balance: u.referral_balance },
  };
}

/* ---------------- Auth (đăng nhập bằng SĐT — nhẹ cho MVP) ---------------- */
function authUser(req, res, next) {
  const id = Number(req.header('x-user-id'));
  if (!id) return res.status(401).json({ error: 'Chưa đăng nhập' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return res.status(401).json({ error: 'Người dùng không tồn tại' });
  req.user = u;
  next();
}

app.post('/api/auth/login', (req, res) => {
  const phone = String(req.body.phone || '').trim();
  const name = String(req.body.name || '').trim();
  if (phone.replace(/\D/g, '').length < 9) return res.status(400).json({ error: 'Số điện thoại không hợp lệ' });
  let u = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!u) {
    const info = db.prepare('INSERT INTO users (phone, name, created_at) VALUES (?,?,?)')
      .run(phone, name, Date.now());
    u = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  } else if (name && name !== u.name) {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, u.id);
    u.name = name;
  }
  ensureReferralCode(u);
  u = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  res.json({ token: String(u.id), user: publicUser(u) });
});

/* ---------------- Catalog (danh mục công khai) ---------------- */
app.get('/api/catalog', (_req, res) => {
  res.json({
    services: SERVICES, addons: ADDONS,
    products: PRODUCTS.map(productWithPoints),
    membershipPlans: MEMBERSHIP_PLANS, techs: TECHS, statuses: STATUSES,
    areas: CONFIG.areas,
    config: { pointRate: CONFIG.pointRate, referralPct: CONFIG.referralPct, ktvPlatformFee: CONFIG.ktvPlatformFee, ktvMinBalance: CONFIG.ktvMinBalance, brand: CONFIG.brand },
  });
});

/* ---------------- Hồ sơ của tôi (điểm, hội viên, hoa hồng, lịch sử) ---------------- */
app.get('/api/me', authUser, (req, res) => {
  const u = req.user;
  const bookings = db.prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC').all(u.id).map(rowBooking);
  const productOrders = db.prepare('SELECT * FROM product_orders WHERE user_id = ? ORDER BY ts DESC').all(u.id)
    .map((o) => ({ code: o.code, ts: o.ts, lines: JSON.parse(o.lines_json), total: o.total, method: o.method, pointsEarned: o.points_earned }));
  const pointsHistory = db.prepare('SELECT ts, delta, note FROM points_history WHERE user_id = ? ORDER BY ts DESC LIMIT 20').all(u.id);
  const referralHistory = db.prepare('SELECT ts, amount, note FROM referral_history WHERE user_id = ? ORDER BY ts DESC LIMIT 20').all(u.id);
  res.json({ user: publicUser(u), bookings, productOrders, pointsHistory, referralHistory });
});

function rowBooking(b) {
  return {
    code: b.code, createdAt: b.created_at, statusIdx: b.status_idx, techId: b.tech_id,
    total: b.total, memberPct: b.member_pct, dateTimeLabel: b.datetime_label, urgent: !!b.urgent,
    address: b.address, custName: b.cust_name, custPhone: b.cust_phone, note: b.note, payment: b.payment,
    bookingFor: b.booking_for || 'self', patientName: b.patient_name, relation: b.relation,
    items: JSON.parse(b.items_json), addons: JSON.parse(b.addons_json),
    ratingStars: b.rating_stars, ratingComment: b.rating_comment,
    tech: b.tech_id ? findTech(b.tech_id) : null,
    statuses: STATUSES,
  };
}

/* ---------------- Đặt lịch dịch vụ ---------------- */
app.post('/api/bookings', authUser, (req, res) => {
  const u = req.user;
  const { cart = [], addons = [], techId, dateTimeLabel, urgent, address, custName, custPhone, note, payment,
    bookingFor, patientName, relation } = req.body;
  if (!Array.isArray(cart) || cart.length === 0) return res.status(400).json({ error: 'Chưa chọn dịch vụ' });
  if (!custName || String(custName).trim().length < 2) return res.status(400).json({ error: 'Thiếu tên khách' });
  if (!custPhone || String(custPhone).replace(/\D/g, '').length < 9) return res.status(400).json({ error: 'SĐT không hợp lệ' });
  if (!address || String(address).trim().length < 5) return res.status(400).json({ error: 'Địa chỉ chưa hợp lệ' });

  const pct = membershipPct(u);
  // Tính tiền THẬT ở server dựa trên bảng giá gốc — không tin giá client gửi lên
  let items = [];
  for (const it of cart) {
    const svc = findService(it.serviceId);
    if (!svc) return res.status(400).json({ error: 'Dịch vụ không tồn tại: ' + it.serviceId });
    const tier = svc.tiers.find((t) => t.m === Number(it.minutes));
    if (!tier) return res.status(400).json({ error: 'Mức thời lượng không hợp lệ cho ' + svc.name });
    items.push({ serviceId: svc.id, minutes: tier.m, price: tier.p });
  }
  const validAddons = (addons || []).filter((id) => findAddon(id));
  let raw = items.reduce((s, i) => s + i.price, 0)
    + validAddons.reduce((s, id) => s + findAddon(id).price, 0);
  const total = applyPct(raw, pct);

  const techFinal = techId === 'auto' || techId == null ? nearestTech() : findTech(techId);
  const forWhom = bookingFor === 'relative' ? 'relative' : 'self';
  const code = genCode('RT');
  db.prepare(`INSERT INTO bookings
    (code, user_id, created_at, status_idx, tech_id, total, member_pct, datetime_label, urgent, address, cust_name, cust_phone, note, payment, items_json, addons_json, booking_for, patient_name, relation)
    VALUES (?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      code, u.id, Date.now(), techFinal ? techFinal.id : null,
      total, pct, dateTimeLabel || '', urgent ? 1 : 0,
      String(address), String(custName), String(custPhone), note ? String(note) : '',
      payment === 'transfer' ? 'transfer' : 'cash',
      JSON.stringify(items), JSON.stringify(validAddons),
      forWhom, forWhom === 'relative' && patientName ? String(patientName) : null,
      forWhom === 'relative' && relation ? String(relation) : null
    );

  // Tích điểm: 10.000đ = 1 điểm (trên giá sau giảm hội viên)
  const earned = Math.floor(total / CONFIG.pointRate);
  if (earned > 0) addPoints(u.id, earned, 'Đặt lịch dịch vụ #' + code);

  const booking = rowBooking(db.prepare('SELECT * FROM bookings WHERE code = ?').get(code));
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  res.json({ booking, pointsEarned: earned, user: publicUser(fresh) });
});

app.get('/api/bookings/:code', (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE code = ?').get(req.params.code);
  if (!b) return res.status(404).json({ error: 'Không tìm thấy đơn' });
  res.json({ booking: rowBooking(b) });
});

// Chuyển trạng thái đơn (dùng bởi nút mô phỏng / sau này là KTV & điều phối)
app.post('/api/bookings/:code/advance', (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE code = ?').get(req.params.code);
  if (!b) return res.status(404).json({ error: 'Không tìm thấy đơn' });
  const next = Math.min(STATUSES.length - 1, b.status_idx + 1);
  db.prepare('UPDATE bookings SET status_idx = ? WHERE code = ?').run(next, b.code);
  res.json({ booking: rowBooking(db.prepare('SELECT * FROM bookings WHERE code = ?').get(b.code)) });
});

app.post('/api/bookings/:code/rating', authUser, (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE code = ?').get(req.params.code);
  if (!b) return res.status(404).json({ error: 'Không tìm thấy đơn' });
  if (b.user_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });
  const stars = Number(req.body.stars);
  if (!(stars >= 1 && stars <= 5)) return res.status(400).json({ error: 'Vui lòng chọn 1–5 sao' });
  db.prepare('UPDATE bookings SET rating_stars = ?, rating_comment = ? WHERE code = ?')
    .run(stars, String(req.body.comment || ''), b.code);
  res.json({ ok: true });
});

/* ---------------- Sản phẩm ---------------- */
app.post('/api/products/checkout', authUser, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const cart = Array.isArray(req.body.cart) ? req.body.cart : [];
  const method = req.body.method === 'referral' ? 'referral' : 'cash';
  const pct = membershipPct(u);
  let total = 0; const lines = [];
  for (const i of cart) {
    const p = findProduct(i.productId);
    const qty = Math.max(1, Number(i.qty) || 0);
    if (!p) continue;
    const price = applyPct(p.price, pct);
    total += price * qty;
    lines.push({ id: p.id, name: p.name, qty, price });
  }
  if (total <= 0) return res.status(400).json({ error: 'Giỏ hàng trống' });
  if (method === 'referral' && u.referral_balance < total) return res.status(400).json({ error: 'Số dư hoa hồng không đủ' });

  const code = genCode('SP');
  let pointsEarned = 0;
  if (method === 'referral') {
    db.prepare('UPDATE users SET referral_balance = referral_balance - ? WHERE id = ?').run(total, u.id);
    db.prepare('INSERT INTO referral_history (user_id, ts, amount, note) VALUES (?,?,?,?)')
      .run(u.id, Date.now(), -total, 'Dùng hoa hồng mua đơn #' + code);
  } else {
    pointsEarned = Math.floor(total / CONFIG.pointRate);
    if (pointsEarned > 0) addPoints(u.id, pointsEarned, 'Mua sản phẩm #' + code);
  }
  db.prepare('INSERT INTO product_orders (code, user_id, ts, lines_json, total, method, points_earned) VALUES (?,?,?,?,?,?,?)')
    .run(code, u.id, Date.now(), JSON.stringify(lines), method === 'referral' ? 0 : total, method, pointsEarned);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  res.json({ ok: true, code, total, method, pointsEarned, user: publicUser(fresh) });
});

app.post('/api/products/redeem', authUser, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const p = findProduct(req.body.productId);
  if (!p) return res.status(400).json({ error: 'Sản phẩm không tồn tại' });
  const cost = productPointCost(p);
  if (u.loyalty_points < cost) return res.status(400).json({ error: 'Không đủ điểm để đổi' });
  addPoints(u.id, -cost, 'Đổi điểm lấy ' + p.name);
  const code = genCode('DD');
  db.prepare('INSERT INTO product_orders (code, user_id, ts, lines_json, total, method, points_earned) VALUES (?,?,?,?,?,?,?)')
    .run(code, u.id, Date.now(), JSON.stringify([{ id: p.id, name: p.name, qty: 1, price: 0 }]), 0, 'points', 0);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  res.json({ ok: true, code, user: publicUser(fresh) });
});

/* ---------------- Hội viên ---------------- */
app.post('/api/membership/subscribe', authUser, (req, res) => {
  const plan = findPlan(req.body.planId);
  if (!plan) return res.status(400).json({ error: 'Gói không tồn tại' });
  db.prepare('UPDATE users SET membership_tier=?, membership_label=?, membership_pct=?, membership_expires=? WHERE id=?')
    .run(plan.id, plan.label, plan.discount, Date.now() + plan.days * 86400000, req.user.id);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, user: publicUser(fresh) });
});

app.post('/api/membership/cancel', authUser, (req, res) => {
  db.prepare('UPDATE users SET membership_tier=NULL, membership_label=NULL, membership_pct=0, membership_expires=NULL WHERE id=?')
    .run(req.user.id);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, user: publicUser(fresh) });
});

/* ---------------- Giới thiệu (hoa hồng) ---------------- */
app.post('/api/referral/simulate', authUser, (req, res) => {
  const sample = [350000, 490000, 600000, 120000, 90000];
  const v = sample[Math.floor(Math.random() * sample.length)];
  const commission = Math.round(v * CONFIG.referralPct);
  db.prepare('UPDATE users SET referral_balance = referral_balance + ? WHERE id = ?').run(commission, req.user.id);
  db.prepare('INSERT INTO referral_history (user_id, ts, amount, note) VALUES (?,?,?,?)')
    .run(req.user.id, Date.now(), commission, 'Khách mới qua link — đơn ' + v.toLocaleString('vi-VN') + 'đ (10%)');
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, commission, user: publicUser(fresh) });
});

app.post('/api/referral/withdraw', authUser, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (u.referral_balance < CONFIG.referralMinWithdraw) {
    return res.status(400).json({ error: 'Số dư chưa đủ ' + CONFIG.referralMinWithdraw.toLocaleString('vi-VN') + 'đ để rút' });
  }
  const amount = u.referral_balance;
  db.prepare('UPDATE users SET referral_balance = 0 WHERE id = ?').run(u.id);
  db.prepare('INSERT INTO referral_history (user_id, ts, amount, note) VALUES (?,?,?,?)')
    .run(u.id, Date.now(), -amount, 'Rút tiền mặt');
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  res.json({ ok: true, amount, user: publicUser(fresh) });
});

/* ---------------- Ví & ca của Kỹ thuật viên ---------------- */
function ensureKtv(techId) {
  let acc = db.prepare('SELECT * FROM ktv_accounts WHERE tech_id = ?').get(techId);
  if (!acc) {
    db.prepare('INSERT INTO ktv_accounts (tech_id, balance) VALUES (?, 0)').run(techId);
    acc = { tech_id: techId, balance: 0 };
  }
  const jobs = db.prepare('SELECT * FROM ktv_jobs WHERE tech_id = ?').all(techId);
  if (jobs.length === 0) {
    const seed = [
      ['Anh Huy — Q.7', 'Dưỡng sinh toàn thân (60 phút)', 350000],
      ['Cô Lan — Bình Thạnh', 'Xoa bóp dưỡng sinh cổ vai gáy (90 phút)', 490000],
      ['Chị Thảo — Thủ Đức', 'Thư giãn – giảm căng thẳng (60 phút)', 350000],
    ];
    const ins = db.prepare('INSERT INTO ktv_jobs (tech_id, customer, service, value, status) VALUES (?,?,?,?,\'pending\')');
    seed.forEach((s) => ins.run(techId, s[0], s[1], s[2]));
  }
  return acc;
}

app.get('/api/ktv/:techId', (req, res) => {
  const techId = Number(req.params.techId);
  if (!findTech(techId)) return res.status(404).json({ error: 'KTV không tồn tại' });
  const acc = ensureKtv(techId);
  const jobs = db.prepare('SELECT * FROM ktv_jobs WHERE tech_id = ?').all(techId);
  res.json({ techId, balance: acc.balance, minBalance: CONFIG.ktvMinBalance, platformFee: CONFIG.ktvPlatformFee, jobs });
});

app.post('/api/ktv/:techId/topup', (req, res) => {
  const techId = Number(req.params.techId);
  if (!findTech(techId)) return res.status(404).json({ error: 'KTV không tồn tại' });
  ensureKtv(techId);
  const amount = Math.max(0, Number(req.body.amount) || 0);
  db.prepare('UPDATE ktv_accounts SET balance = balance + ? WHERE tech_id = ?').run(amount, techId);
  const acc = db.prepare('SELECT * FROM ktv_accounts WHERE tech_id = ?').get(techId);
  res.json({ ok: true, balance: acc.balance });
});

app.post('/api/ktv/:techId/jobs/:jobId/complete', (req, res) => {
  const techId = Number(req.params.techId);
  const acc = db.prepare('SELECT * FROM ktv_accounts WHERE tech_id = ?').get(techId);
  if (!acc) return res.status(404).json({ error: 'Chưa có ví KTV' });
  const job = db.prepare('SELECT * FROM ktv_jobs WHERE id = ? AND tech_id = ?').get(Number(req.params.jobId), techId);
  if (!job) return res.status(404).json({ error: 'Không tìm thấy ca' });
  if (job.status === 'done') return res.json({ ok: true, alreadyDone: true });
  if (acc.balance < CONFIG.ktvMinBalance) return res.status(400).json({ error: 'Số dư ví dưới mức tối thiểu — vui lòng nạp thêm' });
  const fee = Math.round(job.value * CONFIG.ktvPlatformFee);
  db.prepare('UPDATE ktv_accounts SET balance = balance - ? WHERE tech_id = ?').run(fee, techId);
  db.prepare('UPDATE ktv_jobs SET status = \'done\' WHERE id = ?').run(job.id);
  const bal = db.prepare('SELECT balance FROM ktv_accounts WHERE tech_id = ?').get(techId).balance;
  res.json({ ok: true, fee, net: job.value - fee, balance: bal });
});

/* ---------------- QUẢN TRỊ (admin / tổng đài điều phối) ---------------- */
function authAdmin(req, res, next) {
  var key = req.header('x-admin-key');
  if (key !== CONFIG.adminKey) return res.status(401).json({ error: 'Sai khóa quản trị' });
  next();
}

app.post('/api/admin/login', (req, res) => {
  if (String(req.body.key) !== CONFIG.adminKey) return res.status(401).json({ error: 'Sai khóa quản trị' });
  res.json({ ok: true, key: CONFIG.adminKey });
});

app.get('/api/admin/bookings', authAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 200').all();
  const list = rows.map((b) => {
    const bk = rowBooking(b);
    bk.userName = (db.prepare('SELECT name FROM users WHERE id = ?').get(b.user_id) || {}).name || '';
    return bk;
  });
  const stats = {
    total: rows.length,
    dangXuLy: rows.filter((b) => b.status_idx < STATUSES.length - 1).length,
    hoanThanh: rows.filter((b) => b.status_idx >= STATUSES.length - 1).length,
    doanhThu: rows.reduce((s, b) => s + b.total, 0),
  };
  res.json({ bookings: list, stats, techs: TECHS, statuses: STATUSES });
});

app.post('/api/admin/bookings/:code/assign', authAdmin, (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE code = ?').get(req.params.code);
  if (!b) return res.status(404).json({ error: 'Không tìm thấy đơn' });
  const t = findTech(req.body.techId);
  if (!t) return res.status(400).json({ error: 'KTV không hợp lệ' });
  db.prepare('UPDATE bookings SET tech_id = ? WHERE code = ?').run(t.id, b.code);
  res.json({ ok: true, booking: rowBooking(db.prepare('SELECT * FROM bookings WHERE code = ?').get(b.code)) });
});

app.post('/api/admin/bookings/:code/advance', authAdmin, (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE code = ?').get(req.params.code);
  if (!b) return res.status(404).json({ error: 'Không tìm thấy đơn' });
  const next = Math.min(STATUSES.length - 1, b.status_idx + 1);
  db.prepare('UPDATE bookings SET status_idx = ? WHERE code = ?').run(next, b.code);
  res.json({ ok: true, booking: rowBooking(db.prepare('SELECT * FROM bookings WHERE code = ?').get(b.code)) });
});

/* ---------------- Phục vụ frontend (PWA) ---------------- */
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    if (filePath.endsWith('sw.js')) { res.setHeader('Service-Worker-Allowed', '/'); res.setHeader('Cache-Control', 'no-cache'); }
  },
}));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

/* ---------------- Xử lý lỗi ---------------- */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌿 RUM TRẦN KHỎE ĐẸP — app THẬT đang chạy: http://localhost:${PORT}`);
});

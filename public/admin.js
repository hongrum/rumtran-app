/* RUM TRẦN — Trang quản trị điều phối (tổng đài) */
(function () {
  'use strict';
  var KEY = 'rt_admin_key';
  var techs = [], statuses = [];

  function el(id) { return document.getElementById(id); }
  function money(n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function key() { return localStorage.getItem(KEY); }
  function api(path, method, body) {
    return fetch(path, { method: method || 'GET', headers: { 'Content-Type': 'application/json', 'x-admin-key': key() || '' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || ('Lỗi ' + r.status)); return d; }); });
  }

  function adminLogin() {
    var k = el('adminKey').value.trim();
    fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Sai khóa'); return d; }); })
      .then(function () { localStorage.setItem(KEY, k); showApp(); })
      .catch(function (e) { var er = el('loginErr'); er.textContent = e.message; er.classList.add('show'); });
  }
  window.adminLogin = adminLogin;
  function adminLogout() { localStorage.removeItem(KEY); location.reload(); }
  window.adminLogout = adminLogout;

  function showApp() { el('adminLogin').classList.add('hidden'); el('adminApp').classList.remove('hidden'); loadBookings(); loadTechnicians(); loadCustomers(); }

  /* Khách hàng: SĐT đăng nhập + SĐT liên hệ khác đã dùng khi đặt lịch */
  function day(ts) { return ts ? new Date(ts).toLocaleDateString('vi-VN') : ''; }
  function loadCustomers() {
    api('/api/admin/customers').then(function (res) {
      el('custCount').textContent = '(' + res.customers.length + ')';
      el('customerRows').innerHTML = res.customers.map(function (c) {
        return '<tr><td>' + esc(c.name || '—') + (c.membership ? '<br><small>🎖️ ' + esc(c.membership) + '</small>' : '') + '</td>' +
          '<td><a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a></td>' +
          '<td>' + (c.contactPhones.length ? c.contactPhones.map(function (p) { return '<a href="tel:' + esc(p) + '">' + esc(p) + '</a>'; }).join('<br>') : '<small style="color:#7b6857">—</small>') + '</td>' +
          '<td>' + c.orders + '</td><td class="hide-sm">' + money(c.spent) + '</td><td class="hide-sm">' + day(c.createdAt) + '</td>' +
          '<td>' + (c.hasPin ? (c.pinLocked ? '⛔ Đang khóa' : '🔒 Có PIN') + '<br><button class="btn btn-ghost" style="min-height:auto;padding:.3rem .6rem;font-size:.75rem" onclick="resetPin(' + Number(c.id) + ')">🔓 Xóa mã PIN</button>' : '<small style="color:#7b6857">Chưa đặt</small>') + '</td></tr>';
      }).join('') || '<tr><td colspan="7" style="text-align:center;color:#7b6857;padding:1.5rem">Chưa có khách nào.</td></tr>';
    }).catch(function () {});
  }
  window.loadCustomers = loadCustomers;
  function resetPin(id) {
    if (!confirm('Xóa mã PIN của khách này?\n\nChỉ làm khi đã xác minh đúng chủ tài khoản (hỏi tên, địa chỉ, đơn gần nhất). Khách sẽ đặt PIN mới ở lần đăng nhập tới.')) return;
    api('/api/admin/customers/' + id + '/reset-pin', 'POST').then(function () { loadCustomers(); alert('Đã xóa mã PIN. Báo khách mở app, nhập số điện thoại và đặt PIN mới.'); }).catch(function (e) { alert(e.message); });
  }
  window.resetPin = resetPin;
  // Tải file Excel (cần gửi khóa quản trị trong header nên tải qua fetch)
  function downloadCustomers() {
    fetch('/api/admin/customers.csv', { headers: { 'x-admin-key': key() || '' } })
      .then(function (r) { if (!r.ok) throw new Error('Không tải được (lỗi ' + r.status + ')'); return r.blob(); })
      .then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'khach-hang-rumtran-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      }).catch(function (e) { alert(e.message); });
  }
  window.downloadCustomers = downloadCustomers;

  function loadTechnicians() {
    api('/api/admin/technicians').then(function (res) {
      el('ktvList').innerHTML = res.technicians.map(techCardHtml).join('') || '<p style="color:#7b6857">Chưa có KTV.</p>';
    }).catch(function () {});
  }
  window.loadTechnicians = loadTechnicians;
  function techCardHtml(t) {
    var av = t.photo ? '<span class="adm-ava" style="background-image:url(' + t.photo + ')"></span>'
      : '<span class="adm-ava adm-ava-txt">' + esc(t.initials || 'KT') + '</span>';
    var badge = t.status === 'pending' ? '<span class="status-pill">⏳ Chờ duyệt</span>'
      : (t.status === 'approved' ? '<span class="status-pill done">✔ Đang hiển thị</span>' : '<span class="status-pill">✖ Đã ẩn</span>');
    var actions = t.status === 'pending'
      ? '<button class="btn btn-primary" onclick="approveTech(' + t.id + ')">✔ Duyệt</button> <button class="btn btn-ghost" onclick="rejectTech(' + t.id + ')">Từ chối</button>'
      : (t.status === 'approved' ? '<button class="btn btn-ghost" onclick="rejectTech(' + t.id + ')">Ẩn</button>' : '<button class="btn btn-outline" onclick="approveTech(' + t.id + ')">Duyệt lại</button>');
    return '<div class="adm-ktv">' + av + '<div class="adm-ktv-info">' +
      '<div><strong>' + esc(t.name) + '</strong> · ' + (t.gender === 'nam' ? 'Nam' : 'Nữ') + ' · 📍 ' + esc(t.area || '') + '</div>' +
      '<div style="font-size:.8rem;color:#7b6857">' + esc(t.phone || '') + ' · ' + t.years + ' năm KN · ' + esc((t.certs || []).join(', ')) + '</div>' +
      (t.bio ? '<div style="font-size:.8rem;margin-top:.2rem">' + esc(t.bio) + '</div>' : '') +
      '<div style="font-size:.8rem;margin-top:.3rem">' + (t.hasCccd ? '🪪 Có CCCD 2 mặt' : '🪪 <span style="color:#d81f26">Chưa có CCCD</span>') +
      ' · 📄 ' + (t.certPhotoCount || 0) + ' ảnh chứng chỉ' +
      ((t.hasCccd || t.certPhotoCount) ? ' · <a href="#" onclick="showDocs(' + t.id + ', this);return false">Xem giấy tờ</a>' : '') + '</div>' +
      '<div class="adm-docs" id="docs-' + t.id + '"></div>' +
      '<div style="margin-top:.4rem">' + badge + '</div></div>' +
      '<div class="adm-ktv-act">' + actions + '</div></div>';
  }
  // Giấy tờ tải riêng khi bấm xem (ảnh nặng, chỉ quản trị thấy)
  function showDocs(id, link) {
    var box = el('docs-' + id);
    if (box.innerHTML) { box.innerHTML = ''; link.textContent = 'Xem giấy tờ'; return; }
    api('/api/admin/technicians/' + id + '/docs').then(function (d) {
      var imgs = [];
      if (d.cccdFront) imgs.push(['CCCD mặt trước', d.cccdFront]);
      if (d.cccdBack) imgs.push(['CCCD mặt sau', d.cccdBack]);
      (d.certPhotos || []).forEach(function (src, i) { imgs.push(['Chứng chỉ ' + (i + 1), src]); });
      box.innerHTML = imgs.map(function (x) {
        return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(x[1]) ? '<figure><img src="' + x[1] + '" alt="' + esc(x[0]) + '"><figcaption>' + esc(x[0]) + '</figcaption></figure>' : '';
      }).join('');
      link.textContent = 'Ẩn giấy tờ';
    }).catch(function (e) { alert(e.message); });
  }
  window.showDocs = showDocs;
  function approveTech(id) { api('/api/admin/technicians/' + id + '/approve', 'POST').then(function () { loadTechnicians(); loadBookings(); }).catch(function (e) { alert(e.message); }); }
  function rejectTech(id) { api('/api/admin/technicians/' + id + '/reject', 'POST').then(function () { loadTechnicians(); }).catch(function (e) { alert(e.message); }); }
  window.approveTech = approveTech;
  window.rejectTech = rejectTech;

  function loadBookings() {
    api('/api/admin/bookings').then(function (res) {
      techs = res.techs; statuses = res.statuses;
      var s = res.stats;
      el('statRow').innerHTML =
        '<div class="stat-box"><strong>' + s.total + '</strong><span>Tổng đơn</span></div>' +
        '<div class="stat-box"><strong>' + s.dangXuLy + '</strong><span>Đang xử lý</span></div>' +
        '<div class="stat-box"><strong>' + s.hoanThanh + '</strong><span>Hoàn thành</span></div>' +
        '<div class="stat-box"><strong>' + money(s.doanhThu) + '</strong><span>Tổng giá trị</span></div>';
      el('bookingRows').innerHTML = res.bookings.map(rowHtml).join('') || '<tr><td colspan="7" style="text-align:center;color:#7b6857;padding:1.5rem">Chưa có đơn nào.</td></tr>';
    }).catch(function (e) { if (/khóa/i.test(e.message)) { localStorage.removeItem(KEY); location.reload(); } else alert(e.message); });
  }
  window.loadBookings = loadBookings;

  function rowHtml(b) {
    var svc = b.items.map(function (i) { return i.serviceId + ' (' + i.minutes + 'p)'; }).join(', ');
    var forWho = b.bookingFor === 'relative' ? ('<br><small>👵 cho: ' + esc(b.patientName || '') + (b.relation ? ' (' + esc(b.relation) + ')' : '') + '</small>') : '';
    var techOpts = '<option value="">— Chọn KTV —</option>' + techs.map(function (t) { return '<option value="' + t.id + '"' + (b.tech && b.tech.id === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
    var done = b.statusIdx >= statuses.length - 1;
    var st = statuses[b.statusIdx] || { label: '?', icon: '' };
    var advBtn = done ? '' : '<button class="btn btn-primary" onclick="advance(\'' + b.code + '\')">⏭ ' + esc((statuses[b.statusIdx + 1] || {}).label || '') + '</button>';
    var rating = (b.ratingStars ? '<br><small>⭐ ' + b.ratingStars + '</small>' : '');
    return '<tr>' +
      '<td><strong>' + esc(b.code) + '</strong>' + (b.urgent ? '<br><small style="color:#d81f26">⚡ gấp</small>' : '') + '</td>' +
      '<td>' + esc(b.custName) + '<br><small>📞 ' + esc(b.custPhone) + '</small>' +
        (b.userPhone && b.userPhone.replace(/\D/g, '') !== String(b.custPhone || '').replace(/\D/g, '') ? '<br><small style="color:#7b6857">👤 TK: ' + esc(b.userPhone) + (b.userName ? ' (' + esc(b.userName) + ')' : '') + '</small>' : '') +
        forWho + '</td>' +
      '<td class="hide-sm">' + esc(svc) + '</td>' +
      '<td class="hide-sm">' + esc(b.dateTimeLabel || '') + '<br><small>' + esc(b.address || '') + '</small></td>' +
      '<td>' + money(b.total) + rating + '</td>' +
      '<td><select onchange="assign(\'' + b.code + '\', this.value)">' + techOpts + '</select></td>' +
      '<td><span class="status-pill' + (done ? ' done' : '') + '">' + st.icon + ' ' + esc(st.label) + '</span><br>' + advBtn + '</td>' +
      '</tr>';
  }

  function assign(code, techId) { if (!techId) return; api('/api/admin/bookings/' + code + '/assign', 'POST', { techId: Number(techId) }).then(function () { loadBookings(); }).catch(function (e) { alert(e.message); }); }
  window.assign = assign;
  function advance(code) { api('/api/admin/bookings/' + code + '/advance', 'POST').then(function () { loadBookings(); }).catch(function (e) { alert(e.message); }); }
  window.advance = advance;

  if (key()) showApp();
})();

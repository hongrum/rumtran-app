/* =====================================================
   RUM TRẦN KHỎE ĐẸP — Frontend APP THẬT (nối API backend)
   Khác bản demo: KHÔNG lưu nghiệp vụ trong localStorage nữa —
   mọi tính tiền/điểm/hoa hồng/ví do SERVER quyết định.
   localStorage chỉ giữ token đăng nhập + bước đặt lịch đang dở.
   ===================================================== */
(function () {
  'use strict';

  /* ---------------- API ---------------- */
  var TOKEN_KEY = 'rt_token';
  var USER_KEY = 'rt_user';
  var FLOW_KEY = 'rt_flow';

  var CATALOG = null;       // { services, addons, products, membershipPlans, techs, statuses, config }
  var user = null;          // publicUser từ server
  var lastOrderCode = null; // mã đơn vừa đặt (để mở màn theo dõi)
  var trackTimer = null;

  function token() { return localStorage.getItem(TOKEN_KEY); }

  function api(path, method, body) {
    var headers = { 'Content-Type': 'application/json' };
    var t = token();
    if (t) headers['x-session'] = t;
    return fetch(path, {
      method: method || 'GET',
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        // Phiên hết hạn / bị quản trị xóa PIN / mã cũ dạng số thứ tự → về màn đăng nhập
        if (r.status === 401 && t && path !== '/api/auth/login') { clearLogin(); goTo('login'); }
        if (!r.ok) throw new Error((data && data.error) || ('Lỗi ' + r.status));
        return data;
      });
    });
  }

  /* ---------------- Tiện ích ---------------- */
  function el(id) { return document.getElementById(id); }
  function money(n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function isoDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function findService(id) { return CATALOG.services.filter(function (s) { return s.id === id; })[0]; }
  function findAddon(id) { return CATALOG.addons.filter(function (a) { return a.id === id; })[0]; }
  function findProduct(id) { return CATALOG.products.filter(function (p) { return p.id === id; })[0]; }
  function findTech(id) { return CATALOG.techs.filter(function (t) { return t.id === id; })[0]; }
  function memberPct() { return (user && user.membership && user.membership.tier) ? user.membership.discountPct : 0; }
  function applyPct(a, pct) { return pct ? Math.round(a * (1 - pct / 100)) : a; }
  function applyMember(a) { return applyPct(a, memberPct()); }

  var toastTimer = null;
  function toast(msg) {
    var t = el('toast');
    t.textContent = msg;
    t.classList.remove('hidden'); t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.classList.add('hidden'); }, 250);
    }, 2600);
  }
  function showErr(id, msg) {
    var e = el(id); if (!e) return;
    e.textContent = msg; e.classList.add('show');
    setTimeout(function () { e.classList.remove('show'); }, 5000);
  }

  /* ---------------- Bước đặt lịch (giữ tạm client) ---------------- */
  function defaultFlow() {
    return { cart: [], addons: [], techId: null, dateISO: null, timeSlot: null, urgent: false, urgentEta: null,
      custName: '', custPhone: '', address: '', note: '', payment: 'cash',
      bookingFor: 'self', patientName: '', relation: '' };
  }
  var flow = defaultFlow();
  function saveFlow() { try { localStorage.setItem(FLOW_KEY, JSON.stringify(flow)); } catch (e) {} }
  function loadFlow() { try { var r = localStorage.getItem(FLOW_KEY); if (r) flow = Object.assign(defaultFlow(), JSON.parse(r)); } catch (e) {} }

  /* ---------------- Điều hướng ---------------- */
  var FLOW = ['services', 'tech', 'time', 'address', 'confirm', 'payment'];
  var FLOW_TITLES = { services: 'Chọn dịch vụ', tech: 'Chọn kỹ thuật viên', time: 'Chọn thời gian', address: 'Địa chỉ & tình trạng', confirm: 'Xác nhận đơn', payment: 'Thanh toán' };
  var TABS = ['home', 'products', 'account'];
  var current = 'login';

  var OPEN_SCREENS = ['login', 'ktv-register']; // xem được khi CHƯA đăng nhập
  function goTo(screen) {
    if (!user && OPEN_SCREENS.indexOf(screen) < 0) { screen = 'login'; }
    current = screen;
    showScreen(screen);
  }
  window.goTo = goTo;

  function goBack() {
    var idx = FLOW.indexOf(current);
    if (idx <= 0) { goTo('home'); return; }
    goTo(FLOW[idx - 1]);
  }
  window.goBack = goBack;

  function goNextFrom(cur) {
    var map = { services: 'tech', tech: 'time', time: 'address', address: 'confirm', confirm: 'payment' };
    if (cur === 'services' && flow.cart.length === 0) return;
    if (cur === 'tech' && !flow.techId) return;
    if (cur === 'time' && !(flow.urgent || (flow.dateISO && flow.timeSlot))) return;
    if (cur === 'address' && !validateAddress()) return;
    goTo(map[cur]);
  }
  window.goNextFrom = goNextFrom;

  function showScreen(name) {
    var screens = document.querySelectorAll('.screen');
    screens.forEach(function (s) { s.classList.remove('active'); });
    var target = el('screen-' + name);
    if (target) target.classList.add('active');
    updateTopbar();
    stopTrack();

    if (name === 'services') { renderServices(); renderAddons(); updateServiceBar(); }
    if (name === 'tech') { renderTech(); updateTechBar(); }
    if (name === 'time') { renderDateChips(); renderTimeSlots(); updateUrgentBtn(); updateTimeBar(); }
    if (name === 'address') { fillAddressInputs(); updateAddrBar(); }
    if (name === 'confirm') { renderConfirm(); }
    if (name === 'payment') { renderPayment(); }
    if (name === 'tracking') { renderTracking(); startTrack(); }
    if (name === 'rating') { renderRating(); }
    if (name === 'products') { renderProducts(); }
    if (name === 'account') { loadAccount(); }
    if (name === 'ktv') { renderKtvSelect(); loadKtv(); }
    if (name === 'ktv-register') { renderTechRegister(); }

    // Ẩn thanh header (logo tròn) ở màn đăng nhập/đăng ký để không trùng với logo lớn
    var brandbar = document.querySelector('.brandbar');
    if (brandbar) brandbar.style.display = (name === 'login' || name === 'ktv-register') ? 'none' : '';

    updateBottomNav(name);
    var m = el('main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0);
  }

  function updateBottomNav(name) {
    var nav = el('bottomnav'); var device = el('device');
    var show = TABS.indexOf(name) > -1;
    nav.classList.toggle('hidden', !show);
    if (device) device.classList.toggle('has-bottomnav', show);
    if (show) {
      var map = { home: 'bnHome', products: 'bnProducts', account: 'bnAccount' };
      TABS.forEach(function (t) { var b = el(map[t]); if (b) b.classList.toggle('active', t === name); });
    }
  }

  function updateTopbar() {
    var bar = el('stepbar');
    var idx = FLOW.indexOf(current);
    if (idx === -1) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    el('stepbarTitle').textContent = FLOW_TITLES[current];
    el('stepbarCount').textContent = 'Bước ' + (idx + 1) + '/' + FLOW.length;
    el('stepbarFill').style.width = Math.round(((idx + 1) / FLOW.length) * 100) + '%';
  }

  /* ---------------- Đăng nhập ---------------- */
  function setUser(u) {
    user = u;
    try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch (e) {}
    renderBrandRight();
  }
  function renderBrandRight() {
    var box = el('brandRight');
    if (user) {
      box.innerHTML = '<div class="account-chip">👤 ' + escapeHtml((user.name || 'Bạn').split(' ').slice(-1)[0]) +
        ' <button onclick="logout()">Thoát</button></div>';
    } else {
      box.innerHTML = '<a class="brandbar-call" href="tel:0762419688" aria-label="Gọi hotline">📞</a>';
    }
  }
  // Bước PIN: 'set' = đặt PIN mới (khách mới / chưa có PIN), 'enter' = nhập PIN đã có
  var pinMode = null;
  function showPinBox(mode) {
    pinMode = mode;
    el('pinBox').classList.remove('hidden');
    el('pin2Wrap').classList.toggle('hidden', mode !== 'set');
    el('pinForgot').classList.toggle('hidden', mode !== 'enter');
    el('pinLabel').textContent = mode === 'set' ? 'Đặt mã PIN (4–6 số)' : 'Mã PIN';
    el('pinHint').textContent = mode === 'set'
      ? '🔒 Đặt mã PIN để bảo vệ tài khoản — lần sau đăng nhập trên máy khác sẽ cần mã này.'
      : '🔒 Nhập mã PIN của tài khoản này.';
    el('loginBtn').textContent = mode === 'set' ? 'Đặt PIN & đăng nhập' : 'Đăng nhập';
    el('loginPin').value = ''; el('loginPin2').value = '';
    el('loginPin').focus();
  }
  function hidePinBox() {
    pinMode = null;
    el('pinBox').classList.add('hidden');
    el('loginBtn').textContent = 'Đăng nhập / Đăng ký';
  }
  function doLogin() {
    var name = el('loginName').value.trim();
    var phone = el('loginPhone').value.trim();
    if (phone.replace(/\D/g, '').length < 9) { showErr('loginError', 'Số điện thoại chưa hợp lệ'); return; }
    var body = { phone: phone, name: name, ref: localStorage.getItem('rt_ref') || '' };
    if (pinMode) {
      var pin = el('loginPin').value.trim();
      if (!/^\d{4,6}$/.test(pin)) { showErr('loginError', 'Mã PIN gồm 4–6 chữ số'); return; }
      if (pinMode === 'set' && pin !== el('loginPin2').value.trim()) { showErr('loginError', 'Hai lần nhập mã PIN chưa khớp'); return; }
      body.pin = pin;
    }
    el('loginBtn').disabled = true;
    api('/api/auth/login', 'POST', body).then(function (res) {
      el('loginBtn').disabled = false;
      if (res.needPin) { showPinBox(res.needPin); return; }
      hidePinBox();
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.removeItem('rt_ref'); // mã giới thiệu đã dùng khi đăng ký
      setUser(res.user);
      flow.custName = user.name || ''; flow.custPhone = user.phone || ''; saveFlow();
      el('loginBtn').disabled = false;
      goTo('home');
      toast('Xin chào ' + (user.name || 'Anh/Chị') + '!');
      // CHỈ khi ĐĂNG KÝ MỚI lần đầu → tự mở bảng mời chia sẻ link giới thiệu (khách cũ không bị làm phiền)
      if (res.isNew) { setTimeout(openShareModal, 700); }
    }).catch(function (e) { el('loginBtn').disabled = false; showErr('loginError', e.message); });
  }
  window.doLogin = doLogin;

  function clearLogin() {
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem(FLOW_KEY);
    user = null; flow = defaultFlow();
    renderBrandRight();
  }
  function logout() {
    api('/api/auth/logout', 'POST').catch(function () {}); // hủy phiên trên máy chủ
    clearLogin();
    goTo('login');
  }
  window.logout = logout;
  // Đổi số điện thoại thì hỏi lại PIN từ đầu (số khác có thể là tài khoản khác)
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'loginPhone' && pinMode) hidePinBox(); });

  /* ---------------- HOME ---------------- */
  function renderHomeServices() {
    el('homeServiceGrid').innerHTML = CATALOG.services.map(function (s) {
      return '<div class="svc-mini" onclick="quickAdd(\'' + s.id + '\')">' +
        '<span class="emoji">' + s.emoji + '</span>' +
        '<span class="name">' + escapeHtml(s.name) + '</span>' +
        '<span class="range">350k – 600k</span></div>';
    }).join('');
  }
  function quickAdd(id) {
    if (!flow.cart.some(function (i) { return i.serviceId === id; })) {
      var svc = findService(id);
      flow.cart.push({ serviceId: id, minutes: svc.tiers[0].m, price: svc.tiers[0].p });
      saveFlow();
    }
    goTo('services');
  }
  window.quickAdd = quickAdd;

  /* ---------------- BƯỚC 1: DỊCH VỤ ---------------- */
  function renderServices() {
    var pct = memberPct();
    el('serviceList').innerHTML = CATALOG.services.map(function (svc) {
      var cartItem = flow.cart.filter(function (i) { return i.serviceId === svc.id; })[0];
      var tiers = svc.tiers.map(function (t, idx) {
        var sel = cartItem && cartItem.minutes === t.m;
        var priceHtml = pct ? ('<span class="p-old">' + money(t.p) + '</span><span class="p">' + money(applyPct(t.p, pct)) + '</span>')
          : ('<span class="p">' + money(t.p) + '</span>');
        return '<div class="tier-btn' + (sel ? ' selected' : '') + '" onclick="toggleTier(\'' + svc.id + '\',' + idx + ')">' +
          '<span class="m">' + t.m + ' phút</span>' + priceHtml + '</div>';
      }).join('');
      return '<div class="svc-card"><div class="svc-card-head"><span class="emoji">' + svc.emoji + '</span>' +
        '<div><h3>' + escapeHtml(svc.name) + '</h3><p>' + escapeHtml(svc.desc) + '</p></div></div>' +
        '<div class="svc-who">🌿 <span>' + escapeHtml(svc.who) + '</span></div>' +
        '<div class="tier-row">' + tiers + '</div></div>';
    }).join('');
    var badge = el('serviceMemberBadge');
    if (pct) { badge.classList.remove('hidden'); badge.textContent = '🎖️ Hội viên ' + user.membership.label + ' — đang giảm ' + pct + '% mọi dịch vụ'; }
    else badge.classList.add('hidden');
  }
  function toggleTier(serviceId, tierIdx) {
    var svc = findService(serviceId); var tier = svc.tiers[tierIdx];
    var i = flow.cart.findIndex(function (x) { return x.serviceId === serviceId; });
    if (i > -1 && flow.cart[i].minutes === tier.m) flow.cart.splice(i, 1);
    else if (i > -1) flow.cart[i] = { serviceId: serviceId, minutes: tier.m, price: tier.p };
    else flow.cart.push({ serviceId: serviceId, minutes: tier.m, price: tier.p });
    saveFlow(); renderServices(); updateServiceBar();
  }
  window.toggleTier = toggleTier;

  function renderAddons() {
    var pct = memberPct();
    el('addonList').innerHTML = CATALOG.addons.map(function (a) {
      var sel = flow.addons.indexOf(a.id) > -1;
      var label = pct ? (money(applyPct(a.price, pct)) + ' (thay ' + money(a.price) + ')') : money(a.price);
      return '<div class="addon-chip' + (sel ? ' selected' : '') + '" onclick="toggleAddon(\'' + a.id + '\')">' +
        a.emoji + ' ' + escapeHtml(a.name) + ' · ' + label + '</div>';
    }).join('');
  }
  function toggleAddon(id) {
    var i = flow.addons.indexOf(id);
    if (i > -1) flow.addons.splice(i, 1); else flow.addons.push(id);
    saveFlow(); renderAddons(); updateServiceBar();
  }
  window.toggleAddon = toggleAddon;

  function rawTotal() {
    var t = 0; flow.cart.forEach(function (i) { t += i.price; });
    flow.addons.forEach(function (id) { var a = findAddon(id); if (a) t += a.price; });
    return t;
  }
  function computeTotal() { return applyMember(rawTotal()); }

  function updateServiceBar() {
    var c = flow.cart.length;
    el('svcCount').textContent = c === 0 ? 'Chưa chọn dịch vụ nào' : ('Đã chọn ' + c + ' dịch vụ' + (flow.addons.length ? ' + ' + flow.addons.length + ' cộng thêm' : ''));
    el('svcTotal').textContent = c > 0 ? money(computeTotal()) : '';
    el('svcContinueBtn').disabled = c === 0;
  }

  /* ---------------- BƯỚC 2: KTV ---------------- */
  var TECH_COLORS = ['#d81f26', '#c8912f', '#8a5a2e', '#b0141b', '#a97722'];
  function techColor(t) { var i = CATALOG.techs.indexOf(t); return TECH_COLORS[(i < 0 ? (t.id || 0) : i) % TECH_COLORS.length]; }
  function avatarHtml(t, extraClass) {
    extraClass = extraClass || '';
    if (t.photo) return '<span class="tech-avatar ' + extraClass + ' has-photo" style="background-image:url(' + t.photo + ')"></span>';
    return '<span class="tech-avatar ' + extraClass + '" style="background:' + techColor(t) + '">' + escapeHtml(t.initials || 'KT') + '</span>';
  }
  function fillAreaFilter() {
    var sel = el('filterArea'); if (!sel || sel.dataset.filled) return;
    (CATALOG.areas || []).forEach(function (a) { var o = document.createElement('option'); o.value = a; o.textContent = '📍 ' + a; sel.appendChild(o); });
    sel.dataset.filled = '1';
  }
  function renderTech() {
    fillAreaFilter();
    var fa = el('filterArea') ? el('filterArea').value : '';
    var fg = el('filterGender') ? el('filterGender').value : '';
    var list = CATALOG.techs.filter(function (t) { return (!fa || t.area === fa) && (!fg || t.gender === fg); });
    if (list.length === 0) { el('techList').innerHTML = '<p class="hint center">Không có KTV khớp bộ lọc. Thử bỏ bớt điều kiện nhé.</p>'; return; }
    el('techList').innerHTML = '<div class="tech-list-wrap">' + list.map(function (t) {
      var sel = flow.techId === t.id;
      var badges = (t.certs || []).map(function (c) { return '<span class="badge-pill">✔ ' + escapeHtml(c) + '</span>'; }).join('');
      return '<div class="tech-item' + (sel ? ' selected' : '') + '" onclick="selectTech(' + t.id + ')">' +
        avatarHtml(t) +
        '<div class="tech-info"><div class="tech-name">' + escapeHtml(t.name) + ' <small style="color:var(--muted);font-weight:600">· ' + (t.gender === 'nam' ? 'Nam' : 'Nữ') + '</small></div>' +
        '<div class="tech-meta">⭐ ' + t.rating.toFixed(1) + ' (' + t.reviews + ' đánh giá) · 📍 ' + escapeHtml(t.area) + ' · ' + t.years + ' năm KN</div>' +
        '<div class="tech-badges">' + badges + '</div>' +
        '<div class="tech-soonest">🕒 Rảnh sớm nhất: ' + t.soonest + '</div>' +
        '<button class="tech-detail-btn" onclick="event.stopPropagation();openTechModal(' + t.id + ')">👁 Xem hồ sơ & đánh giá</button></div>' +
        '<span class="tech-pick">✔</span></div>';
    }).join('') + '</div>';
  }
  function openTechModal(id) {
    var t = findTech(id); if (!t) return;
    var revs = (t.sampleReviews || []).map(function (r) {
      return '<div class="review-item"><div class="stars-mini">' + '★'.repeat(r.stars) + '</div>' +
        '<div>' + escapeHtml(r.text) + '</div><div class="rv-by">— ' + escapeHtml(r.by) + '</div></div>';
    }).join('') || '<p class="hint">Chưa có đánh giá mẫu.</p>';
    var badges = (t.certs || []).map(function (c) { return '<span class="badge-pill">✔ ' + escapeHtml(c) + '</span>'; }).join('');
    el('techModalBody').innerHTML =
      '<div class="modal-head">' + avatarHtml(t) +
      '<div><div class="tech-name">' + escapeHtml(t.name) + '</div>' +
      '<div class="tech-meta">⭐ ' + t.rating.toFixed(1) + ' (' + t.reviews + ' đánh giá) · ' + (t.gender === 'nam' ? 'Nam' : 'Nữ') + ' · 📍 ' + escapeHtml(t.area) + '</div></div></div>' +
      '<div class="tech-badges">' + badges + '</div>' +
      '<div class="modal-bio">' + escapeHtml(t.bio || '') + '</div>' +
      '<h3 class="subhead">Khách hàng đánh giá</h3>' + revs +
      '<button class="btn btn-primary btn-block btn-lg" onclick="selectTech(' + t.id + ');closeTechModal();goTo(\'time\')">Chọn ' + escapeHtml(t.name.split(' ').slice(-1)[0]) + ' & tiếp tục →</button>';
    el('techModal').classList.remove('hidden');
  }
  window.openTechModal = openTechModal;
  function closeTechModal(e) { if (e && e.target && e.target.closest && e.target.closest('.modal-card') && e.type === 'click') return; el('techModal').classList.add('hidden'); }
  window.closeTechModal = closeTechModal;
  function selectTech(id) { flow.techId = id; saveFlow(); renderTech(); el('autoTechBtn').classList.remove('active'); updateTechBar(); }
  window.selectTech = selectTech;
  function selectAutoTech() { flow.techId = 'auto'; saveFlow(); renderTech(); updateTechBar(); }
  window.selectAutoTech = selectAutoTech;
  function updateTechBar() {
    var b = el('autoTechBtn');
    if (flow.techId === 'auto') { b.classList.add('active'); b.textContent = '🤖 Đã chọn: Hệ thống tự chọn KTV phù hợp'; }
    else { b.classList.remove('active'); b.textContent = '🤖 Để hệ thống chọn giúp (nhanh nhất)'; }
    el('techContinueBtn').disabled = !flow.techId;
  }

  /* ---------------- BƯỚC 3: THỜI GIAN ---------------- */
  var WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  function nextDays(n) { var out = []; var now = new Date(); for (var i = 0; i < n; i++) out.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)); return out; }
  function renderDateChips() {
    if (!flow.dateISO) { flow.dateISO = isoDate(new Date()); saveFlow(); }
    el('dateChips').innerHTML = nextDays(7).map(function (d, i) {
      var iso = isoDate(d);
      var l1 = i === 0 ? 'Hôm nay' : (i === 1 ? 'Ngày mai' : WEEKDAYS[d.getDay()]);
      var l2 = pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1);
      var sel = flow.dateISO === iso && !flow.urgent;
      return '<div class="date-chip' + (sel ? ' selected' : '') + '" onclick="selectDate(\'' + iso + '\')"><span class="d1">' + l1 + '</span><span class="d2">' + l2 + '</span></div>';
    }).join('');
  }
  function selectDate(iso) { flow.dateISO = iso; flow.urgent = false; flow.timeSlot = null; saveFlow(); renderDateChips(); renderTimeSlots(); updateUrgentBtn(); updateTimeBar(); }
  window.selectDate = selectDate;
  function slotTaken(iso, h) { var s = iso + '-' + h; var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) % 97; return x % 5 === 0; }
  function renderTimeSlots() {
    var hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    var todayISO = isoDate(new Date()); var nowH = new Date().getHours();
    el('timeSlots').innerHTML = hours.map(function (h) {
      var label = pad2(h) + ':00';
      var past = (flow.dateISO === todayISO) && (h <= nowH);
      var taken = !past && slotTaken(flow.dateISO, h);
      var dis = past || taken;
      var sel = !flow.urgent && flow.timeSlot === label;
      var cls = 'time-slot' + (sel ? ' selected' : '') + (dis ? ' disabled' : '');
      var on = dis ? '' : ' onclick="selectTimeSlot(\'' + label + '\')"';
      return '<div class="' + cls + '"' + on + '>' + label + (taken ? '<br><small>Hết chỗ</small>' : '') + '</div>';
    }).join('');
  }
  function selectTimeSlot(l) { flow.timeSlot = l; flow.urgent = false; saveFlow(); renderTimeSlots(); updateUrgentBtn(); updateTimeBar(); }
  window.selectTimeSlot = selectTimeSlot;
  function selectUrgent() { flow.urgent = true; flow.timeSlot = null; var eta = new Date(Date.now() + 30 * 60000); flow.urgentEta = pad2(eta.getHours()) + ':' + pad2(eta.getMinutes()); saveFlow(); updateUrgentBtn(); renderDateChips(); renderTimeSlots(); updateTimeBar(); }
  window.selectUrgent = selectUrgent;
  function updateUrgentBtn() {
    var b = el('urgentBtn');
    if (flow.urgent) { b.classList.add('active'); b.textContent = '⚡ Đã chọn: Đặt gấp — có mặt khoảng ' + flow.urgentEta; }
    else { b.classList.remove('active'); b.textContent = '⚡ Đặt gấp — Có mặt trong 30 phút'; }
  }
  function buildDateTimeLabel() {
    if (flow.urgent) return '⚡ Đặt gấp — có mặt khoảng ' + flow.urgentEta + ' (trong ~30 phút)';
    if (!flow.dateISO || !flow.timeSlot) return 'Chưa chọn';
    var d = new Date(flow.dateISO + 'T00:00:00');
    var todayISO = isoDate(new Date()); var tmrISO = isoDate(new Date(Date.now() + 86400000));
    var day = flow.dateISO === todayISO ? 'Hôm nay' : (flow.dateISO === tmrISO ? 'Ngày mai' : (WEEKDAYS[d.getDay()] + ' ' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1)));
    return day + ' lúc ' + flow.timeSlot;
  }
  function updateTimeBar() {
    var ok = flow.urgent || (flow.dateISO && flow.timeSlot);
    el('timeSelectedInfo').textContent = ok ? ('Đã chọn: ' + buildDateTimeLabel()) : 'Vui lòng chọn thời gian';
    el('timeContinueBtn').disabled = !ok;
  }

  /* ---------------- BƯỚC 4: ĐỊA CHỈ ---------------- */
  function fillAddressInputs() {
    el('inpName').value = flow.custName || (user && user.name) || '';
    el('inpPhone').value = flow.custPhone || (user && user.phone) || '';
    el('inpAddress').value = flow.address || '';
    el('inpNote').value = flow.note || '';
    el('inpPatient').value = flow.patientName || '';
    el('inpRelation').value = flow.relation || '';
    applyBookingForUI();
  }
  function applyBookingForUI() {
    var rel = flow.bookingFor === 'relative';
    el('forSelfBtn').classList.toggle('selected', !rel);
    el('forRelativeBtn').classList.toggle('selected', rel);
    el('relativeFields').classList.toggle('hidden', !rel);
  }
  function setBookingFor(mode) { flow.bookingFor = mode === 'relative' ? 'relative' : 'self'; if (flow.bookingFor === 'self') { flow.patientName = ''; flow.relation = ''; } saveFlow(); applyBookingForUI(); updateAddrBar(); }
  window.setBookingFor = setBookingFor;
  function onAddressInput() {
    flow.custName = el('inpName').value; flow.custPhone = el('inpPhone').value;
    flow.address = el('inpAddress').value; flow.note = el('inpNote').value;
    flow.patientName = el('inpPatient').value; flow.relation = el('inpRelation').value;
    saveFlow(); updateAddrBar();
  }
  window.onAddressInput = onAddressInput;
  function validateAddress() {
    var base = (flow.custName || '').trim().length > 1 && (flow.custPhone || '').trim().replace(/\D/g, '').length >= 9 && (flow.address || '').trim().length > 5;
    if (flow.bookingFor === 'relative') return base && (flow.patientName || '').trim().length > 1;
    return base;
  }
  function updateAddrBar() { el('addrContinueBtn').disabled = !validateAddress(); }

  /* ---------------- BƯỚC 5: XÁC NHẬN ---------------- */
  function techDisplayName() {
    if (flow.techId === 'auto') return '🤖 Hệ thống tự chọn KTV phù hợp gần bạn nhất';
    var t = findTech(flow.techId); return t ? t.name : '—';
  }
  function renderConfirm() {
    var pct = memberPct();
    var svc = flow.cart.map(function (i) { var s = findService(i.serviceId); return '<div class="confirm-line"><span class="l">' + s.emoji + ' ' + escapeHtml(s.name) + ' (' + i.minutes + 'p)</span><span class="r">' + money(applyMember(i.price)) + '</span></div>'; }).join('');
    var addon = flow.addons.map(function (id) { var a = findAddon(id); return '<div class="confirm-line"><span class="l">' + a.emoji + ' ' + escapeHtml(a.name) + '</span><span class="r">' + money(applyMember(a.price)) + '</span></div>'; }).join('');
    var h = '<div class="confirm-section"><div class="confirm-section-head"><span>Dịch vụ</span><button class="confirm-edit" onclick="goTo(\'services\')">Sửa</button></div>' + svc + (addon ? '<hr class="confirm-divider">' + addon : '') + '</div>';
    h += '<hr class="confirm-divider"><div class="confirm-section"><div class="confirm-section-head"><span>Kỹ thuật viên</span><button class="confirm-edit" onclick="goTo(\'tech\')">Sửa</button></div><div class="confirm-line"><span class="l">' + escapeHtml(techDisplayName()) + '</span></div></div>';
    h += '<hr class="confirm-divider"><div class="confirm-section"><div class="confirm-section-head"><span>Thời gian</span><button class="confirm-edit" onclick="goTo(\'time\')">Sửa</button></div><div class="confirm-line"><span class="l">' + escapeHtml(buildDateTimeLabel()) + '</span></div></div>';
    var forLine = flow.bookingFor === 'relative' ? '<div class="confirm-line"><span class="l">👵 Chăm sóc cho: ' + escapeHtml(flow.patientName) + (flow.relation ? ' (' + escapeHtml(flow.relation) + ')' : '') + '</span></div>' : '';
    h += '<hr class="confirm-divider"><div class="confirm-section"><div class="confirm-section-head"><span>Địa chỉ & khách hàng</span><button class="confirm-edit" onclick="goTo(\'address\')">Sửa</button></div>' + forLine + '<div class="confirm-line"><span class="l">' + escapeHtml(flow.custName) + ' · ' + escapeHtml(flow.custPhone) + '</span></div><div class="confirm-note-box">📍 ' + escapeHtml(flow.address) + '</div>' + (flow.note ? '<div class="confirm-note-box">📝 ' + escapeHtml(flow.note) + '</div>' : '') + '</div>';
    h += '<hr class="confirm-divider"><div class="total-row"><span>Tổng cộng</span><strong>' + money(computeTotal()) + '</strong></div><span class="no-surcharge">✔ Trọn gói — không phát sinh thêm</span>';
    if (pct) h += '<span class="no-surcharge member">🎖️ Đã áp dụng giảm hội viên -' + pct + '%</span>';
    el('confirmBody').innerHTML = h;
  }

  /* ---------------- BƯỚC 6: THANH TOÁN ---------------- */
  function setPayment(m) { flow.payment = m; saveFlow(); renderPayment(); }
  window.setPayment = setPayment;
  function renderPayment() {
    el('payCashLabel').classList.toggle('selected', flow.payment === 'cash');
    el('payTransferLabel').classList.toggle('selected', flow.payment === 'transfer');
    el('qrBlock').classList.toggle('hidden', flow.payment !== 'transfer');
    var note = 'RT-' + (flow.custPhone || '').replace(/\D/g, '').slice(-4);
    var total = computeTotal();
    el('qrOrderCode').textContent = note;
    el('qrAmount').textContent = money(total);
    if (flow.payment === 'transfer' && total >= 1000) {
      // Mã QR động: quét là app ngân hàng tự điền sẵn số tiền + nội dung (lỗi thì tự quay về mã tĩnh)
      var src = '/api/payqr.svg?amount=' + total + '&note=' + encodeURIComponent(note);
      if (el('qrImg').getAttribute('src') !== src) el('qrImg').setAttribute('src', src);
      el('qrCaption').textContent = 'Mở app ngân hàng / MoMo / ZaloPay → Quét mã — số tiền & nội dung đã điền sẵn';
    }
    el('paymentTotal').innerHTML = '<span>Tổng thanh toán</span><strong>' + money(total) + '</strong>';
    var radio = document.querySelector('input[name="pay"][value="' + flow.payment + '"]'); if (radio) radio.checked = true;
  }

  function createOrder() {
    var btn = el('confirmOrderBtn'); btn.disabled = true;
    api('/api/bookings', 'POST', {
      cart: flow.cart, addons: flow.addons, techId: flow.techId,
      dateTimeLabel: buildDateTimeLabel(), urgent: flow.urgent,
      address: flow.address, custName: flow.custName, custPhone: flow.custPhone, note: flow.note, payment: flow.payment,
      bookingFor: flow.bookingFor, patientName: flow.patientName, relation: flow.relation,
    }).then(function (res) {
      setUser(res.user);
      lastOrderCode = res.booking.code;
      // reset bước đặt lịch, giữ tên/SĐT
      var keepName = flow.custName, keepPhone = flow.custPhone;
      flow = defaultFlow(); flow.custName = keepName; flow.custPhone = keepPhone; saveFlow();
      btn.disabled = false;
      if (res.pointsEarned > 0) toast('Đặt lịch thành công! +' + res.pointsEarned + ' điểm thưởng');
      goTo('tracking');
    }).catch(function (e) { btn.disabled = false; showErr('payError', e.message); });
  }
  window.createOrder = createOrder;

  /* ---------------- THEO DÕI ĐƠN ---------------- */
  function renderTrackingFrom(b) {
    el('orderCode').textContent = b.code;
    el('trackingStepper').innerHTML = b.statuses.map(function (s, idx) {
      var cls = idx < b.statusIdx ? 'done' : (idx === b.statusIdx ? 'active' : '');
      return '<div class="step-item ' + cls + '"><div class="step-line"></div><div class="step-icon">' + s.icon + '</div><div class="step-label">' + s.label + '</div></div>';
    }).join('');
    var t = b.tech;
    if (t) {
      el('trackingTechCard').innerHTML = avatarHtml(t) +
        '<div class="tc-info"><div class="tc-name">' + escapeHtml(t.name) + '</div><div class="tc-meta">⭐ ' + t.rating.toFixed(1) + ' · ✔ Kỹ thuật viên tận tâm, giàu kinh nghiệm</div></div>' +
        '<a class="btn btn-outline" href="tel:0762419688">📞 Hỗ trợ</a>';
    }
    var svc = b.items.map(function (i) { var s = findService(i.serviceId); return '<div class="confirm-line"><span class="l">' + (s ? s.emoji + ' ' + escapeHtml(s.name) : i.serviceId) + ' (' + i.minutes + 'p)</span><span class="r">' + money(applyPct(i.price, b.memberPct)) + '</span></div>'; }).join('');
    el('trackingSummary').innerHTML = '<div class="confirm-section"><div class="confirm-section-head"><span>Đơn của Anh/Chị</span></div>' + svc + '</div>' +
      '<hr class="confirm-divider"><div class="confirm-line"><span class="l">🕒 Thời gian</span><span class="r">' + escapeHtml(b.dateTimeLabel) + '</span></div>' +
      '<div class="confirm-line"><span class="l">📍 Địa chỉ</span><span class="r">' + escapeHtml(b.address) + '</span></div>' +
      '<div class="confirm-line"><span class="l">💳 Thanh toán</span><span class="r">' + (b.payment === 'cash' ? 'Tiền mặt' : 'Chuyển khoản/QR') + '</span></div>' +
      '<hr class="confirm-divider"><div class="total-row"><span>Tổng cộng</span><strong>' + money(b.total) + '</strong></div>';
    var done = b.statusIdx >= b.statuses.length - 1;
    el('trackDemoControls').classList.toggle('hidden', done);
    el('trackingRatingBar').style.display = done ? 'block' : 'none';
  }
  function renderTracking() {
    if (!lastOrderCode) { goTo('home'); return; }
    el('trackingStepper').innerHTML = '<p class="loading-line">Đang tải trạng thái đơn…</p>';
    api('/api/bookings/' + lastOrderCode).then(function (res) { renderTrackingFrom(res.booking); }).catch(function () {});
  }
  function startTrack() {
    stopTrack();
    if (current !== 'tracking' || !lastOrderCode) return;
    trackTimer = setInterval(function () {
      api('/api/bookings/' + lastOrderCode).then(function (res) {
        renderTrackingFrom(res.booking);
        if (res.booking.statusIdx >= res.booking.statuses.length - 1) stopTrack();
      }).catch(function () {});
    }, 4000);
  }
  function stopTrack() { if (trackTimer) { clearInterval(trackTimer); trackTimer = null; } }
  function advanceStatus() {
    if (!lastOrderCode) return;
    api('/api/bookings/' + lastOrderCode + '/advance', 'POST').then(function (res) { renderTrackingFrom(res.booking); }).catch(function (e) { toast(e.message); });
  }
  window.advanceStatus = advanceStatus;

  /* ---------------- ĐÁNH GIÁ ---------------- */
  var ratingStars = 0;
  var RATING_LABELS = { 0: 'Chạm vào ngôi sao để đánh giá', 1: 'Rất không hài lòng', 2: 'Không hài lòng', 3: 'Bình thường', 4: 'Hài lòng', 5: 'Tuyệt vời!' };
  function renderRating() {
    el('ratingForm').classList.remove('hidden'); el('ratingThanks').classList.add('hidden');
    ratingStars = 0; el('ratingComment').value = '';
    renderStars(); el('starLabel').textContent = RATING_LABELS[0]; el('starLabel').style.color = '';
  }
  function renderStars() {
    var h = ''; for (var i = 1; i <= 5; i++) h += '<span class="star' + (i <= ratingStars ? ' active' : '') + '" onclick="setRating(' + i + ')">★</span>';
    el('starRow').innerHTML = h;
  }
  function setRating(n) { ratingStars = n; renderStars(); el('starLabel').textContent = RATING_LABELS[n]; el('starLabel').style.color = ''; }
  window.setRating = setRating;
  function submitRating() {
    if (ratingStars === 0) { el('starLabel').textContent = '⚠️ Vui lòng chọn số sao trước khi gửi'; el('starLabel').style.color = 'var(--red)'; return; }
    api('/api/bookings/' + lastOrderCode + '/rating', 'POST', { stars: ratingStars, comment: el('ratingComment').value }).then(function () {
      el('ratingForm').classList.add('hidden'); el('ratingThanks').classList.remove('hidden');
    }).catch(function (e) { toast(e.message); });
  }
  window.submitRating = submitRating;

  /* ---------------- SẢN PHẨM ---------------- */
  var prodCart = [];   // [{productId, qty}]
  var prodPayment = 'cash';
  function prodTotal() { var t = 0; prodCart.forEach(function (i) { var p = findProduct(i.productId); if (p) t += applyMember(p.price) * i.qty; }); return t; }
  function renderProducts() {
    var pct = memberPct();
    var badge = el('productMemberBadge');
    if (pct) { badge.classList.remove('hidden'); badge.textContent = '🎖️ Hội viên ' + user.membership.label + ' — đang giảm ' + pct + '% mọi sản phẩm'; } else badge.classList.add('hidden');
    el('productGrid').innerHTML = CATALOG.products.map(function (p) {
      var item = prodCart.filter(function (i) { return i.productId === p.id; })[0];
      var qty = item ? item.qty : 0;
      var priceHtml = pct ? '<span class="p-old">' + money(p.price) + '</span><span class="p">' + money(applyMember(p.price)) + '</span>' : '<span class="p">' + money(p.price) + '</span>';
      var canRedeem = user.loyaltyPoints >= p.pointCost;
      var ctrl = qty > 0 ? '<div class="qty-row"><button class="qty-btn" onclick="changeCartQty(\'' + p.id + '\',-1)">−</button><span class="qty-num">' + qty + '</span><button class="qty-btn" onclick="changeCartQty(\'' + p.id + '\',1)">+</button></div>'
        : '<button class="btn btn-outline btn-block" onclick="addToCart(\'' + p.id + '\')">🛒 Thêm vào giỏ</button>';
      return '<div class="prod-card"><span class="emoji">' + p.emoji + '</span><span class="name">' + escapeHtml(p.name) + '</span>' +
        '<span class="prod-desc">' + escapeHtml(p.desc) + '</span><div class="prod-price">' + priceHtml + '</div>' + ctrl +
        '<button class="btn btn-gold btn-block prod-redeem" ' + (canRedeem ? 'onclick="redeemProduct(\'' + p.id + '\')"' : 'disabled') + '>🎁 Đổi ' + p.pointCost + ' điểm</button></div>';
    }).join('');
    renderProductCheckout();
  }
  function addToCart(id) { var i = prodCart.filter(function (x) { return x.productId === id; })[0]; if (i) i.qty += 1; else prodCart.push({ productId: id, qty: 1 }); renderProducts(); toast('Đã thêm vào giỏ hàng'); }
  window.addToCart = addToCart;
  function changeCartQty(id, d) { var i = prodCart.filter(function (x) { return x.productId === id; })[0]; if (!i) return; i.qty += d; if (i.qty <= 0) prodCart = prodCart.filter(function (x) { return x.productId !== id; }); renderProducts(); }
  window.changeCartQty = changeCartQty;
  function clearProductCart() { prodCart = []; prodPayment = 'cash'; renderProducts(); }
  window.clearProductCart = clearProductCart;
  function setProductPayment(m) { prodPayment = m; renderProductCheckout(); }
  window.setProductPayment = setProductPayment;
  function renderProductCheckout() {
    var count = prodCart.reduce(function (s, i) { return s + i.qty; }, 0);
    var total = prodTotal();
    el('productCartCount').textContent = count === 0 ? 'Giỏ hàng trống' : ('Giỏ hàng: ' + count + ' sản phẩm');
    el('productCartTotal').textContent = count > 0 ? money(total) : '';
    var panel = el('productCheckoutPanel');
    if (count === 0) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    el('productCartLines').innerHTML = prodCart.map(function (i) { var p = findProduct(i.productId); return '<div class="confirm-line"><span class="l">' + p.emoji + ' ' + escapeHtml(p.name) + ' × ' + i.qty + '</span><span class="r">' + money(applyMember(p.price) * i.qty) + '</span></div>'; }).join('');
    el('productCheckoutTotal').textContent = money(total);
    var refOk = user.referral.balance >= total;
    var refInput = document.querySelector('input[name="prodpay"][value="referral"]'); if (refInput) refInput.disabled = !refOk;
    if (!refOk && prodPayment === 'referral') prodPayment = 'cash';
    el('prodPayCashLabel').classList.toggle('selected', prodPayment === 'cash');
    el('prodPayReferralLabel').classList.toggle('selected', prodPayment === 'referral');
    el('prodPayReferralLabel').classList.toggle('disabled', !refOk);
    var r2 = document.querySelector('input[name="prodpay"][value="' + prodPayment + '"]'); if (r2) r2.checked = true;
    el('prodReferralBalanceHint').textContent = '(' + money(user.referral.balance) + ')';
  }
  function checkoutProductCart() {
    if (prodCart.length === 0) return;
    api('/api/products/checkout', 'POST', { cart: prodCart, method: prodPayment }).then(function (res) {
      setUser(res.user); prodCart = []; prodPayment = 'cash'; renderProducts();
      toast(res.method === 'referral' ? ('Mua thành công — đã trừ ' + money(res.total) + ' từ hoa hồng') : ('Mua thành công! +' + res.pointsEarned + ' điểm'));
    }).catch(function (e) { toast(e.message); });
  }
  window.checkoutProductCart = checkoutProductCart;
  function redeemProduct(id) {
    var p = findProduct(id);
    if (!confirm('Đổi ' + p.pointCost + ' điểm lấy "' + p.name + '"?')) return;
    api('/api/products/redeem', 'POST', { productId: id }).then(function (res) { setUser(res.user); renderProducts(); toast('Đổi điểm thành công! Nhận "' + p.name + '"'); }).catch(function (e) { toast(e.message); });
  }
  window.redeemProduct = redeemProduct;

  /* ---------------- TÀI KHOẢN ---------------- */
  function loadAccount() {
    el('accountGreeting').textContent = 'Đang tải…';
    api('/api/me').then(function (res) {
      setUser(res.user);
      el('accountGreeting').textContent = user.name ? ('Xin chào ' + user.name + ' — quản lý điểm thưởng, giới thiệu và hội viên tại đây.') : 'Quản lý điểm thưởng, giới thiệu bạn bè và hội viên tại đây.';
      el('accPoints').textContent = user.loyaltyPoints;
      el('refLinkText').textContent = referralLink();
      el('refBalance').textContent = money(user.referral.balance);
      var hist = res.referralHistory.slice(0, 5).map(function (h) { var s = h.amount >= 0 ? '+' : ''; return '<div class="confirm-line"><span class="l">' + escapeHtml(h.note) + '</span><span class="r">' + s + money(h.amount) + '</span></div>'; }).join('');
      el('refHistoryList').innerHTML = hist ? ('<hr class="confirm-divider">' + hist) : '';
      renderMemberPlans();
      renderOrderHistory(res);
    }).catch(function (e) { el('accountGreeting').textContent = 'Lỗi tải tài khoản: ' + e.message; });
  }
  /* ---- Link giới thiệu (dùng đúng địa chỉ app đang chạy) ---- */
  function referralBase() { return (window.location.origin || 'https://rumtran-app.onrender.com').replace(/\/$/, ''); }
  function referralLink() { return referralBase() + '/?ref=' + (user && user.referral ? user.referral.code : ''); }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { toast('Đã sao chép link giới thiệu'); }).catch(function () { toast('Không sao chép được — vui lòng copy thủ công'); });
    }
    toast('Vui lòng copy thủ công'); return Promise.resolve();
  }
  function copyReferralLink() { copyText(referralLink()); }
  window.copyReferralLink = copyReferralLink;

  /* ---- Bảng "Chia sẻ link giới thiệu" ---- */
  function openShareModal() {
    if (!user) { goTo('login'); return; }
    var link = referralLink();
    el('shareModalBody').innerHTML =
      '<div class="share-head"><div class="share-emoji">🎁</div><h2>Giới thiệu bạn bè — Nhận 10%</h2>' +
      '<p class="hint center">Gửi link riêng của Anh/Chị cho bạn bè. Khi bạn ấy đăng ký và <strong>đặt đơn đầu tiên</strong>, Anh/Chị nhận <strong>10% giá trị đơn đó</strong> vào số dư hoa hồng.</p></div>' +
      '<div class="ref-link-box"><span id="shareLinkText">' + escapeHtml(link) + '</span>' +
      '<button class="btn btn-outline" onclick="copyReferralLink()">📋 Sao chép</button></div>' +
      '<button class="btn btn-primary btn-block btn-lg" onclick="shareReferral()">📤 Chia sẻ ngay (Zalo, Messenger...)</button>' +
      '<button class="btn btn-ghost btn-block" onclick="closeShareModal()">Để sau</button>';
    el('shareModal').classList.remove('hidden');
  }
  window.openShareModal = openShareModal;
  function closeShareModal(e) { if (e && e.target && e.target.closest && e.target.closest('.modal-card') && e.type === 'click') return; el('shareModal').classList.add('hidden'); }
  window.closeShareModal = closeShareModal;
  function shareReferral() {
    var link = referralLink();
    var text = 'Mình dùng RUM TRẦN KHỎE ĐẸP — dưỡng sinh, chăm sóc sức khỏe tận nhà, 350k/60 phút trọn gói, không phát sinh thêm. Đăng ký qua link này nhé: ';
    if (navigator.share) {
      navigator.share({ title: 'RUM TRẦN KHỎE ĐẸP', text: text, url: link }).catch(function () {});
    } else {
      copyText(text + link).then(function () { toast('Đã sao chép lời mời — dán vào Zalo/Facebook để gửi'); });
    }
  }
  window.shareReferral = shareReferral;
  function simulateReferralOrder() { api('/api/referral/simulate', 'POST').then(function (res) { setUser(res.user); loadAccount(); toast('Có khách mới qua link! +' + money(res.commission) + ' hoa hồng'); }).catch(function (e) { toast(e.message); }); }
  window.simulateReferralOrder = simulateReferralOrder;
  function withdrawReferral() {
    if (user.referral.balance < 100000) { toast('Số dư chưa đủ 100.000đ để rút'); return; }
    if (!confirm('Rút ' + money(user.referral.balance) + ' tiền mặt?')) return;
    api('/api/referral/withdraw', 'POST').then(function (res) { setUser(res.user); loadAccount(); toast('Đã ghi nhận yêu cầu rút ' + money(res.amount)); }).catch(function (e) { toast(e.message); });
  }
  window.withdrawReferral = withdrawReferral;
  function renderMemberPlans() {
    var status = el('membershipStatus');
    if (user.membership.tier) {
      var exp = user.membership.expiresAt ? new Date(user.membership.expiresAt) : null;
      var expL = exp ? (pad2(exp.getDate()) + '/' + pad2(exp.getMonth() + 1) + '/' + exp.getFullYear()) : '—';
      status.innerHTML = '🎖️ Đang là hội viên <strong>' + user.membership.label + '</strong> — giảm <strong>' + user.membership.discountPct + '%</strong> mọi sản phẩm & dịch vụ. Hết hạn: ' + expL + '. <button class="confirm-edit" onclick="cancelMembership()">Huỷ</button>';
    } else status.textContent = 'Chưa là hội viên — đăng ký để giảm giá mọi sản phẩm & dịch vụ.';
    el('memberPlans').innerHTML = CATALOG.membershipPlans.map(function (pl) {
      var active = user.membership.tier === pl.id;
      return '<div class="plan-card' + (active ? ' active' : '') + '"><div class="plan-label">' + pl.label + '</div><div class="plan-price">' + money(pl.price) + '</div><div class="plan-discount">Giảm ' + pl.discount + '% mọi SP &amp; DV</div>' +
        '<button class="btn ' + (active ? 'btn-outline' : 'btn-primary') + ' btn-block" ' + (active ? 'disabled' : 'onclick="subscribeMembership(\'' + pl.id + '\')"') + '>' + (active ? '✔ Đang dùng' : 'Đăng ký') + '</button></div>';
    }).join('');
  }
  function subscribeMembership(id) {
    var pl = CATALOG.membershipPlans.filter(function (p) { return p.id === id; })[0];
    if (!confirm('Đăng ký gói hội viên ' + pl.label + ' — ' + money(pl.price) + '?')) return;
    api('/api/membership/subscribe', 'POST', { planId: id }).then(function (res) { setUser(res.user); loadAccount(); toast('Đăng ký hội viên ' + pl.label + ' thành công'); }).catch(function (e) { toast(e.message); });
  }
  window.subscribeMembership = subscribeMembership;
  function cancelMembership() { if (!confirm('Huỷ gói hội viên hiện tại?')) return; api('/api/membership/cancel', 'POST').then(function (res) { setUser(res.user); loadAccount(); toast('Đã huỷ hội viên'); }).catch(function (e) { toast(e.message); }); }
  window.cancelMembership = cancelMembership;
  function renderOrderHistory(res) {
    var items = [];
    res.bookings.forEach(function (o) { items.push({ ts: o.createdAt, html: '<div class="confirm-line"><span class="l">💆 Dịch vụ #' + o.code + ' — ' + escapeHtml(o.dateTimeLabel || '') + '</span><span class="r">' + money(o.total) + '</span></div>' }); });
    res.productOrders.forEach(function (o) { var label = o.method === 'points' ? 'Đổi điểm' : (o.method === 'referral' ? 'Dùng hoa hồng' : money(o.total)); var names = o.lines.map(function (l) { return l.name + ' ×' + l.qty; }).join(', '); items.push({ ts: o.ts, html: '<div class="confirm-line"><span class="l">🛍️ ' + escapeHtml(names) + '</span><span class="r">' + label + '</span></div>' }); });
    items.sort(function (a, b) { return b.ts - a.ts; });
    el('orderHistoryList').innerHTML = items.length ? items.map(function (i) { return i.html; }).join('') : '<p class="hint">Chưa có đơn nào.</p>';
  }

  /* ---------------- KTV ---------------- */
  var ktvId = null;
  function renderKtvSelect() {
    var sel = el('ktvSelect');
    sel.innerHTML = CATALOG.techs.map(function (t) { return '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>'; }).join('');
    if (!ktvId) ktvId = CATALOG.techs[0].id;
    sel.value = ktvId;
  }
  function loadKtv() {
    ktvId = Number(el('ktvSelect').value) || CATALOG.techs[0].id;
    api('/api/ktv/' + ktvId).then(function (res) {
      el('ktvBalance').textContent = money(res.balance);
      var w = el('ktvWarning');
      if (res.balance < res.minBalance) { w.textContent = '⚠️ Số dư dưới 100.000đ — tạm ngừng nhận việc, vui lòng nạp thêm.'; w.style.color = 'var(--red-d)'; }
      else { w.textContent = '✔ Đủ điều kiện nhận việc (đang duy trì tối thiểu 100.000đ).'; w.style.color = 'var(--green-ok)'; }
      el('ktvJobList').innerHTML = res.jobs.map(function (j) {
        var fee = Math.round(j.value * res.platformFee); var net = j.value - fee;
        var action = j.status === 'done' ? '<span class="badge-pill">✔ Đã hoàn thành — nhận ' + money(net) + '</span>'
          : '<button class="btn btn-primary btn-block" onclick="ktvComplete(' + j.id + ')">✅ Hoàn thành ca (trừ 25%)</button>';
        return '<div class="ktv-job-card"><div class="tc-name">' + escapeHtml(j.customer) + '</div><div class="tc-meta">' + escapeHtml(j.service) + ' · Giá trị ca: ' + money(j.value) + '</div>' + action + '</div>';
      }).join('');
    }).catch(function (e) { toast(e.message); });
  }
  window.loadKtv = loadKtv;
  function ktvTopUp(a) { api('/api/ktv/' + ktvId + '/topup', 'POST', { amount: a }).then(function () { loadKtv(); toast('Đã nạp ' + money(a) + ' vào ví'); }).catch(function (e) { toast(e.message); }); }
  window.ktvTopUp = ktvTopUp;
  function ktvComplete(jobId) { api('/api/ktv/' + ktvId + '/jobs/' + jobId + '/complete', 'POST').then(function (res) { loadKtv(); if (res.fee != null) toast('Hoàn thành ca! Nền tảng giữ ' + money(res.fee) + ', KTV nhận ' + money(res.net)); }).catch(function (e) { toast(e.message); }); }
  window.ktvComplete = ktvComplete;

  /* ---------------- ĐĂNG KÝ KỸ THUẬT VIÊN ---------------- */
  var ktvPhotoData = null;
  var ktvCertPhotos = [], ktvCccd = { front: null, back: null };
  // Đọc file ảnh → thu nhỏ cạnh dài tối đa `max` px → JPEG base64
  function shrinkImage(file, max, quality, done) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
        else if (h > max) { w = Math.round(w * max / h); h = max; }
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        done(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = function () { toast('Không đọc được ảnh, vui lòng chọn ảnh khác'); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }
  function renderKtvCerts() {
    el('ktvCertList').innerHTML = ktvCertPhotos.map(function (src, i) {
      return '<div class="ktv-doc-thumb" style="background-image:url(' + src + ')"><button type="button" class="ktv-doc-del" onclick="removeKtvCert(' + i + ')" aria-label="Xóa ảnh">✕</button></div>';
    }).join('');
  }
  function onKtvCert(e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (ktvCertPhotos.length + files.length > 3) toast('Tối đa 3 ảnh chứng chỉ');
    files.slice(0, 3 - ktvCertPhotos.length).forEach(function (f) {
      // Giấy tờ cần đọc rõ chữ → giữ 1400px
      shrinkImage(f, 1400, 0.8, function (data) { if (ktvCertPhotos.length < 3) { ktvCertPhotos.push(data); renderKtvCerts(); } });
    });
  }
  window.onKtvCert = onKtvCert;
  function removeKtvCert(i) { ktvCertPhotos.splice(i, 1); renderKtvCerts(); }
  window.removeKtvCert = removeKtvCert;
  function onKtvCccd(e, side) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    shrinkImage(file, 1400, 0.8, function (data) {
      ktvCccd[side] = data;
      var box = el(side === 'front' ? 'ktvCccdFront' : 'ktvCccdBack');
      box.style.backgroundImage = 'url(' + data + ')';
      box.classList.add('has-photo');
    });
  }
  window.onKtvCccd = onKtvCccd;
  function resetKtvDocs() {
    ktvCertPhotos = []; ktvCccd = { front: null, back: null }; renderKtvCerts();
    ['ktvCccdFront', 'ktvCccdBack'].forEach(function (id) { var b = el(id); b.style.backgroundImage = ''; b.classList.remove('has-photo'); });
  }
  function renderTechRegister() {
    var sel = el('ktvArea');
    if (sel && !sel.dataset.filled) {
      sel.innerHTML = '<option value="">— Chọn khu vực —</option>' + (CATALOG.areas || []).map(function (a) { return '<option value="' + escapeHtml(a) + '">' + escapeHtml(a) + '</option>'; }).join('');
      sel.dataset.filled = '1';
    }
  }
  function onKtvPhoto(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    // Thu nhỏ ảnh về tối đa 400px cho nhẹ, xuất JPEG
    shrinkImage(file, 400, 0.82, function (data) {
      ktvPhotoData = data;
      var prev = el('ktvPhotoPreview');
      prev.innerHTML = ''; prev.style.backgroundImage = 'url(' + ktvPhotoData + ')';
      prev.classList.add('has-photo');
    });
  }
  window.onKtvPhoto = onKtvPhoto;
  function submitTechApplication() {
    var body = {
      name: el('ktvName').value.trim(), phone: el('ktvPhone').value.trim(),
      gender: el('ktvGender').value, area: el('ktvArea').value,
      years: el('ktvYears').value, skills: el('ktvSkills').value.trim(),
      bio: el('ktvBio').value.trim(), photo: ktvPhotoData,
      certPhotos: ktvCertPhotos, cccdFront: ktvCccd.front, cccdBack: ktvCccd.back,
    };
    if (body.name.length < 2) { showErr('ktvRegError', 'Vui lòng nhập họ tên'); return; }
    if (body.phone.replace(/\D/g, '').length < 9) { showErr('ktvRegError', 'Số điện thoại chưa hợp lệ'); return; }
    if (!body.area) { showErr('ktvRegError', 'Vui lòng chọn khu vực'); return; }
    if (!body.cccdFront || !body.cccdBack) { showErr('ktvRegError', 'Vui lòng tải ảnh CCCD đủ 2 mặt'); return; }
    el('ktvRegBtn').disabled = true;
    api('/api/technicians/apply', 'POST', body).then(function () {
      el('ktvRegBtn').disabled = false;
      ktvPhotoData = null;
      resetKtvDocs();
      alert('Cảm ơn bạn đã đăng ký! Hồ sơ đang chờ RUM TRẦN duyệt. Chúng tôi sẽ liên hệ sớm.');
      goTo('login');
    }).catch(function (e) { el('ktvRegBtn').disabled = false; showErr('ktvRegError', e.message); });
  }
  window.submitTechApplication = submitTechApplication;

  /* ---------------- KHỞI ĐỘNG ---------------- */
  function captureRef() {
    try {
      var r = new URLSearchParams(window.location.search).get('ref');
      if (r) {
        localStorage.setItem('rt_ref', r);
        window.history.replaceState({}, document.title, window.location.pathname); // dọn URL cho sạch
      }
    } catch (e) {}
  }
  function boot() {
    captureRef();
    loadFlow();
    api('/api/catalog').then(function (cat) {
      CATALOG = cat;
      renderHomeServices();
      var savedUser = localStorage.getItem(USER_KEY);
      if (token() && savedUser) {
        try { user = JSON.parse(savedUser); } catch (e) { user = null; }
      }
      renderBrandRight();
      goTo(user ? 'home' : 'login');
      // Làm mới hồ sơ user nền (nếu đã đăng nhập)
      if (user) api('/api/me').then(function (r) { setUser(r.user); }).catch(function () {});
    }).catch(function (e) {
      document.getElementById('screen-login').innerHTML = '<p class="api-error show">Không kết nối được máy chủ: ' + escapeHtml(e.message) + '. Hãy chạy <code>npm start</code> rồi tải lại trang.</p>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

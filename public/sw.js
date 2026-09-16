/* Service worker — RUM TRẦN KHỎE ĐẸP (PWA)
   ƯU TIÊN MẠNG (network-first): luôn tải bản mới nhất khi có mạng,
   chỉ dùng bản lưu offline khi mất mạng. Tránh kẹt bản cũ trong bộ nhớ đệm. */
const CACHE = 'rumtran-v3';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/logo.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API: luôn lấy từ mạng
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(req).catch(() => new Response(JSON.stringify({ error: 'Mất kết nối mạng' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Mọi thứ khác (HTML/CSS/JS/ảnh): MẠNG TRƯỚC, cập nhật cache; mất mạng thì lấy cache
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html')))
  );
});

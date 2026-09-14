/* Service worker — RUM TRẦN KHỎE ĐẸP (PWA)
   Cache "app shell" để mở nhanh & dùng được khi mạng chập chờn.
   API luôn ưu tiên mạng (network-first) để dữ liệu mới nhất. */
const CACHE = 'rumtran-v1';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/icon.svg', '/manifest.webmanifest'];

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

  // API: luôn lấy từ mạng (không cache dữ liệu động)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(req).catch(() => new Response(JSON.stringify({ error: 'Mất kết nối mạng' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Điều hướng trang: mạng trước, hỏng thì trả trang chủ trong cache
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }

  // Tài nguyên tĩnh: cache trước, nền tải mới cập nhật
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => hit))
  );
});

# Hướng dẫn đưa app RUM TRẦN lên internet

Có 2 cách. **A** để xem/demo ngay, **B** để chạy thật lâu dài.

---

## A. Link nhanh bằng Cloudflare Tunnel (không cần tài khoản)
Dùng khi muốn mở trên điện thoại / gửi khách xem thử liền. Link sống khi máy tính bật.

1. Bật server: `npm start`
2. Mở đường hầm (đã có sẵn file `cloudflared.exe`):
   ```
   cloudflared.exe tunnel --url http://localhost:3000 --no-autoupdate
   ```
3. Cloudflared in ra một link dạng `https://xxxx.trycloudflare.com` → đó là link công khai.

> Hạn chế: link đổi mỗi lần chạy lại; chỉ sống khi máy bật. Hợp để thử, không hợp chạy thật.

---

## B. Hosting chạy 24/7 — Render.com (khuyên dùng)
Cần: 1 tài khoản GitHub + 1 tài khoản Render (đăng ký miễn phí bằng email). **Bạn tự tạo tài khoản**, sau đó làm theo:

### B1. Đưa mã nguồn lên GitHub
```
cd app-cham-soc-suc-khoe-that
git init
git add .
git commit -m "RUM TRAN app"
```
Tạo 1 repo trống trên github.com rồi:
```
git remote add origin https://github.com/<tên-bạn>/rumtran-app.git
git branch -M main
git push -u origin main
```

### B2. Deploy trên Render
1. Vào https://render.com → đăng nhập bằng GitHub.
2. Bấm **New +** → **Blueprint** → chọn repo vừa đẩy (Render tự đọc `render.yaml`).
3. Nhập biến `ADMIN_KEY` = một chuỗi bí mật của bạn (khóa vào trang quản trị).
4. Bấm **Apply** → chờ ~2–3 phút → được link dạng `https://rumtran-khoe-dep.onrender.com`.

### B3. Lưu ý dữ liệu (QUAN TRỌNG)
- Gói **free** của Render **không giữ dữ liệu bền**: mỗi lần deploy lại / ngủ dậy, file SQLite có thể mất → đơn hàng, tài khoản bị reset. **Chỉ hợp để chạy thử.**
- Để chạy **thật, giữ dữ liệu**, chọn 1 trong 2:
  - **Cách dễ:** nâng Render lên gói có phí rồi bật `disk` (đã ghi sẵn, chỉ cần bỏ dấu `#`) mount vào `/app/data`.
  - **Cách bền hơn (khuyên khi có khách thật):** chuyển từ SQLite sang **PostgreSQL** (Render/Supabase có Postgres miễn phí). Xem tài liệu kiến trúc trong `🧠 BỘ NÃO/Kiến trúc & Kế hoạch kỹ thuật - App RUM TRẦN.md`.

---

## Các bước NÊN làm trước khi mở cho khách thật
1. Đổi `ADMIN_KEY` sang chuỗi bí mật (không để `rumtran-admin`).
2. Gắn **đăng nhập OTP** qua Zalo ZNS/SMS thay cho nhập SĐT trơn.
3. Gắn **cổng thanh toán thật** VNPay/MoMo/ZaloPay (hiện là QR mô phỏng).
4. Thêm **Chính sách bảo mật + Điều khoản** (bắt buộc khi lên App Store/Google Play).

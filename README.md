# RUM TRẦN KHỎE ĐẸP — App chăm sóc sức khỏe & dưỡng sinh tận nhà (bản APP THẬT)

App đặt lịch dưỡng sinh / bấm huyệt / chăm sóc sức khỏe tận nhà, nâng cấp từ bản demo lên **app thật có backend + cơ sở dữ liệu**. Dữ liệu (khách, đơn, điểm thưởng, hoa hồng, ví KTV) được lưu thật trong SQLite và **server là nguồn quyết định mọi tính tiền** — client chỉ hiển thị.

## Công nghệ
- **Backend:** Node.js + Express
- **CSDL:** SQLite (`better-sqlite3`) — lưu tại `data/rumtran.db`, không cần cài dịch vụ ngoài
- **Frontend:** HTML/CSS/JS thuần (PWA-ready), gọi REST API — giữ nguyên phong cách giao diện thương hiệu (đỏ #d81f26 + vàng #c8912f)

## Chạy tại máy
```bash
cd "app-cham-soc-suc-khoe-that"
npm install
npm start
```
Mở trình duyệt: **http://localhost:3000**

> Lần đầu chạy sẽ tự tạo file CSDL `data/rumtran.db`. Đăng nhập bằng **họ tên + số điện thoại** (không cần mật khẩu ở bản MVP — sau này gắn OTP qua Zalo ZNS/SMS).

## Cấu trúc
```
app-cham-soc-suc-khoe-that/
├── package.json
├── server/
│   ├── index.js     # Express + toàn bộ REST API
│   ├── db.js        # Khởi tạo schema SQLite
│   └── data.js      # Danh mục dịch vụ/sản phẩm/KTV + cấu hình nghiệp vụ
└── public/          # Frontend
    ├── index.html
    ├── style.css
    └── app.js
```

## API chính
| Nhóm | Endpoint |
|---|---|
| Đăng nhập | `POST /api/auth/login` |
| Danh mục | `GET /api/catalog` |
| Hồ sơ của tôi | `GET /api/me` |
| Đặt lịch | `POST /api/bookings` · `GET /api/bookings/:code` · `POST /api/bookings/:code/advance` · `POST /api/bookings/:code/rating` |
| Sản phẩm | `POST /api/products/checkout` · `POST /api/products/redeem` |
| Hội viên | `POST /api/membership/subscribe` · `POST /api/membership/cancel` |
| Giới thiệu | `POST /api/referral/simulate` · `POST /api/referral/withdraw` |
| Ví KTV | `GET /api/ktv/:techId` · `POST /api/ktv/:techId/topup` · `POST /api/ktv/:techId/jobs/:jobId/complete` |

## Định vị & lưu ý
- Định hướng **dưỡng sinh & chăm sóc sức khỏe** (thư giãn, cân bằng, phục hồi nhẹ nhàng, tận nhà).
- Luôn giữ dòng miễn trừ: *"Hiệu quả tùy cơ địa, không thay thế chỉ định của bác sĩ."*

## Hướng lên production (theo tài liệu kiến trúc trong 🧠 BỘ NÃO)
- Chuyển SQLite → **Supabase (Postgres + Auth OTP + Realtime)** khi mở rộng nhiều tỉnh.
- Gắn cổng thanh toán thật **VNPay / MoMo / ZaloPay** (bản demo mới là QR mô phỏng).
- Thông báo đơn qua **Zalo ZNS / SMS**; realtime tracking thay cho polling.

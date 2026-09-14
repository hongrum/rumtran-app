/* =====================================================
   RUM TRẦN KHỎE ĐẸP — Danh mục (catalog) dùng chung
   Định vị: DƯỠNG SINH & CHĂM SÓC SỨC KHỎE tận nhà.
   Đây là dữ liệu cấu hình do cửa hàng quản lý (server là nguồn thật).
   ===================================================== */

// Mọi dịch vụ chính chung 3 mức thời lượng (theo bảng giá RUM TRẦN)
const TIERS = [
  { m: 60, p: 350000 },
  { m: 90, p: 490000 },
  { m: 120, p: 600000 },
];

const SERVICES = [
  {
    id: 'duong-sinh-toan-than',
    emoji: '🌿',
    name: 'Dưỡng sinh toàn thân',
    desc: 'Xoa bóp bấm huyệt dưỡng sinh khai thông kinh lạc, thư giãn sâu, cân bằng cơ thể và tinh thần.',
    who: 'Kỹ thuật viên dưỡng sinh được đào tạo bài bản, tận tâm, thao tác nhẹ nhàng.',
    tiers: TIERS,
  },
  {
    id: 'xoa-bop-co-vai-gay',
    emoji: '🤲',
    name: 'Xoa bóp dưỡng sinh cổ vai gáy',
    desc: 'Xoa bóp bấm huyệt vùng cổ – vai – gáy, giảm mỏi, cải thiện tuần hoàn, thư giãn nhẹ nhàng.',
    who: 'Kỹ thuật viên dưỡng sinh được đào tạo bài bản, chuyên vùng cổ – vai – gáy.',
    tiers: TIERS,
  },
  {
    id: 'nang-co-mat',
    emoji: '✨',
    name: 'Chăm sóc & nâng cơ mặt',
    desc: 'Xoa bóp bấm huyệt vùng mặt giúp thư giãn cơ, hỗ trợ da săn chắc theo thời gian.',
    who: 'Kỹ thuật viên được đào tạo bài bản, thao tác nhẹ nhàng, an toàn.',
    tiers: TIERS,
  },
  {
    id: 'thu-gian-giam-cang-thang',
    emoji: '🧘',
    name: 'Thư giãn – giảm căng thẳng',
    desc: 'Liệu trình dưỡng sinh giúp giải tỏa căng thẳng, ngủ ngon hơn, phục hồi năng lượng.',
    who: 'Kỹ thuật viên dưỡng sinh được đào tạo bài bản, tận tâm.',
    tiers: TIERS,
  },
];

const ADDONS = [
  { id: 'cao-gio', emoji: '🌬️', name: 'Cạo gió', price: 30000 },
  { id: 'giac-hoi', emoji: '🔥', name: 'Giác hơi', price: 50000 },
];

const PRODUCTS = [
  { id: 'dau-massage', emoji: '🧴', name: 'Dầu massage thảo dược (100ml)', desc: 'Dầu xoa bóp chiết xuất thảo dược, làm nóng nhẹ, hỗ trợ thư giãn.', price: 120000, pointCost: 12 },
  { id: 'cao-xoa-bop', emoji: '🍯', name: 'Cao xoa bóp thảo dược', desc: 'Cao xoa vùng vai gáy, lưng, khớp — tiện mang theo.', price: 60000, pointCost: 6 },
  { id: 'tra-thao-duoc', emoji: '🍵', name: 'Trà thảo dược ngủ ngon', desc: 'Trà thảo mộc hỗ trợ thư giãn, dễ ngủ, dùng buổi tối.', price: 90000, pointCost: 9 },
  { id: 'muoi-ngam-chan', emoji: '🧂', name: 'Muối thảo dược ngâm chân', desc: 'Muối thảo dược ngâm chân giúp thư giãn, cải thiện tuần hoàn.', price: 100000, pointCost: 10 },
  { id: 'tinh-dau', emoji: '💧', name: 'Tinh dầu tràm / khuynh diệp', desc: 'Tinh dầu thiên nhiên, dùng xông phòng hoặc xoa nhẹ ngoài da.', price: 150000, pointCost: 15 },
  { id: 'tui-chuom', emoji: '🧣', name: 'Túi chườm thảo dược (nóng/lạnh)', desc: 'Túi chườm thảo dược giữ nhiệt, hỗ trợ giảm mỏi cơ tại nhà.', price: 180000, pointCost: 18 },
];

const MEMBERSHIP_PLANS = [
  { id: '1m', label: '1 tháng', price: 199000, discount: 8, days: 30 },
  { id: '6m', label: '6 tháng', price: 999000, discount: 12, days: 182 },
  { id: '12m', label: '12 tháng', price: 1899000, discount: 16, days: 365 },
];

// Khu vực phục vụ (lọc kiểu Glow "theo thành phố / quận")
const AREAS = ['Gò Vấp', 'Bình Thạnh', 'Phú Nhuận', 'Quận 1', 'Quận 3', 'Quận 7', 'Thủ Đức', 'Tân Bình'];

// Kỹ thuật viên dưỡng sinh (seed) — hồ sơ chi tiết: giới tính, khu vực, giới thiệu, đánh giá mẫu
const TECHS = [
  { id: 1, name: 'Chị Nguyễn Thị Hồng', initials: 'NH', gender: 'nu', area: 'Gò Vấp', rating: 4.9, reviews: 128, distance: 1.2, years: 6, soonest: '14:30 hôm nay',
    certs: ['Chuyên dưỡng sinh · bấm huyệt', 'Được đào tạo bài bản'],
    bio: 'Hơn 6 năm làm dưỡng sinh tại nhà, chuyên bấm huyệt thư giãn cổ vai gáy và chăm sóc người lớn tuổi. Thao tác nhẹ nhàng, tận tâm.',
    sampleReviews: [ { by: 'Cô Lan, Q.7', stars: 5, text: 'Bấm huyệt nhẹ nhàng, ba tôi ngủ ngon hơn hẳn.' }, { by: 'Anh Huy', stars: 5, text: 'Đúng giờ, chuyên nghiệp, hết mỏi vai gáy.' } ] },
  { id: 2, name: 'Anh Trần Văn Phúc', initials: 'TP', gender: 'nam', area: 'Thủ Đức', rating: 4.8, reviews: 96, distance: 2.4, years: 4, soonest: '15:00 hôm nay',
    certs: ['Chuyên xoa bóp cổ – vai – gáy'],
    bio: 'Chuyên xoa bóp dưỡng sinh vùng cổ – vai – gáy cho dân văn phòng. Lực tay chắc, dứt điểm cơn mỏi.',
    sampleReviews: [ { by: 'Chị Thảo', stars: 5, text: 'Lực vừa phải, rất đã, sẽ đặt lại.' } ] },
  { id: 3, name: 'Chị Lê Thị Mai', initials: 'LM', gender: 'nu', area: 'Bình Thạnh', rating: 5.0, reviews: 203, distance: 0.8, years: 8, soonest: '13:45 hôm nay',
    certs: ['Chuyên dưỡng sinh · thư giãn', '8 năm kinh nghiệm'],
    bio: '8 năm kinh nghiệm dưỡng sinh & thư giãn, chuyên khách cần phục hồi nhẹ nhàng và giảm căng thẳng.',
    sampleReviews: [ { by: 'Cô Ba', stars: 5, text: 'Mai làm tâm lý, nhẹ nhàng, tôi rất an tâm.' }, { by: 'Chị Ngọc', stars: 5, text: 'Thư giãn tuyệt vời, ngủ ngon.' } ] },
  { id: 4, name: 'Anh Phạm Quốc Bảo', initials: 'PB', gender: 'nam', area: 'Quận 3', rating: 4.7, reviews: 64, distance: 3.1, years: 3, soonest: '16:15 hôm nay',
    certs: ['Chuyên bấm huyệt thư giãn'],
    bio: 'Chuyên bấm huyệt thư giãn, phù hợp khách trẻ hay căng thẳng, đau đầu do stress.',
    sampleReviews: [ { by: 'Anh Nam', stars: 5, text: 'Bấm huyệt xong nhẹ cả đầu.' } ] },
  { id: 5, name: 'Chị Đỗ Thu Hương', initials: 'ĐH', gender: 'nu', area: 'Phú Nhuận', rating: 4.9, reviews: 150, distance: 1.7, years: 7, soonest: '14:00 hôm nay',
    certs: ['Chuyên dưỡng sinh · bấm huyệt', 'Tận tâm, nhẹ nhàng'],
    bio: '7 năm trong nghề dưỡng sinh, được nhiều khách lớn tuổi tin tưởng nhờ sự nhẹ nhàng, chu đáo.',
    sampleReviews: [ { by: 'Bác Tư', stars: 5, text: 'Cháu Hương chu đáo, tôi khỏe hẳn ra.' } ] },
];

const STATUSES = [
  { label: 'Đã xác nhận', icon: '📋' },
  { label: 'KTV đang đến', icon: '🛵' },
  { label: 'Đang phục vụ', icon: '💆' },
  { label: 'Hoàn thành', icon: '✅' },
];

// Cấu hình nghiệp vụ (server giữ luật, client chỉ hiển thị)
const CONFIG = {
  pointRate: 10000, // 10.000đ = 1 điểm khi tích
  // Hệ số đổi điểm: chi phí đổi 1 sản phẩm = ceil(giá / redeemPerPoint).
  // redeemPerPoint = 1.000 => 1 điểm ≈ 1.000đ giá trị (mức hoàn ~ hợp lý, tránh "hoàn 100%").
  // Đặt = 10.000 để quay lại cơ chế cũ (đổi rẻ). Cửa hàng chỉnh 1 chỗ ở đây.
  redeemPerPoint: 1000,
  referralPct: 0.10, // hoa hồng giới thiệu 10%
  referralMinWithdraw: 100000, // rút hoa hồng tối thiểu
  ktvPlatformFee: 0.25, // nền tảng giữ 25% mỗi ca
  ktvMinBalance: 100000, // KTV cần giữ ví tối thiểu
  adminKey: process.env.ADMIN_KEY || 'rumtran-admin', // khóa đăng nhập trang quản trị (đổi khi lên thật)
  areas: AREAS,
  brand: {
    name: 'RUM TRẦN KHỎE ĐẸP',
    slogan: 'Hạnh phúc mỗi ngày',
    hotline: '0762419688',
    zalo: 'https://zalo.me/0762419688',
  },
};

module.exports = { TIERS, SERVICES, ADDONS, PRODUCTS, MEMBERSHIP_PLANS, TECHS, STATUSES, CONFIG };

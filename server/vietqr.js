/* VietQR (chuẩn EMVCo/NAPAS) — tạo mã QR "động" có sẵn số tiền + nội dung chuyển khoản.
   Gốc: mã QR tĩnh của tài khoản nhận tiền (Ngân hàng MB, TRAN THI HONG RUM).
   Giữ nguyên phần tài khoản nhận (tag 38), chỉ thêm số tiền (54) + nội dung (62/08) và tính lại CRC (63). */

// Phần thông tin tài khoản nhận, lấy nguyên từ mã QR gốc của chủ tài khoản
const MERCHANT_ACCOUNT = '0010A000000727012700069704220113VQRQACLFM81420208QRIBFTTA';
const BILL_REF = 'NPS6869'; // tag 62/01 có sẵn trong mã gốc

function tlv(tag, value) {
  return tag + String(value.length).padStart(2, '0') + value;
}

// CRC-16/CCITT-FALSE, theo chuẩn EMVCo
function crc16(str) {
  let crc = 0xffff;
  for (const byte of Buffer.from(str, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Nội dung CK: chỉ chữ không dấu, số, khoảng trắng, gạch ngang — tối đa 25 ký tự (giới hạn chung của các ngân hàng)
function cleanNote(note) {
  return String(note || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toUpperCase().replace(/[^A-Z0-9 -]/g, '').trim().slice(0, 25);
}

function buildPayload(amount, note) {
  const add = cleanNote(note);
  let p = tlv('00', '01') + tlv('01', '12') // 12 = mã động (dùng 1 lần cho 1 khoản)
    + tlv('38', MERCHANT_ACCOUNT)
    + tlv('53', '704') // VND
    + tlv('54', String(amount))
    + tlv('58', 'VN')
    + tlv('62', tlv('01', BILL_REF) + (add ? tlv('08', add) : ''));
  p += '6304';
  return p + crc16(p);
}

module.exports = { buildPayload, cleanNote, crc16 };

// _shared/payment.ts — cấu hình thanh toán QR (VietQR/MB) + auto-upgrade gói.
// deno-lint-ignore-file no-explicit-any

// Tài khoản nhận tiền (MB Bank — Phạm Quang Minh)
export const BANK_BIN = "970422";              // MB Bank
export const ACCOUNT_NO = "0853500666";
export const ACCOUNT_NAME = "PHAM QUANG MINH";

// Giá gói (VND). ĐANG Ở CHẾ ĐỘ TEST — đổi sang 199000 / 499000 khi go-live.
export const PLAN_PRICE: Record<string, number> = {
  pro: 2000,       // TEST (thật: 199000)
  premium: 5000,   // TEST (thật: 499000)
};

// Ví Beeny nạp đầy khi lên gói (trần theo gói)
export const PLAN_CAP: Record<string, number> = { free: 20, pro: 150, premium: 500 };

// Ảnh QR động VietQR (số tiền + nội dung CK cố định vào QR)
export function qrUrl(amount: number, memo: string): string {
  const p = new URLSearchParams({ amount: String(amount), addInfo: memo, accountName: ACCOUNT_NAME });
  return `https://img.vietqr.io/image/${BANK_BIN}-${ACCOUNT_NO}-compact2.png?${p.toString()}`;
}

// Chuẩn hoá nội dung CK để so khớp (ngân hàng hay viết hoa/bỏ dấu/bỏ khoảng trắng)
export function normalize(s: string): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Mã nội dung CK ngắn, duy nhất: WBE + 6 hex hoa
export function genMemo(): string {
  const hex = Array.from({ length: 6 }, () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join("");
  return `WBE${hex}`;
}

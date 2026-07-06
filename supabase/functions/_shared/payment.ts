// _shared/payment.ts — cấu hình thanh toán QR (VietQR/MB) + auto-upgrade gói.
// deno-lint-ignore-file no-explicit-any

// Tài khoản nhận tiền (MB Bank — Phạm Quang Minh)
export const BANK_BIN = "970422";              // MB Bank
export const ACCOUNT_NO = "0853500666";
export const ACCOUNT_NAME = "PHAM QUANG MINH";

// Giá gói (VND) — PRODUCTION. Tháng + Năm (năm = 10 tháng, tặng 2 tháng).
export const PLAN_PRICE: Record<string, number> = {
  pro: 199000,
  premium: 499000,
};
export const PLAN_PRICE_YEAR: Record<string, number> = {
  pro: 1990000,
  premium: 4990000,
};
/** Giá theo gói + kỳ hạn. */
export function planPrice(plan: string, period: string): number {
  return (period === "year" ? PLAN_PRICE_YEAR : PLAN_PRICE)[plan] ?? 0;
}
/** Số ngày cộng khi thanh toán theo kỳ. */
export function planDays(period: string): number {
  return period === "year" ? 365 : 30;
}

// Gói Beeny mua thêm theo ngày (hết hạn 24h, mỗi loại 1 lần/ngày). CHỈ cho user Pro/Premium.
export const BEENY_PACKS: Record<string, { price: number; beeny: number }> = {
  pack_5k:  { price: 5000,  beeny: 120 },
  pack_10k: { price: 10000, beeny: 250 },
  pack_20k: { price: 20000, beeny: 500 },
};

// Beeny/ngày theo gói — nạp đủ 1 ngày khi lên gói
export const PLAN_CAP: Record<string, number> = { free: 10, pro: 100, premium: 250 };

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

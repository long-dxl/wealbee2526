/** Sự kiện "ví Beeny vừa đổi" — phát sau mỗi lần chạy AI để sidebar/badge tự refresh. */
export const WALLET_REFRESH = "wallet:refresh";

export function notifyWalletChanged() {
  try { window.dispatchEvent(new Event(WALLET_REFRESH)); } catch { /* SSR-safe */ }
}

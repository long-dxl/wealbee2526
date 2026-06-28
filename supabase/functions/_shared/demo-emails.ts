// Mẫu email HTML cho luồng demo Wealbee.
import { esc } from "./demo-token.ts";

const BRAND = "#0849ac";

interface Lead {
  email: string;
  ho_ten: string;
  dien_thoai?: string;
  cong_ty?: string;
  loai_nha_dau_tu?: string;
  loi_nhan?: string;
}

const shell = (inner: string) => `<!doctype html><html lang="vi"><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.08);">
<div style="background:${BRAND};padding:22px 28px;color:#fff;font-weight:700;font-size:18px;">Wealbee</div>
<div style="padding:28px;color:#1a1a2e;font-size:15px;line-height:1.6;">${inner}</div>
<div style="padding:16px 28px;border-top:1px solid #eee;color:#98a2b3;font-size:12px;">© Wealbee · Nền tảng phân tích đầu tư bằng AI</div>
</div></body></html>`;

const row = (k: string, v: unknown) =>
  v ? `<tr><td style="padding:4px 12px 4px 0;color:#667085;white-space:nowrap;">${esc(k)}</td><td style="padding:4px 0;font-weight:600;">${esc(v)}</td></tr>` : "";

export function adminNotifyEmail(lead: Lead, approveUrl: string, rejectUrl: string): string {
  return shell(`
    <h2 style="margin:0 0 14px;font-size:20px;">🎉 Yêu cầu demo mới</h2>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:22px;">
      ${row("Họ tên", lead.ho_ten)}
      ${row("Email", lead.email)}
      ${row("Điện thoại", lead.dien_thoai)}
      ${row("Công ty", lead.cong_ty)}
      ${row("Loại NĐT", lead.loai_nha_dau_tu)}
      ${row("Lời nhắn", lead.loi_nhan)}
    </table>
    <div>
      <a href="${approveUrl}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:11px 26px;border-radius:10px;font-weight:700;margin-right:10px;">✓ Duyệt &amp; cấp tài khoản</a>
      <a href="${rejectUrl}" style="display:inline-block;background:#fff;color:#e0524d;text-decoration:none;padding:11px 26px;border-radius:10px;font-weight:700;border:1px solid #e0524d;">✕ Từ chối</a>
    </div>
    <p style="margin-top:18px;color:#98a2b3;font-size:12px;">Link có hiệu lực 7 ngày.</p>`);
}

export function customerAckEmail(lead: Lead): string {
  return shell(`
    <h2 style="margin:0 0 14px;font-size:20px;">Cảm ơn ${esc(lead.ho_ten)}!</h2>
    <p>Wealbee đã nhận được yêu cầu trải nghiệm demo của bạn. Đội ngũ sẽ xem xét và gửi thông tin tài khoản qua email này trong thời gian sớm nhất.</p>
    <p style="color:#667085;">Nếu cần hỗ trợ gấp, chỉ cần trả lời email này.</p>`);
}

export function credentialsEmail(lead: Lead, password: string, loginUrl: string): string {
  return shell(`
    <h2 style="margin:0 0 14px;font-size:20px;">🚀 Tài khoản demo đã sẵn sàng</h2>
    <p>Chào ${esc(lead.ho_ten)}, tài khoản trải nghiệm Wealbee của bạn đã được kích hoạt:</p>
    <div style="background:#f5f7fb;border-radius:12px;padding:18px 20px;margin:16px 0;font-size:15px;">
      <div style="margin-bottom:8px;">Email: <b>${esc(lead.email)}</b></div>
      <div>Mật khẩu tạm: <b style="font-family:monospace;font-size:16px;color:${BRAND};">${esc(password)}</b></div>
    </div>
    <p>Vì lý do bảo mật, bạn sẽ được yêu cầu <b>đổi mật khẩu</b> ngay trong lần đăng nhập đầu tiên.</p>
    <a href="${loginUrl}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:12px 30px;border-radius:10px;font-weight:700;margin-top:8px;">Đăng nhập ngay</a>
    <p style="margin-top:18px;color:#98a2b3;font-size:12px;">Tài khoản demo có hiệu lực trong thời gian dùng thử.</p>`);
}

import { Link, useSearchParams } from "react-router";
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { WealbeeLogo } from "../components/wealbee-logo";
import { useTheme } from "../use-theme";

type Tone = "ok" | "warn" | "err" | "info";

const MAP: Record<string, { title: string; body: (email: string) => string; tone: Tone }> = {
  approved: { title: "Đã duyệt & gửi tài khoản!", tone: "ok",
    body: (e) => `Email chứa thông tin đăng nhập đã được gửi tới ${e || "khách hàng"}.` },
  already: { title: "Yêu cầu đã được duyệt trước đó", tone: "info",
    body: (e) => `Tài khoản cho ${e || "khách hàng"} đã được kích hoạt. Không có email mới nào được gửi lại.` },
  rejected: { title: "Đã từ chối yêu cầu", tone: "warn",
    body: (e) => `Yêu cầu demo của ${e || "khách hàng"} đã được đánh dấu từ chối.` },
  exists: { title: "Email này đã có tài khoản", tone: "warn",
    body: (e) => `${e || "Email"} đã tồn tại trong hệ thống. Nếu cần cấp lại mật khẩu, hãy dùng chức năng "Quên mật khẩu".` },
  invalid: { title: "Link không hợp lệ hoặc đã hết hạn", tone: "err",
    body: () => "Vui lòng kiểm tra lại email thông báo hoặc liên hệ kỹ thuật." },
  error: { title: "Có lỗi xảy ra", tone: "err",
    body: () => "Không thực hiện được yêu cầu. Vui lòng thử lại." },
};

const TONE: Record<Tone, { color: string; Icon: typeof CheckCircle2 }> = {
  ok: { color: "#0849ac", Icon: CheckCircle2 },
  info: { color: "#4d8fe8", Icon: Info },
  warn: { color: "#b8860b", Icon: AlertTriangle },
  err: { color: "#e0524d", Icon: XCircle },
};

export function DemoResultPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [params] = useSearchParams();
  const status = params.get("status") ?? "error";
  const email = params.get("email") ?? "";
  const info = MAP[status] ?? MAP.error;
  const { color, Icon } = TONE[info.tone];

  const card = isDark ? "#0e0e16" : "#ffffff";
  const border = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const text = isDark ? "#ffffff" : "#1a1a2e";
  const muted = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)";

  return (
    <div className={isDark ? "wb-dark" : "wb-light"} style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--wb-canvas)", fontFamily: "Montserrat, sans-serif" }}>
      <header>
        <div className="mx-auto flex h-16 max-w-[1200px] items-center px-5">
          <Link to="/" className="flex items-center"><WealbeeLogo size={30} /></Link>
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[460px] text-center" style={{ background: card, border: `1px solid ${border}`, borderRadius: 18, padding: 40, boxShadow: isDark ? "0 24px 80px rgba(0,0,0,0.4)" : "0 24px 80px rgba(0,0,0,0.08)" }}>
          <Icon size={56} style={{ color, margin: "0 auto 18px" }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: text, marginBottom: 12 }}>{info.title}</h1>
          <p style={{ fontSize: 15, color: muted, lineHeight: 1.6 }}>
            {info.body(email ? `<${email}>`.replace(/[<>]/g, "") : "")}
          </p>
          <Link to="/" className="mt-8 inline-flex items-center justify-center rounded-xl px-7 py-3 text-white transition-all hover:opacity-90" style={{ fontWeight: 700, fontSize: 14, background: "var(--wb-primary)", textDecoration: "none" }}>
            Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}

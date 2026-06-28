import {
  Home, Inbox, Bot, Briefcase, PlusCircle, LayoutTemplate, Wrench, BookOpen,
  Settings, Search, RefreshCw, TrendingUp, Send,
} from "lucide-react";
import { WealbeeMark } from "./wealbee-logo";

/* ── tiny sparkline ── */
function Spark({ up = true }: { up?: boolean }) {
  const color = up ? "#34C759" : "#FF3B30";
  const d = up
    ? "M0 26 L14 22 L28 24 L42 16 L56 18 L70 8 L84 4"
    : "M0 6 L14 10 L28 8 L42 16 L56 14 L70 22 L84 26";
  return (
    <svg width="84" height="30" viewBox="0 0 84 30" fill="none" className="overflow-visible">
      <path d={`${d} L84 30 L0 30 Z`} fill={color} fillOpacity="0.12" />
      <path d={d} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV = [
  { icon: Home, label: "Home", active: true },
  { icon: Inbox, label: "Inbox", badge: 3 },
  { icon: Bot, label: "My Agents" },
  { icon: Briefcase, label: "Portfolio" },
];
const NAV2 = [
  { icon: PlusCircle, label: "Create Agent" },
  { icon: LayoutTemplate, label: "Templates" },
  { icon: Wrench, label: "Tool Library" },
  { icon: BookOpen, label: "Knowledge Base" },
];

const INDICES = [
  { name: "VN-INDEX (HOSE)", value: "1.862,47", chg: "+17,93 (+0,97%)", up: true },
  { name: "HNX-INDEX", value: "306,84", chg: "+2,66 (+0,87%)", up: true },
  { name: "UPCOM", value: "124,35", chg: "+0,58 (+0,47%)", up: true },
];

const CHAT = [
  "Hôm nay có gì đáng chú ý?",
  "Tin tức nào ảnh hưởng danh mục tôi?",
  "Tôi nên làm gì sáng nay?",
];

export function DashboardMock() {
  return (
    <div
      className="w-full overflow-hidden rounded-[14px]"
      style={{
        background: "var(--wb-mock-window)",
        border: "1px solid var(--wb-mock-border)",
        display: "grid",
        gridTemplateColumns: "164px 1fr 232px",
        height: 440,
        fontFamily: "Montserrat, sans-serif",
        color: "var(--wb-mock-text)",
      }}
    >
      {/* ─── Sidebar ─── */}
      <aside className="flex flex-col border-r" style={{ borderColor: "var(--wb-mock-divider)", background: "var(--wb-mock-panel)" }}>
        <div className="flex items-center gap-2 px-4 py-3.5">
          <WealbeeMark size={20} color="#4D8FE8" />
          <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 13, color: "#4D8FE8" }}>Wealbee</span>
        </div>
        <nav className="mt-1 flex flex-col gap-0.5 px-2">
          {NAV.map((n) => (
            <div
              key={n.label}
              className="flex items-center justify-between rounded-md px-2.5 py-1.5"
              style={{ background: n.active ? "var(--wb-mock-active)" : "transparent" }}
            >
              <span className="flex items-center gap-2" style={{ fontSize: 11.5, color: n.active ? "#fff" : "var(--wb-mock-muted)" }}>
                <n.icon size={13} style={{ color: n.active ? "#4D8FE8" : "var(--wb-mock-dim)" }} />
                {n.label}
              </span>
              {n.badge && (
                <span className="flex size-4 items-center justify-center rounded-full" style={{ background: "#FF3B30", fontSize: 9, fontWeight: 700, color: "#fff" }}>{n.badge}</span>
              )}
            </div>
          ))}
        </nav>
        <div className="mx-3 my-2.5 h-px" style={{ background: "var(--wb-mock-divider)" }} />
        <div className="px-3 pb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, letterSpacing: "0.08em", color: "var(--wb-mock-faint)" }}>
          AGENT STUDIO
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV2.map((n) => (
            <div key={n.label} className="flex items-center gap-2 rounded-md px-2.5 py-1.5" style={{ fontSize: 11.5, color: "var(--wb-mock-muted)" }}>
              <n.icon size={13} style={{ color: "var(--wb-mock-dim)" }} />
              {n.label}
            </div>
          ))}
        </nav>
        <div className="mt-auto px-3 py-3">
          <div className="mb-2 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--wb-mock-border)" }}>
            <div className="h-full rounded-full" style={{ width: "67%", background: "#4D8FE8" }} />
          </div>
          <div className="flex items-center justify-between" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "var(--wb-mock-dim)" }}>
            <span><Settings size={11} className="inline mr-1" />Settings</span>
            <span>67/100</span>
          </div>
        </div>
      </aside>

      {/* ─── Center ─── */}
      <main className="overflow-hidden">
        {/* top bar */}
        <div className="flex items-center gap-3 border-b px-5 py-3" style={{ borderColor: "var(--wb-mock-divider)" }}>
          <div className="flex flex-1 items-center gap-2 rounded-md px-3 py-1.5" style={{ background: "var(--wb-mock-inset)" }}>
            <Search size={12} style={{ color: "var(--wb-mock-dim)" }} />
            <span style={{ fontSize: 11, color: "var(--wb-mock-faint)" }}>Tìm cổ phiếu, chỉ số...</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5" style={{ borderColor: "var(--wb-mock-line)", fontSize: 11, color: "var(--wb-mock-muted)" }}>
            <RefreshCw size={11} /> Làm mới
          </div>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <div>
            <h3 style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 22, color: "var(--wb-mock-text)" }}>Chào An.</h3>
            <p style={{ fontSize: 10.5, color: "var(--wb-mock-dim)" }}>Thứ Năm, 18/06 · 14:35</p>
          </div>

          {/* highlights */}
          <div className="rounded-[10px] border p-3.5" style={{ borderColor: "var(--wb-mock-border)", background: "var(--wb-mock-card)" }}>
            <div className="mb-2.5 flex items-center gap-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.06em", color: "#4D8FE8" }}>
              ✦ ĐIỂM NỔI BẬT HÔM NAY
            </div>
            <ul className="space-y-2" style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--wb-mock-muted)" }}>
              <li className="flex gap-1.5">
                <span style={{ color: "#4D8FE8" }}>•</span>
                <span>VN-Index phục hồi <span style={{ color: "#34C759" }}>+0,97%</span>, lên 1.862,4 sau 6 phiên giảm liên tiếp - Ngân hàng STB, ACB, GMD dẫn dắt <span style={{ color: "#FF6B35", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}>[vietstock]</span></span>
              </li>
              <li className="flex gap-1.5">
                <span style={{ color: "#4D8FE8" }}>•</span>
                <span>Khối ngoại bán ròng <span style={{ color: "#FF3B30" }}>−4.922 tỷ</span> tuần đáng tháng 6 <span style={{ color: "#FF6B35", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}>[cafef]</span></span>
              </li>
              <li className="flex gap-1.5">
                <span style={{ color: "#4D8FE8" }}>•</span>
                <span>World Cup 2026 khai mạc 11/6 - Thanh khoản HOSE 16.420 tỷ thấp nhất 4 tháng</span>
              </li>
            </ul>
          </div>

          {/* watch */}
          <div className="rounded-[10px] border p-3.5" style={{ borderColor: "var(--wb-mock-border)" }}>
            <div className="mb-2 flex items-center gap-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.06em", color: "#FFD60A" }}>
              ⚑ CẦN THEO DÕI
            </div>
            <p style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--wb-mock-muted)" }}>
              <strong style={{ color: "var(--wb-mock-text)" }}>VHM</strong> <span style={{ color: "#FF3B30" }}>−2,64%</span> test ngưỡng hỗ trợ 95.000đ, tỷ trọng danh mục bạn <span style={{ color: "#34C759" }}>29%</span> → <span style={{ color: "#4D8FE8" }}>xem phân tích →</span>
            </p>
          </div>

          {/* indices */}
          <div>
            <div className="mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: "0.08em", color: "var(--wb-mock-faint)" }}>CHỈ SỐ THỊ TRƯỜNG</div>
            <div className="grid grid-cols-3 gap-2.5">
              {INDICES.map((idx) => (
                <div key={idx.name} className="rounded-[10px] border p-3" style={{ borderColor: "var(--wb-mock-border)", background: "var(--wb-mock-card)" }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, color: "var(--wb-mock-dim)" }}>{idx.name}</div>
                  <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 17, color: "var(--wb-mock-text)", marginTop: 2 }}>{idx.value}</div>
                  <div style={{ fontSize: 9.5, color: "#34C759", marginBottom: 4 }}>{idx.chg}</div>
                  <Spark up={idx.up} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ─── Action Hub ─── */}
      <aside className="flex flex-col border-l" style={{ borderColor: "var(--wb-mock-divider)", background: "var(--wb-mock-panel)" }}>
        <div className="flex items-center gap-2 border-b px-4 py-3.5" style={{ borderColor: "var(--wb-mock-divider)" }}>
          <TrendingUp size={13} style={{ color: "#4D8FE8" }} />
          <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 12, color: "var(--wb-mock-text)" }}>Action Hub</span>
        </div>

        <div className="flex-1 space-y-2.5 px-3.5 py-4">
          <div className="rounded-[10px] border border-dashed p-3 text-center" style={{ borderColor: "rgba(77,143,232,0.3)", background: "rgba(8,73,172,0.06)" }}>
            <div style={{ fontSize: 10.5, color: "#4D8FE8" }}>Kéo card vào đây</div>
            <div style={{ fontSize: 9, color: "var(--wb-mock-faint)", marginTop: 2 }}>để AI phân tích có ngữ cảnh</div>
          </div>

          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, color: "var(--wb-mock-faint)", paddingTop: 4 }}>GỢI Ý</div>
          {CHAT.map((c) => (
            <div key={c} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--wb-mock-border)", fontSize: 11, color: "var(--wb-mock-muted)" }}>
              {c}
            </div>
          ))}
        </div>

        <div className="px-3.5 pb-4">
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--wb-mock-line)" }}>
            <span style={{ flex: 1, fontSize: 10.5, color: "var(--wb-mock-faint)" }}>Hỏi bất cứ điều gì...</span>
            <div className="flex size-6 items-center justify-center rounded-md" style={{ background: "#0849AC" }}>
              <Send size={11} style={{ color: "#fff" }} />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

import { useParams, useNavigate, useOutletContext } from "react-router";
import { ArrowLeft, Check, ChevronRight, Sparkles } from "lucide-react";
import { tools, catStyle } from "./tools-new";
import type { AppOutletContext } from "./page-wrappers";

const FONT = "'Montserrat', system-ui, sans-serif";

export function ToolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDark } = useOutletContext<AppOutletContext>();

  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const fgSubtle = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const fgDisabled = isDark ? "rgba(240,242,255,0.30)" : "rgba(26,26,46,0.30)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const cardBg = isDark ? "#131824" : "#fff";
  const bgApp = isDark ? "#0B0D18" : undefined;
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.08)";

  const tool = tools.find((t) => t.id === id);

  if (!tool) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: FONT, background: bgApp }}>
        <button onClick={() => navigate("/app/tools")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: fgMuted, fontSize: 13, fontFamily: FONT, marginBottom: 20 }}>
          <ArrowLeft size={15} strokeWidth={1.5} /> Công cụ
        </button>
        <p style={{ fontSize: 14, color: fgSubtle }}>Không tìm thấy công cụ này.</p>
      </div>
    );
  }

  const Icon = tool.icon;
  const cs = catStyle[tool.category];
  const unavail = tool.available === false;
  const related = tools.filter((t) => t.category === tool.category && t.id !== tool.id);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: FONT, background: bgApp }}>
      <button onClick={() => navigate("/app/tools")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: fgMuted, fontSize: 13, fontFamily: FONT, marginBottom: 20 }}>
        <ArrowLeft size={15} strokeWidth={1.5} /> Công cụ
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, flexShrink: 0,
          background: cs.bg, display: "flex", alignItems: "center", justifyContent: "center",
          opacity: unavail ? 0.5 : 1, filter: unavail ? "grayscale(0.6)" : "none",
        }}>
          <Icon size={26} color={cs.text} strokeWidth={1.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: fg, margin: "0 0 6px" }}>{tool.name}</h1>
          <p style={{ margin: "0 0 8px", fontSize: 14, color: fgMuted, lineHeight: 1.5 }}>{tool.oneliner}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: cs.bg, color: cs.text, letterSpacing: "0.02em" }}>
              {tool.category}
            </span>
            {unavail ? (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)", color: fgSubtle }}>
                Sắp ra mắt
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: fgSubtle }}>
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={9} color="#fff" strokeWidth={3} />
                </span>
                Wealbee · Tích hợp chính thức
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Trạng thái sắp ra mắt */}
      {unavail && (
        <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(26,26,46,0.04)", border: `0.5px solid ${divider}`, borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: fgMuted, lineHeight: 1.6 }}>
          Công cụ này đang được phát triển và <strong style={{ color: fg }}>chưa thể dùng cho Agent</strong>. Bạn vẫn có thể xem trước công cụ sẽ làm gì bên dưới, chúng tôi sẽ thông báo khi sẵn sàng.
        </div>
      )}

      {/* Mô tả chi tiết */}
      <div style={{ background: cardBg, border: `0.5px solid ${divider}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          Công cụ này làm gì
        </div>
        <p style={{ margin: 0, fontSize: 14, color: fg, lineHeight: 1.7 }}>{tool.longDescription}</p>

        {tool.breakdown && tool.breakdown.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `0.5px solid ${divider}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              Bên trong gồm có
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {tool.breakdown.map((b) => (
                <div key={b.title} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", background: cs.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    <Check size={11} color={cs.text} strokeWidth={3} />
                  </span>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: fg, marginBottom: 2 }}>{b.title}</div>
                    <div style={{ fontSize: 13, color: fgMuted, lineHeight: 1.5 }}>{b.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      {!unavail && tool.backendToolId && (
        <button
          onClick={() => navigate("/app/agent-studio", { state: { presetToolId: tool.backendToolId } })}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
            background: brand, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: FONT, marginBottom: 24,
          }}
        >
          <Sparkles size={16} strokeWidth={1.5} /> Tạo Agent dùng công cụ này
        </button>
      )}

      {/* Công cụ liên quan */}
      {related.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Công cụ liên quan · {tool.category}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {related.map((t) => {
              const rcs = catStyle[t.category];
              const rUnavail = t.available === false;
              return (
                <button
                  key={t.id}
                  onClick={() => navigate(`/app/tools/${t.id}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                    background: cardBg, border: `0.5px solid ${divider}`, borderRadius: 12, padding: "12px 14px",
                    cursor: "pointer", fontFamily: FONT, opacity: rUnavail ? 0.55 : 1,
                  }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: rcs.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, filter: rUnavail ? "grayscale(0.6)" : "none" }}>
                    <t.icon size={16} color={rcs.text} strokeWidth={1.5} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: fg }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: fgSubtle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.oneliner}</div>
                  </div>
                  <ChevronRight size={15} strokeWidth={1.5} color={fgDisabled} style={{ flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

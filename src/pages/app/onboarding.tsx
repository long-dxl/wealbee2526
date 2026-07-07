import { useState } from "react";
import { Newspaper, Wallet, Search, Sparkles, Plus, X } from "lucide-react";
import { WealbeeLogo } from "../../components/WealbeeIcon";

interface OnboardingProps {
  onComplete: () => void;
}

type Goal = "market" | "portfolio" | "research";
type Step = 1 | 2 | 3;

const popularSymbols = ["VCB", "HPG", "FPT", "VIC", "TCB", "ACB", "MWG", "VNM", "MSN", "STB"];

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>(1);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [portfolio, setPortfolio] = useState<string[]>([]);
  const [symbolInput, setSymbolInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [email, setEmail] = useState("");
  const [useDemo, setUseDemo] = useState(false);

  const goalOptions: { id: Goal; label: string; desc: string; icon: React.ElementType }[] = [
    { id: "market", label: "Theo dõi tin tức thị trường", desc: "Cập nhật hàng ngày, tóm tắt nhanh", icon: Newspaper },
    { id: "portfolio", label: "Quản lý và phân tích danh mục", desc: "Theo dõi P&L, nhận alert", icon: Wallet },
    { id: "research", label: "Nghiên cứu cổ phiếu cụ thể", desc: "Phân tích sâu từng mã", icon: Search },
  ];

  const addSymbol = (sym: string) => {
    const cleaned = sym.toUpperCase().trim();
    if (cleaned && !portfolio.includes(cleaned) && portfolio.length < 10) {
      setPortfolio((prev) => [...prev, cleaned]);
    }
    setSymbolInput("");
    setShowDropdown(false);
  };

  const removeSymbol = (sym: string) => {
    setPortfolio((prev) => prev.filter((s) => s !== sym));
  };

  const filteredSuggestions = popularSymbols.filter(
    (s) => s.includes(symbolInput.toUpperCase()) && !portfolio.includes(s)
  );

  const handleDemoPortfolio = () => {
    setPortfolio(["VCB", "HPG", "FPT", "MWG", "VNM"]);
    setUseDemo(true);
  };

  const handleComplete = () => {
    onComplete();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#fff",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "'Montserrat', system-ui, sans-serif", zIndex: 200,
      }}
    >
      {/* Skip */}
      <button
        onClick={onComplete}
        style={{
          position: "absolute", top: 24, right: 24, background: "none", border: "none",
          color: "#3D3D52", fontSize: 14, cursor: "pointer",
          fontFamily: "'Montserrat', system-ui, sans-serif",
        }}
      >
        Bỏ qua
      </button>

      {/* Logo */}
      <div style={{ marginBottom: 32 }}>
        <WealbeeLogo />
      </div>

      {/* Progress dots */}
      <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i === step ? "#0849AC" : i < step ? "#34C759" : "rgba(26,26,46,0.15)",
              transition: "background 300ms ease",
            }}
          />
        ))}
      </div>

      <div style={{ width: "100%", maxWidth: 480, padding: "0 24px" }}>
        {/* Step 1: Account */}
        {step === 1 && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1A1A2E", margin: "0 0 8px", textAlign: "center" }}>
              Bắt đầu miễn phí
            </h1>
            <p style={{ fontSize: 15, color: "#3D3D52", textAlign: "center", margin: "0 0 32px" }}>
              Tạo tài khoản để truy cập đội ngũ phân tích AI cá nhân
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "G  Tiếp tục với Google", bg: "#fff", border: "0.5px solid rgba(26,26,46,0.20)", color: "#1A1A2E" },
                { label: "  Tiếp tục với Apple", bg: "#1A1A2E", border: "none", color: "#fff" },
              ].map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => setStep(2)}
                  style={{
                    padding: "14px 20px", borderRadius: 12, border: btn.border, background: btn.bg,
                    color: btn.color, fontSize: 15, fontWeight: 600, cursor: "pointer", width: "100%",
                    fontFamily: "'Montserrat', system-ui, sans-serif",
                    transition: "opacity 150ms ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                >
                  {btn.label}
                </button>
              ))}

              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0" }}>
                <div style={{ flex: 1, height: "0.5px", background: "rgba(26,26,46,0.12)" }} />
                <span style={{ fontSize: 13, color: "#3D3D52" }}>hoặc dùng email</span>
                <div style={{ flex: 1, height: "0.5px", background: "rgba(26,26,46,0.12)" }} />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  style={{
                    flex: 1, padding: "12px 16px", borderRadius: 12,
                    border: "0.5px solid rgba(8,73,172,0.20)", background: "#F5F5F7",
                    fontSize: 14, color: "#1A1A2E", outline: "none",
                    fontFamily: "'Montserrat', system-ui, sans-serif",
                  }}
                />
                <button
                  onClick={() => setStep(2)}
                  style={{
                    padding: "12px 20px", borderRadius: 12, border: "none", background: "#0849AC",
                    color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'Montserrat', system-ui, sans-serif",
                  }}
                >
                  Tiếp →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Goal */}
        {step === 2 && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1A1A2E", margin: "0 0 8px", textAlign: "center" }}>
              Bạn chủ yếu muốn làm gì?
            </h1>
            <p style={{ fontSize: 14, color: "#3D3D52", textAlign: "center", margin: "0 0 24px" }}>
              Wealbee sẽ cấu hình phù hợp với mục tiêu của bạn
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {goalOptions.map((opt) => {
                const Icon = opt.icon;
                const selected = goal === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setGoal(opt.id);
                      setTimeout(() => setStep(3), 300);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 14, padding: 18, borderRadius: 14,
                      border: selected ? "1.5px solid #0849AC" : "0.5px solid rgba(8,73,172,0.15)",
                      background: selected ? "rgba(8,73,172,0.04)" : "#fff",
                      cursor: "pointer", textAlign: "left", width: "100%",
                      transition: "all 150ms ease",
                      fontFamily: "'Montserrat', system-ui, sans-serif",
                    }}
                  >
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                      background: selected ? "rgba(8,73,172,0.10)" : "#F5F5F7",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={22} color={selected ? "#0849AC" : "#3D3D52"} strokeWidth={1.5} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E", marginBottom: 2 }}>{opt.label}</div>
                      <div style={{ fontSize: 13, color: "#3D3D52" }}>{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Portfolio */}
        {step === 3 && (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: "0 0 8px", textAlign: "center" }}>
              Thêm danh mục để AI phân tích
            </h1>
            <p style={{ fontSize: 14, color: "#3D3D52", textAlign: "center", margin: "0 0 20px" }}>
              Không bắt buộc · có thể thêm sau trong app
            </p>

            {/* Demo option */}
            <button
              onClick={handleDemoPortfolio}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: 16, borderRadius: 14,
                border: useDemo ? "1.5px solid #0849AC" : "0.5px dashed rgba(8,73,172,0.30)",
                background: useDemo ? "rgba(8,73,172,0.04)" : "#fff",
                cursor: "pointer", width: "100%", textAlign: "left", marginBottom: 12,
                fontFamily: "'Montserrat', system-ui, sans-serif",
              }}
            >
              <Sparkles size={20} color="#0849AC" strokeWidth={1.5} style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0849AC", marginBottom: 2 }}>
                  Dùng demo (5 mã VN30)  <span style={{ fontSize: 11, background: "#0849AC", color: "#fff", borderRadius: 6, padding: "2px 6px", marginLeft: 6 }}>Gợi ý</span>
                </div>
                <div style={{ fontSize: 12, color: "#3D3D52" }}>Bắt đầu ngay · đổi sau</div>
              </div>
            </button>

            {/* Manual add */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 16, border: "0.5px solid rgba(8,73,172,0.15)", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Plus size={16} color="#0849AC" strokeWidth={1.5} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#0849AC" }}>Thêm mã cổ phiếu</span>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  value={symbolInput}
                  onChange={(e) => {
                    setSymbolInput(e.target.value);
                    setShowDropdown(e.target.value.length > 0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && symbolInput) addSymbol(symbolInput);
                  }}
                  placeholder="Tìm mã... VD: VCB, HPG"
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10,
                    border: "0.5px solid rgba(8,73,172,0.20)", background: "#F5F5F7",
                    fontSize: 14, color: "#1A1A2E", outline: "none", boxSizing: "border-box",
                    fontFamily: "'Montserrat', system-ui, sans-serif",
                  }}
                />
                {showDropdown && filteredSuggestions.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, background: "#fff",
                    borderRadius: 10, border: "0.5px solid rgba(8,73,172,0.20)",
                    boxShadow: "0 4px 16px rgba(8,73,172,0.12)", zIndex: 10, overflow: "hidden",
                  }}>
                    {filteredSuggestions.slice(0, 5).map((sym) => (
                      <div
                        key={sym}
                        onClick={() => addSymbol(sym)}
                        style={{
                          padding: "10px 14px", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#1A1A2E",
                          transition: "background 80ms ease",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#E8F0FE"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        ● {sym}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Portfolio chips */}
              {portfolio.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                  {portfolio.map((sym) => (
                    <span
                      key={sym}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: "rgba(8,73,172,0.08)", color: "#0849AC",
                        padding: "4px 10px 4px 12px", borderRadius: 99, fontSize: 13, fontWeight: 700,
                      }}
                    >
                      {sym}
                      <button
                        onClick={() => removeSymbol(sym)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "rgba(8,73,172,0.60)" }}
                      >
                        <X size={12} strokeWidth={2} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleComplete}
              style={{
                width: "100%", padding: "14px 20px", borderRadius: 12, border: "none",
                background: "#0849AC", color: "#fff", fontSize: 15, fontWeight: 700,
                cursor: "pointer", fontFamily: "'Montserrat', system-ui, sans-serif",
                transition: "background 150ms ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#032D6B"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#0849AC"; }}
            >
              Xong, vào app →
            </button>
          </div>
        )}
      </div>

      {/* Legal */}
      <p style={{ position: "absolute", bottom: 16, fontSize: 11, color: "rgba(26,26,46,0.30)", textAlign: "center", padding: "0 24px" }}>
        Wealbee cung cấp thông tin phân tích · không phải tư vấn đầu tư theo Luật Chứng khoán 2019
      </p>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router";
import { Navbar } from "../../components/landing/Navbar";
import { Footer } from "../../components/landing/Footer";
import svgPaths from "../../imports/svg-bgfixn5yhu";
import { joinProWaitlist } from "../../lib/landing/subscribe";

function CheckIcon({ color = "#2563EB" }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
      <g clipPath="url(#check-pricing)">
        <path d={svgPaths.p309ef400} fill={color} />
      </g>
      <defs>
        <clipPath id="check-pricing">
          <rect width="18" height="18" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

function FreePlan() {
  const navigate = useNavigate();
  return (
    <div className="bg-white border border-[#e8f2ff] rounded-2xl p-8 flex flex-col shadow-[0px_8px_40px_-12px_rgba(147,51,234,0.15)] relative">
      <h3 className="text-[24px] font-bold text-[#111827] font-['Montserrat',sans-serif] mb-1">Free</h3>
      <p className="text-[14px] text-[#6b7280] font-['Montserrat',sans-serif] mb-6">Làm quen tính năng cơ bản</p>
      <div className="flex items-baseline gap-1 mb-8">
        <span className="text-[40px] font-bold text-[#111827] font-['Montserrat',sans-serif] leading-[48px]">0đ</span>
        <span className="text-[18px] text-[#6b7280] font-['Montserrat',sans-serif]">/Tháng</span>
      </div>

      <div className="space-y-5 mb-auto">
        <div className="flex items-center gap-3">
          <CheckIcon color="#2563EB" />
          <span className="text-[16px] text-[#374151] font-['Montserrat',sans-serif]">Tin tức tác động danh mục hàng ngày</span>
        </div>
        <div className="flex items-center gap-3">
          <CheckIcon color="#2563EB" />
          <span className="text-[16px] text-[#374151] font-['Montserrat',sans-serif]">Theo dõi 3 cổ phiếu</span>
        </div>
        <div className="flex items-center gap-3">
          <CheckIcon color="#2563EB" />
          <span className="text-[16px] text-[#374151] font-['Montserrat',sans-serif]">Thông báo qua Email</span>
        </div>
      </div>

      <button
        onClick={() => navigate("/start")}
        className="mt-10 w-full bg-[#f3f4f6] text-[#111827] py-4 rounded-xl text-[16px] font-semibold font-['Montserrat',sans-serif] hover:bg-[#e5e7eb] transition-colors"
      >
        Bắt đầu ngay
      </button>
    </div>
  );
}

function ProPlan() {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [joined, setJoined] = useState(false);

  const handleJoinWaitlist = async () => {
    setErrorMsg("");
    setLoading(true);
    const result = await joinProWaitlist(email);
    setLoading(false);
    if (result.success) {
      setJoined(true);
    } else {
      setErrorMsg(result.message);
    }
  };

  return (
    <div
      className="rounded-2xl p-8 flex flex-col relative overflow-hidden shadow-[0px_20px_25px_-5px_rgba(92,136,246,0.3),0px_8px_10px_-6px_rgba(59,130,246,0.2)]"
      style={{ backgroundImage: "linear-gradient(132deg, rgb(8, 73, 172) 0%, rgb(37, 99, 235) 50%, rgb(8, 73, 172) 100%)" }}
    >
      {/* Decorative blurs */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-[rgba(255,255,255,0.1)] blur-[32px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-[rgba(132,166,252,0.1)] blur-[20px] rounded-full pointer-events-none" />

      {/* Popular badge */}
      <div className="absolute top-6 right-6">
        <div className="backdrop-blur-sm bg-[rgba(255,255,255,0.2)] rounded-full px-3 py-1 flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <g clipPath="url(#star-clip)">
              <path d={svgPaths.p16463f40} fill="#FCD34D" />
            </g>
            <defs>
              <clipPath id="star-clip">
                <rect width="12" height="12" fill="white" />
              </clipPath>
            </defs>
          </svg>
          <span className="text-[12px] font-semibold text-white font-['Montserrat',sans-serif]">Popular</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <g clipPath="url(#bolt-clip)">
            <path d={svgPaths.p35ec0300} fill="#FCD34D" />
          </g>
          <defs>
            <clipPath id="bolt-clip">
              <rect width="16" height="16" fill="white" />
            </clipPath>
          </defs>
        </svg>
        <h3 className="text-[24px] font-bold text-white font-['Montserrat',sans-serif]">Pro</h3>
      </div>
      <p className="text-[14px] text-[#e8f2ff] font-['Montserrat',sans-serif] mb-6">Mở khoá tất cả tiềm năng</p>
      <div className="flex items-baseline gap-1 mb-8">
        <span className="text-[40px] font-bold text-white font-['Montserrat',sans-serif] leading-[48px]">50.000đ</span>
        <span className="text-[18px] text-[#e8f2ff] font-['Montserrat',sans-serif]">/Tháng</span>
      </div>

      <div className="space-y-5 mb-auto">
        <div className="flex items-center gap-3">
          <CheckIcon color="#E8F2FF" />
          <span className="text-[16px] text-[rgba(255,255,255,0.9)] font-['Montserrat',sans-serif]">Tất cả tính năng miễn phí</span>
        </div>
        <div className="flex items-center gap-3">
          <CheckIcon color="#E8F2FF" />
          <span className="text-[16px] text-[rgba(255,255,255,0.9)] font-['Montserrat',sans-serif]">Tạo Prompt phân tích với AI</span>
        </div>
        <div className="flex items-center gap-3">
          <CheckIcon color="#E8F2FF" />
          <span className="text-[16px] text-[rgba(255,255,255,0.9)] font-['Montserrat',sans-serif]">Theo dõi không giới hạn</span>
        </div>
        <div className="flex items-center gap-3">
          <CheckIcon color="#E8F2FF" />
          <span className="text-[16px] text-[rgba(255,255,255,0.9)] font-['Montserrat',sans-serif]">Thay đổi tần suất nhận thông báo</span>
        </div>
      </div>

      {/* CTA area */}
      <div className="mt-10 relative z-10">
        {joined ? (
          /* Success state */
          <div className="w-full bg-[rgba(255,255,255,0.15)] backdrop-blur-sm rounded-xl px-5 py-4 flex items-center gap-3 border border-[rgba(255,255,255,0.25)]">
            <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.2)] flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8L6.5 11.5L13 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-[14px] font-semibold text-white leading-[1.3]">Đã đăng ký thành công!</p>
              <p className="text-[12px] text-[#e8f2ff] mt-0.5">Chúng tôi sẽ thông báo khi Pro mở.</p>
            </div>
          </div>
        ) : !showForm ? (
          /* Initial button */
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-white text-[#0849ac] py-5 rounded-xl text-[16px] font-semibold font-['Montserrat',sans-serif] hover:bg-[#f0f4ff] transition-colors"
          >
            Liên hệ
          </button>
        ) : (
          /* Inline waitlist form */
          <div className="space-y-3">
            <p className="text-[13px] text-[#e8f2ff] text-center">
              Để lại email — chúng tôi thông báo ngay khi Pro mở.
            </p>
            <input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrorMsg(""); }}
              onKeyDown={(e) => e.key === "Enter" && !loading && email && handleJoinWaitlist()}
              className="w-full px-4 py-3 rounded-xl text-[15px] text-[#111827] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-white bg-white"
              autoFocus
            />
            {errorMsg && (
              <p className="text-[12px] text-[#fca5a5] text-center">{errorMsg}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowForm(false); setEmail(""); setErrorMsg(""); }}
                className="flex-1 py-3 rounded-xl text-[14px] font-semibold text-white bg-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.25)] transition-colors border border-[rgba(255,255,255,0.2)]"
              >
                Huỷ
              </button>
              <button
                disabled={!email || loading}
                onClick={handleJoinWaitlist}
                className="flex-1 py-3 rounded-xl text-[14px] font-semibold text-[#0849ac] bg-white hover:bg-[#f0f4ff] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <svg className="animate-spin w-4 h-4 text-[#0849ac]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                ) : null}
                {loading ? "Đang gửi..." : "Thông báo tôi"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-[rgba(245,248,255,0.3)] to-white relative font-['Montserrat',sans-serif]">
      {/* Background blurs */}
      <div className="absolute top-[-120px] right-[-192px] w-[500px] h-[500px] bg-[rgba(232,240,255,0.5)] blur-[50px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-120px] left-[-192px] w-[400px] h-[400px] bg-[rgba(132,166,252,0.1)] blur-[40px] rounded-full pointer-events-none" />

      <Navbar />

      <main className="relative z-10 max-w-[1216px] mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-24">
        {/* Header */}
        <div className="text-center mb-10 sm:mb-16">
          <p className="text-[13px] sm:text-[14px] font-semibold text-[#0849ac] tracking-[0.7px] uppercase mb-3 sm:mb-4">Pricing</p>
          <h1 className="text-[30px] sm:text-[40px] lg:text-[50px] font-bold text-[#111827] leading-[1.2] mb-3 sm:mb-4">Nâng cấp tiếp theo</h1>
          <p className="text-[16px] sm:text-[20px] text-[#4b5563] leading-[26px] sm:leading-[28px]">Chọn gói phù hợp nhất với bạn</p>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-[900px] mx-auto">
          <FreePlan />
          <ProPlan />
        </div>

        {/* Footer note */}
        <p className="text-center text-[14px] text-[#6b7280] mt-12">Không mất phí để bắt đầu</p>
      </main>

      <Footer />
    </div>
  );
}

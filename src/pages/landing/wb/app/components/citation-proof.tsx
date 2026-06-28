import { useState } from "react";
import { ChevronDown, Sparkles, ShieldCheck, AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { Reveal, Eyebrow, Ticker, Citation } from "./primitives";

const CHART_DATA = [
  { q: "Q1/25", HPG: 11.2, nganh: 13.1, tb5: 12.6 },
  { q: "Q2/25", HPG: 10.4, nganh: 12.8, tb5: 12.6 },
  { q: "Q3/25", HPG: 10.9, nganh: 12.4, tb5: 12.6 },
  { q: "Q4/25", HPG: 9.9, nganh: 12.0, tb5: 12.6 },
  { q: "Q1/26", HPG: 9.6, nganh: 11.7, tb5: 12.6 },
];

const STEPS = [
  { t: "0–2s", label: "Thu thập dữ liệu giá & KQKD của HPG" },
  { t: "2–4s", label: "Đối chiếu P/E ngành thép & trung bình 5 năm" },
  { t: "4–6s", label: "Kiểm chứng từng số liệu với nguồn gốc" },
  { t: "6–8s", label: "Tổng hợp nhận định + gắn citation bắt buộc" },
];

export function CitationProof() {
  const [open, setOpen] = useState(true);

  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1200px] px-5">
        <Reveal className="mx-auto max-w-[800px] text-center">
          <Eyebrow>Citation Engine</Eyebrow>
          <h2 className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: "clamp(28px,3.8vw,44px)", lineHeight: 1.15, color: "var(--wb-text)" }}>
            Mọi con số, mọi nhận định đều có dẫn chứng
          </h2>
          <p className="mx-auto mt-5 max-w-[640px]" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 17, lineHeight: 1.6, color: "var(--wb-muted)" }}>
            AI bịa một con số = mất tiền thật. Wealbee chặn điều đó bằng Citation Engine:
            không có nguồn = không được phép xuất.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
          {/* Chat mock */}
          <Reveal>
            <div className="overflow-hidden rounded-[16px] border shadow-[0_30px_80px_var(--wb-glow)]" style={{ background: "var(--wb-card)", borderColor: "var(--wb-border)" }}>
              {/* user question */}
              <div className="border-b px-5 py-4" style={{ borderColor: "var(--wb-border)" }}>
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-full text-white" style={{ background: "var(--wb-deep)", fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 12 }}>B</span>
                  <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 500, fontSize: 15, color: "var(--wb-text)" }}>
                    Định giá cổ phiếu <Ticker symbol="HPG" /> hiện tại thế nào?
                  </span>
                </div>
              </div>

              <div className="px-5 py-5">
                {/* analysis process toggle */}
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-[10px] border px-3 py-2.5 transition-colors hover:border-[var(--wb-primary)]"
                  style={{ borderColor: "var(--wb-border)", background: "var(--wb-canvas)" }}
                >
                  <span className="flex items-center gap-2" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: "var(--wb-bright)" }}>
                    <Sparkles size={13} /> Xem quá trình phân tích · 8s
                  </span>
                  <ChevronDown size={15} style={{ color: "var(--wb-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                </button>

                {open && (
                  <div className="mt-2 space-y-2 rounded-[10px] px-3 py-3" style={{ background: "color-mix(in srgb, var(--wb-primary) 6%, transparent)" }}>
                    {STEPS.map((s) => (
                      <div key={s.t} className="flex items-center gap-3">
                        <span className="rounded px-1.5 py-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: "var(--wb-bright)", background: "color-mix(in srgb, var(--wb-primary) 14%, transparent)" }}>{s.t}</span>
                        <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13, color: "var(--wb-muted)" }}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* P/E section */}
                <div className="mt-5">
                  <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 15, color: "var(--wb-text)" }}>Định giá P/E</div>
                  <div className="mt-3 h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={CHART_DATA} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--wb-border)" vertical={false} />
                        <XAxis dataKey="q" tick={{ fill: "var(--wb-faint)", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "var(--wb-faint)", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} domain={[8, 14]} />
                        <Tooltip
                          contentStyle={{ background: "var(--wb-card)", border: "1px solid var(--wb-border)", borderRadius: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
                          labelStyle={{ color: "var(--wb-text)" }}
                        />
                        <Line type="monotone" dataKey="HPG" stroke="var(--wb-up)" strokeWidth={2.5} dot={false} name="HPG" />
                        <Line type="monotone" dataKey="nganh" stroke="var(--wb-cite)" strokeWidth={2} dot={false} name="TB ngành" />
                        <Line type="monotone" dataKey="tb5" stroke="#A78BFA" strokeWidth={2} strokeDasharray="5 4" dot={false} name="TB 5 năm" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <p className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 14.5, lineHeight: 1.65, color: "var(--wb-muted)" }}>
                    P/E = <strong style={{ color: "var(--wb-up)" }}>9,6</strong>: thấp hơn TB 5 năm (12,60) và thấp hơn TB ngành{" "}
                    <Citation source="fiingroup" date="29/05/26" />
                  </p>

                  <div className="mt-4 flex items-start gap-2 rounded-[10px] px-3 py-2.5" style={{ background: "color-mix(in srgb, var(--wb-highlight) 10%, transparent)" }}>
                    <AlertTriangle size={15} style={{ color: "var(--wb-highlight)", marginTop: 2 }} />
                    <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: 12.5, color: "var(--wb-muted)" }}>
                      Phân tích thông tin. Không phải khuyến nghị đầu tư.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Color-coding legend */}
          <Reveal delay={0.12}>
            <div className="sticky top-24 rounded-[14px] border p-6" style={{ background: "var(--wb-card)", borderColor: "var(--wb-border)" }}>
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} style={{ color: "var(--wb-bright)" }} />
                <h3 style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 16, color: "var(--wb-text)" }}>Quy ước màu sắc</h3>
              </div>
              <div className="mt-5 space-y-4">
                {[
                  { c: "var(--wb-up)", t: "Nguồn gốc / số liệu tốt", d: "Số tăng, định giá hấp dẫn." },
                  { c: "var(--wb-bright)", t: "Dữ liệu tài chính", d: "Mã cổ phiếu, chỉ số, dữ liệu thị trường." },
                  { c: "var(--wb-cite)", t: "Tin tức & dẫn chứng", d: "Citation [nguồn | ngày] có thể bấm." },
                ].map((l) => (
                  <div key={l.t} className="flex gap-3">
                    <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: l.c }} />
                    <div>
                      <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 13.5, color: "var(--wb-text)" }}>{l.t}</div>
                      <div style={{ fontFamily: "Montserrat, sans-serif", fontSize: 12.5, color: "var(--wb-muted)" }}>{l.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

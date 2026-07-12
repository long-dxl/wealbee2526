import { useState, useRef, useEffect, useCallback } from "react";
import { useBlocker } from "react-router";
import {
  ChevronLeft, Bot, Save, Play, Sparkles, ChevronDown, ChevronUp,
  Check, X, Plus, FileText, Wrench, BookOpen, TrendingUp,
  Zap, Clock, RefreshCw, CheckCircle2, AlertTriangle, Eye,
  Lightbulb, Inbox, Info, Settings, History, RotateCcw,
  Search, BarChart2, Activity, Globe, Calculator, ArrowRight, Users,
  MessageCircle, Copy, ClipboardList, Bell,
} from "lucide-react";
import { BriefRenderer, type BriefOutput } from "../../components/BriefRenderer";
import { MdContent, RichContent } from "../../components/MdContent";
import { supabase } from "../../lib/supabase/client";
import { canCreateAgent } from "../../lib/plan-limits";
import { getZaloLink, genZaloCode, ZALO_BOT_LINK, ZALO_BOT_QR } from "../../lib/zalo";
import { notifyWalletChanged } from "../../lib/wallet-events";
import { projectId } from "../../utils/supabase/info";
import wealbeeLogo from "../../assets/Logo.svg";
import { PUBLIC_TOOL_METADATA } from "../../../supabase/functions/_shared/tool-catalog";

type ScheduleFrequency = "daily" | "weekdays" | "weekly" | "custom";

// Dựng chuỗi lưu vào agents.schedule — LUÔN dùng JSON đầy đủ {mode,frequency,time,days},
// KHÔNG dùng dạng rút gọn "daily:HH:MM" cũ — "weekly"/"custom" cần mảng ngày cụ thể mà
// dạng rút gọn không biểu diễn được (đã verify: backend trigger agents_set_next_run_at
// trả về NULL cho "weekly:HH:MM" vì không có ngày). days dùng chỉ số UI: 0=T2..5=T7,6=CN.
function buildScheduleValue(frequency: ScheduleFrequency, time: string, days: number[]): string {
  return JSON.stringify({ mode: "scheduled", frequency, time, days });
}

// Đọc lại agents.schedule khi mở agent để sửa — chấp nhận cả JSON mới lẫn định dạng
// rút gọn cũ "daily:HH:MM"/"weekdays:HH:MM"/"weekly:HH:MM" (agent tạo trước khi có fix này).
function parseScheduleValue(raw: string | null | undefined): { frequency: ScheduleFrequency; time: string; days: number[] } | null {
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw);
    if (cfg?.mode === "scheduled" && cfg.frequency && cfg.time) {
      return { frequency: cfg.frequency, time: cfg.time, days: Array.isArray(cfg.days) ? cfg.days : [] };
    }
  } catch { /* không phải JSON — thử định dạng rút gọn cũ */ }
  const m = raw.match(/^(daily|weekdays|weekly):(\d{1,2}:\d{2})$/);
  if (m) {
    const frequency = m[1] as ScheduleFrequency;
    const days = frequency === "weekdays" ? [0, 1, 2, 3, 4] : frequency === "daily" ? [0, 1, 2, 3, 4, 5, 6] : [];
    return { frequency, time: m[2], days };
  }
  return null;
}

interface StudioProps {
  onBack: () => void;
  agentId?: string;
  initialName?: string;
  initialDescription?: string;
  /** Tool cần bật sẵn khi tạo agent mới (đến từ trang chi tiết công cụ) */
  initialToolId?: string;
  isDark?: boolean;
}

interface TestSession {
  id: string;
  created_at: string;
  template_id: string;
  status: "success" | "error";
  tokens_used: number;
  run_time_s: number;
  error: string | null;
  output: string | null;
  config: {
    systemPrompt?: string;
    model?: string;
    tools?: string[];
    watchSymbols?: string[];
    templateId?: string;
    agentName?: string;
  };
}

// ── Models ─────────────────────────────────────────────────────────────────
const MODELS = [
  {
    id: "default", name: "Mặc định", provider: "Wealbee",
    tags: ["Balance", "v1.0"],
    desc: "Mô hình tối ưu chi phí và hiệu suất, tích hợp bộ khung tư duy tài chính",
    available: true,
  },
  {
    id: "gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI",
    tags: ["image", "function call"],
    desc: "Tốc độ cao, chi phí thấp. Phù hợp trích xuất dữ liệu định kỳ, format báo cáo và các tác vụ lặp lại trong pipeline tài chính.",
    available: true,
  },
  {
    id: "gpt-4o", name: "GPT-4o", provider: "OpenAI",
    tags: ["image", "function call"],
    desc: "Đọc hiểu biểu đồ kỹ thuật, BCTC dạng PDF và ảnh chụp màn hình thị trường. Mạnh về phân tích đa phương thức cho nhà đầu tư.",
    available: true,
  },
  {
    id: "claude-haiku", name: "Claude Haiku 4.5", provider: "Anthropic",
    tags: ["function call"],
    desc: "Phản hồi tức thì với chi phí thấp nhất. Lý tưởng cho theo dõi giá realtime, cảnh báo ngưỡng và trả lời nhanh về trạng thái danh mục.",
    available: false, disabledReason: "Chưa có API key",
  },
  {
    id: "claude-sonnet", name: "Claude Sonnet 4", provider: "Anthropic",
    tags: ["function call", "vision"],
    desc: "Cân bằng tối ưu giữa tốc độ và độ chính xác. Lý luận tài chính sâu, tổng hợp tin tức thị trường và phân tích xu hướng trong ngữ cảnh dài 200K token.",
    available: false, disabledReason: "Chưa có API key",
  },
  {
    id: "claude-opus", name: "Claude Opus 4", provider: "Anthropic",
    tags: ["function call", "vision"],
    desc: "Khả năng lý luận phức tạp nhất. Phù hợp định giá tài sản, xây dựng luận điểm đầu tư nhiều chiều và phân tích rủi ro danh mục chuyên sâu.",
    available: false, disabledReason: "Chưa có API key",
  },
  {
    id: "gemini-flash", name: "Gemini 2.0 Flash", provider: "Google",
    tags: ["video", "image", "audio", "function call"],
    desc: "Xử lý đồng thời văn bản, hình ảnh, âm thanh và video. Phù hợp tổng hợp đa nguồn dữ liệu thị trường và phân tích nội dung hội nghị nhà đầu tư.",
    available: false, disabledReason: "Sắp tích hợp",
  },
  {
    id: "gemini-pro", name: "Gemini 2.5 Pro", provider: "Google",
    tags: ["video", "image", "audio", "+2"],
    desc: "Ngữ cảnh 1 triệu token - đọc toàn bộ hồ sơ doanh nghiệp, nhiều năm BCTC hoặc transcript roadshow trong một lần duy nhất.",
    available: false, disabledReason: "Sắp tích hợp",
  },
];

const MODEL_GROUPS: { provider: string; ids: string[] }[] = [
  { provider: "Wealbee",   ids: ["default"] },
  { provider: "OpenAI",    ids: ["gpt-4o-mini", "gpt-4o"] },
  { provider: "Anthropic", ids: ["claude-haiku", "claude-sonnet", "claude-opus"] },
  { provider: "Google",    ids: ["gemini-flash", "gemini-pro"] },
];

// ── Provider logos ──────────────────────────────────────────────────────────
function ModelLogo({ provider, size = 44, uid = "0" }: { provider: string; size?: number; uid?: string }) {
  const r = Math.round(size * 0.22);
  if (provider === "Wealbee") {
    return (
      <div style={{ width: size, height: size, borderRadius: r, background: "#fff", border: "1px solid rgba(8,73,172,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
        <img src={wealbeeLogo} alt="Wealbee" style={{ width: size * 0.7, height: size * 0.7, objectFit: "contain" }} />
      </div>
    );
  }
  if (provider === "OpenAI") {
    return (
      <div style={{ width: size, height: size, borderRadius: r, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="white">
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.843-3.371 2.019-1.168a.076.076 0 0 1 .071 0l4.83 2.786a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.4-.674zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
        </svg>
      </div>
    );
  }
  if (provider === "Anthropic") {
    return (
      <div style={{ width: size, height: size, borderRadius: r, background: "#D97757", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="white">
          <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-3.654 0H6.57L0 20h3.603l1.389-3.5h6.404l1.389 3.5h3.603l-6.615-16.48zm-1.209 9.982l1.99-5.01 1.99 5.01H8.964z"/>
        </svg>
      </div>
    );
  }
  if (provider === "Google") {
    const gid = `gstar_${uid}`;
    return (
      <div style={{ width: size, height: size, borderRadius: r, background: "#fff", border: "1px solid rgba(0,0,0,0.09)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 28 28" fill="none">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4285F4"/>
              <stop offset="52%" stopColor="#9B72CB"/>
              <stop offset="100%" stopColor="#D96570"/>
            </linearGradient>
          </defs>
          <path d="M14 28C14 26.063 13.627 24.243 12.88 22.54C12.157 20.837 11.165 19.355 9.905 18.095C8.645 16.835 7.163 15.843 5.46 15.12C3.757 14.373 1.937 14 0 14C1.937 14 3.757 13.638 5.46 12.915C7.163 12.168 8.645 11.165 9.905 9.905C11.165 8.645 12.157 7.163 12.88 5.46C13.627 3.757 14 1.937 14 0C14 1.937 14.362 3.757 15.085 5.46C15.832 7.163 16.835 8.645 18.095 9.905C19.355 11.165 20.837 12.168 22.54 12.915C24.243 13.638 26.063 14 28 14C26.063 14 24.243 14.373 22.54 15.12C20.837 15.843 19.355 16.835 18.095 18.095C16.835 19.355 15.832 20.837 15.085 22.54C14.362 24.243 14 26.063 14 28Z" fill={`url(#${gid})`}/>
        </svg>
      </div>
    );
  }
  return <div style={{ width: size, height: size, borderRadius: r, background: "#999", flexShrink: 0 }} />;
}

// ── Channel logos (phương thức thông báo) — logo thật thay icon/chữ viết tắt chung chung ──
function GmailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" shapeRendering="geometricPrecision">
      <path fill="#4caf50" d="M45,16.2l-5,2.75l-5,4.75L35,40h7c1.657,0,3-1.343,3-3V16.2z" />
      <path fill="#1e88e5" d="M3,16.2l3.614,1.71L13,23.7V40H6c-1.657,0-3-1.343-3-3V16.2z" />
      <polygon fill="#e53935" points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17" />
      <path fill="#c62828" d="M3,12.298V16.2l10,7.5V11.2L9.876,8.859C8.132,7.554,5.55,7.995,4.336,9.789 C3.469,11.071,3,12.556,3,12.298z" />
      <path fill="#fbc02d" d="M45,12.298V16.2l-10,7.5V11.2l3.124-2.341c1.744-1.305,4.326-0.864,5.54,0.93 C44.531,11.071,45,12.556,45,12.298z" />
    </svg>
  );
}

// Logo Zalo thật (wordmark) — trích từ file gốc do user cung cấp (Downloads/Logo Zalo.svg),
// chỉ giữ phần nằm trong viewBox hiển thị (0 0 309.312 309.312); phần còn lại của file gốc
// là các logo khác nằm ngoài khung nhìn nên không dùng.
function ZaloWordmark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 309.312 309.312">
      <path fill="#0068FF" d="M57.616,1.567c10.59-1.67,21.36-1.68,32.06-1.44l-0.92,0.85c-14,9.17-25.61,21.76-34,36.21
        c-16.82,28.93-22.95,63.14-21.56,96.3c1.38,27,7.86,54.15,21.6,77.62c2.3,4.2,6.13,7.91,6.19,13.01
        c0.43,10.94-4.98,21.25-12.3,29.07c0.48,0.5,0.95,1,1.43,1.5c6.85,7.48,14.16,14.51,21.12,21.89
        c9.89,11.18,21.16,21.08,30.85,32.46c-16.12,0.24-32.43,0.99-48.36-2.02c-20.05-3.89-37.85-17.79-46.35-36.37
        c-5.15-10.74-6.69-22.75-7.09-34.52c-0.01-54.34-0.01-108.67,0-163c0.22-18.16,5.03-37.16,17.81-50.63
        C28.216,11.087,42.546,3.667,57.616,1.567z" />
      <path fill="#0068FF" d="M204.436,101.347c4.29,0,8.58,0,12.88,0c-0.07,25.13-0.07,50.27,0,75.4c-4.2-0.59-11.19,2.1-12.77-3.49
        C204.286,149.297,204.526,125.317,204.436,101.347z" />
      <path fill="#0068FF" d="M73.196,102.237c19.96-0.02,39.9-0.15,59.85-0.01c-0.14,3.91-0.36,8.17-2.98,11.33
        c-13.64,16.98-26.99,34.18-40.62,51.16c14.49,0.09,28.98,0.03,43.47,0.03c-0.27,3.39,0.92,7.34-1.28,10.28
        c-1.38,1.9-3.88,1.73-5.95,1.75c-18.13-0.1-36.26,0.09-54.38-0.1c0.05-3.83,0.09-8.07,2.77-11.12
        c13.48-16.91,27.12-33.7,40.54-50.65c-13.79,0.02-27.59-0.09-41.38,0.06C73.146,110.727,73.176,106.477,73.196,102.237z" />
      <path fill="#0068FF" d="M249.246,118.877c14.36-3.21,29.94,6.22,33.87,20.36c4.93,14.71-4.07,32.2-18.94,36.68
        c-12.63,4.45-27.75-1.36-34.3-13c-5.14-8.6-5.45-19.86-0.78-28.71C233.056,126.397,240.706,120.687,249.246,118.877z
        M249.006,131.617c-8.76,3.09-13.48,13.75-10.06,22.36c2.83,8.14,12.36,13.12,20.64,10.62c9.45-2.26,15.16-13.33,11.81-22.4
        C268.596,133.217,257.746,128.037,249.006,131.617z" />
      <path fill="#0068FF" d="M142.866,129.347c6.91-8.56,19.01-12.78,29.67-9.73c3.52,0.89,6.71,2.65,9.79,4.52
        c-0.03-0.94-0.1-2.81-0.13-3.75c4.03-0.02,8.05-0.01,12.08-0.03c-0.02,18.8-0.04,37.6,0.01,56.41c-2.96-0.08-5.97,0.27-8.88-0.33
        c-2.04-0.83-2.67-3.06-3.48-4.88c-11.12,8.64-28.59,6.68-37.83-3.84C134.246,157.527,133.736,140.167,142.866,129.347z
        M159.146,131.867c-9.26,3.26-13.75,15.19-9.06,23.79c4,8.38,15.26,11.9,23.31,7.28c7.47-3.92,10.92-13.65,7.71-21.43
        C177.996,133.047,167.506,128.307,159.146,131.867z" />
      <path fill="#FFFFFF" d="M88.756,0.977c2.24-0.64,4.58-0.84,6.9-0.91c39.99,0.15,79.98-0.02,119.97,0.05
        c10.69,0.13,21.44-0.59,32.05,1.04c14.69,1.12,28.83,7.34,39.76,17.17c13.72,13.11,21.04,31.99,21.27,50.82
        c0.01,53.01-0.02,106.06,0.03,159.05c-0.14,0.31-0.41,0.95-0.55,1.27c-14.25,15.94-33.41,26.73-53.44,33.71
        c-26.99,9.2-55.9,12.16-84.27,10c-28.37-2.44-56.96-9.85-81.02-25.53c-12.3,5.47-25.87,8.15-39.34,7.04
        c-0.48-0.5-0.95-1-1.43-1.5c7.32-7.82,12.73-18.13,12.3-29.07c-0.06-5.1-3.89-8.81-6.19-13.01
        c-13.74-23.47-20.22-50.62-21.6-77.62c-1.39-33.16,4.74-67.37,21.56-96.3C63.146,22.737,74.756,10.147,88.756,0.977z
        M204.436,101.347c0.09,23.97-0.15,47.95,0.11,71.91c1.58,5.59,8.57,2.9,12.77,3.49c-0.07-25.13-0.07-50.27,0-75.4
        C213.016,101.347,208.726,101.347,204.436,101.347z M73.196,102.237c-0.02,4.24-0.05,8.49,0.04,12.73
        c13.79-0.15,27.59-0.04,41.38-0.06c-13.42,16.95-27.06,33.74-40.54,50.65c-2.68,3.05-2.72,7.29-2.77,11.12
        c18.12,0.19,36.25,0,54.38,0.1c2.07-0.02,4.57,0.15,5.95-1.75c2.2-2.94,1.01-6.89,1.28-10.28c-14.49,0-28.98,0.06-43.47-0.03
        c13.63-16.98,26.98-34.18,40.62-51.16c2.62-3.16,2.84-7.42,2.98-11.33C113.096,102.087,93.156,102.217,73.196,102.237z
        M249.246,118.877c-8.54,1.81-16.19,7.52-20.15,15.33c-4.67,8.85-4.36,20.11,0.78,28.71c6.55,11.64,21.67,17.45,34.3,13
        c14.87-4.48,23.87-21.97,18.94-36.68C279.186,125.097,263.606,115.667,249.246,118.877z M142.866,129.347
        c-9.13,10.82-8.62,28.18,1.23,38.37c9.24,10.52,26.71,12.48,37.83,3.84c0.81,1.82,1.44,4.05,3.48,4.88
        c2.91,0.6,5.92,0.25,8.88,0.33c-0.05-18.81-0.03-37.61-0.01-56.41c-4.03,0.02-8.05,0.01-12.08,0.03c0.03,0.94,0.1,2.81,0.13,3.75
        c-3.08-1.87-6.27-3.63-9.79-4.52C161.876,116.567,149.776,120.787,142.866,129.347z" />
      <path fill="#FFFFFF" d="M159.146,131.867c8.36-3.56,18.85,1.18,21.96,9.64c3.21,7.78-0.24,17.51-7.71,21.43
        c-8.05,4.62-19.31,1.1-23.31-7.28C145.396,147.057,149.886,135.127,159.146,131.867z" />
      <path fill="#FFFFFF" d="M249.006,131.617c8.74-3.58,19.59,1.6,22.39,10.58c3.35,9.07-2.36,20.14-11.81,22.4
        c-8.28,2.5-17.81-2.48-20.64-10.62C235.526,145.367,240.246,134.707,249.006,131.617z" />
      <path fill="#0068FF" d="M308.186,229.467l0.79-0.86c0.41,15.63-1.28,31.94-8.95,45.85c-8.92,16.32-25.1,28.44-43.3,32.32
        c-10.21,2.11-20.68,2.58-31.08,2.45c-31.99,0.01-63.98,0-95.97,0.01c-9.2-0.15-18.42,0.28-27.59-0.2
        c-9.69-11.38-20.96-21.28-30.85-32.46c-6.96-7.38-14.27-14.41-21.12-21.89c13.47,1.11,27.04-1.57,39.34-7.04
        c24.06,15.68,52.65,23.09,81.02,25.53c28.37,2.16,57.28-0.8,84.27-10C274.776,256.197,293.936,245.407,308.186,229.467z" />
    </svg>
  );
}

// ── KB Doc type (loaded from Supabase) ───────────────────────────────────────
interface KBDoc {
  id: string;
  title: string;
  file_type: string;
  status: string;
}

function FileTypeTag({ type, size = 36 }: { type: string; size?: number }) {
  const map: Record<string, [string, string]> = {
    pdf: ["#FF3B30", "#fff"], md: ["#6366F1", "#fff"], txt: ["#0849AC", "#fff"],
    xlsx: ["#34C759", "#fff"], csv: ["#34C759", "#fff"],
  };
  const [bg, fg] = map[type.toLowerCase()] ?? ["#888", "#fff"];
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.5 }}>
      <span style={{ fontSize: Math.round(size * 0.26), fontWeight: 800, color: fg, letterSpacing: "-0.5px", fontFamily: "system-ui" }}>{type.toUpperCase()}</span>
    </div>
  );
}

// ── Tool groups ───────────────────────────────────────────────────────────────
// IDs khớp với những gì run-agent kiểm tra qua enabledTools.includes(id)
const TOOL_GROUP_PRESENTATION = [
  {
    id: "market", category: "Dữ liệu thị trường",
    tools: [
      {
        id: "price_feed", name: "Giá & Chỉ số", Icon: TrendingUp,
        desc: "Giá VN30, VN-Index, HNX-Index và top tăng/giảm phiên, đọc từ prices_daily + market_indices",
        available: true,
        includes: ["Giá cổ phiếu realtime", "VN-Index / HNX-Index", "Top tăng / Top giảm"],
      },
      {
        id: "macro", name: "Vĩ mô", Icon: Globe,
        desc: "Bối cảnh vĩ mô hằng ngày: tỷ giá USD/VND, DXY, lợi suất Mỹ 10Y, giá dầu/vàng, S&P500, VIX (+%YTD/YoY), VN-Index/HNX và top tin vĩ mô nổi bật",
        available: true,
        includes: ["Tỷ giá & DXY", "Lãi suất Mỹ 10Y & VIX", "Dầu/vàng/S&P500", "VN-Index + tin vĩ mô"],
      },
    ],
  },
  {
    id: "fundamental", category: "Phân tích cơ bản",
    tools: [
      {
        id: "financials", name: "BCTC", Icon: FileText,
        desc: "Phân tích sâu như Analyst: IS/BS/CF + chỉ số RIÊNG theo 4 loại hình (NH: NIM/CIR/NPL; CTCK: margin/VCSH; BH: combined ratio), theo cả Năm và 5 Quý gần nhất",
        available: true,
        includes: ["BCTC theo năm (doanh thu, LNST, EPS, ROE…)", "BCTC 5 quý gần nhất (YoY)", "Chỉ số tài chính theo loại hình"],
      },
      {
        id: "insider_trades", name: "Cổ tức & Giao dịch nội bộ", Icon: Users,
        desc: "Lịch sử chi trả cổ tức (tiền mặt/cổ phiếu) và giao dịch mua/bán của lãnh đạo, cổ đông nội bộ",
        available: true,
        includes: ["Lịch sử cổ tức", "Giao dịch nội bộ (MUA/BÁN)"],
      },
      {
        id: "analyst_reports", name: "Báo cáo phân tích CTCK", Icon: ClipboardList,
        desc: "Khuyến nghị + GIÁ MỤC TIÊU của các CTCK (SSI, VNDirect, Rồng Việt…) cho từng mã, kèm đồng thuận và link PDF gốc",
        available: true,
        includes: ["Khuyến nghị (MUA/Khả quan…)", "Giá mục tiêu", "Đồng thuận CTCK + link PDF"],
      },
      {
        id: "value_chain", name: "Giá hàng hóa (chuỗi cung ứng)", Icon: Activity,
        desc: "Kéo GIÁ realtime nguyên liệu đầu vào & sản phẩm đầu ra theo ngành (thép: quặng/than cốc → HRC; cảng/hàng không: dầu/nhiên liệu; phân bón: khí → urea…). Lưu ý: khung suy luận chuỗi cung ứng & yếu tố vĩ mô LUÔN được agent áp dụng — bật tool này chỉ để thêm SỐ giá thị trường realtime.",
        available: true,
        includes: ["Giá nguyên liệu đầu vào (realtime)", "Giá sản phẩm đầu ra (realtime)", "Khung tác động: luôn áp dụng"],
      },
      {
        id: "pe_ratio", name: "P/E & Định giá", Icon: Calculator,
        desc: "Định giá tương đối P/E, P/B, EV/EBITDA so với ngành và lịch sử",
        available: false,
        includes: [],
      },
    ],
  },
  {
    id: "technical", category: "Phân tích kỹ thuật",
    tools: [
      { id: "rsi",  name: "RSI",  Icon: Activity,   desc: "Relative Strength Index, vùng quá mua (>70), quá bán (<30)", available: false, includes: [] },
      { id: "macd", name: "MACD", Icon: TrendingUp, desc: "Xu hướng & động lượng, tín hiệu cắt lên/xuống đường signal line", available: false, includes: [] },
    ],
  },
  {
    id: "news-macro", category: "Tin tức",
    tools: [
      {
        id: "news_feed", name: "Tin tức thị trường", Icon: BookOpen,
        desc: "Tin 48h từ CafeF, Vietstock, HOSE Filing, lọc theo mã trong watchlist, xếp hạng impact score",
        available: true,
        includes: ["Tin theo mã watchlist", "Tin thị trường chung", "Impact score & tóm tắt"],
      },
    ],
  },
];
const registryToolMetadata = new Map(PUBLIC_TOOL_METADATA.map(tool => [tool.id, tool]));
const TOOL_GROUPS = TOOL_GROUP_PRESENTATION.map(group => ({ ...group, tools: group.tools.map(tool => {
  const metadata = registryToolMetadata.get(tool.id);
  return metadata ? { ...tool, name: metadata.label, desc: metadata.description, available: tool.available !== false } : { ...tool, available: false };
}) }));
const ALL_TOOLS = TOOL_GROUPS.flatMap(g => g.tools);
const AVAILABLE_TOOLS_COUNT = ALL_TOOLS.filter(t => t.available).length;

// ── Default prompt ──────────────────────────────────────────────────────────
const DEFAULT_PROMPT = `Tôi muốn xem bản tin hàng ngày về danh mục của tôi theo thứ tự sau:

1. Đầu tiên cho tôi biết danh mục hôm nay: mã nào có tin tức, mã nào không có tin gì cả.

2. Nếu có bài báo ảnh hưởng đến từ 2 mã trở lên trong danh mục của tôi, hãy gom lại thành nhóm riêng. Đặt tiêu đề nhóm là "Tin ảnh hưởng nhiều cổ phiếu", rồi mỗi bài một card tin tức. Trong card đó nhớ hiển thị các mã cổ phiếu liên quan.

3. Sau đó, với từng mã có tin, tạo một tiêu đề là tên mã (ví dụ "VHM"), rồi liệt kê các tin của mã đó, mỗi tin một card. Những tin đã hiển thị ở nhóm trên thì không cần hiển thị lại.

4. Cuối cùng thêm dòng disclaimer pháp lý theo quy định.`;


const POPULAR_STOCKS = ["VCB", "HPG", "FPT", "VIC", "TCB", "ACB", "MWG", "VNM", "MSN", "STB"];

// ══════════════════════════════════════════════════════════════════════════════
export function AgentStudio({ onBack, agentId, initialName, initialDescription, initialToolId, isDark = false }: StudioProps) {
  const [runtimeModels, setRuntimeModels] = useState<Record<string, boolean>>({ default: true });
  useEffect(() => {
    fetch(`https://${projectId}.supabase.co/functions/v1/platform-metadata`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then(data => setRuntimeModels({ default: true, ...Object.fromEntries((data.models ?? []).map((model: any) => [model.id, !!model.available])) }))
      .catch(() => { /* giữ availability mặc định nếu metadata endpoint tạm lỗi */ });
  }, []);
  const models = MODELS.map(model => ({
    ...model,
    available: runtimeModels[model.id] ?? model.available,
    disabledReason: (runtimeModels[model.id] ?? model.available) ? undefined : "Provider chưa được cấu hình",
  }));
  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const fgSubtle = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const fgDisabled = isDark ? "rgba(240,242,255,0.30)" : "rgba(26,26,46,0.35)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const bgApp = isDark ? "#0B0D18" : "#F5F5F7";
  const bgPanel = isDark ? "#131824" : "#fff";
  const bgMuted = isDark ? "#0f1220" : "#F5F5F7";
  const bgFaint = isDark ? "#FAFAFA11" : "#FAFAFA";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.10)";
  const dividerFaint = isDark ? "rgba(255,255,255,0.05)" : "rgba(8,73,172,0.08)";
  const inputBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(8,73,172,0.18)";
  const FONT = "'Montserrat', system-ui, sans-serif";

  // ── Config state ──────────────────────────────────────────────────────────
  const [agentName, setAgentName] = useState(agentId ? "Bản tin hàng ngày" : (initialName ?? ""));
  const [agentDesc, setAgentDesc] = useState(initialDescription ?? "");
  // Bước nhập tên + mô tả TRƯỚC khi vào editor — chỉ khi TẠO MỚI (không có agentId).
  // Sửa agent cũ thì bỏ qua hẳn bước này. Nếu đã có initialName (đến từ modal "Tạo Agent"
  // ở trang danh sách) thì cũng bỏ qua vì user đã nhập tên rồi, tránh hỏi lại lần 2.
  const [needsSetup, setNeedsSetup] = useState(!agentId && !initialName);
  const [templateId, setTemplateId] = useState("daily_digest");
  // Sửa agent (có agentId): khởi tạo RỖNG, chờ load prompt thật từ DB → không nháy prompt mẫu.
  // Tạo mới (không agentId): dùng prompt mẫu mặc định.
  const [prompt, setPrompt] = useState(agentId ? "" : DEFAULT_PROMPT);
  const [promptLoading, setPromptLoading] = useState(!!agentId);
  const [selectedModel, setSelectedModel] = useState("default");
  const [selectedKB, setSelectedKB] = useState<Set<string>>(new Set());
  const [selectedTools, setSelectedTools] = useState<Set<string>>(
    new Set(initialToolId ? ["price_feed", "news_feed", "financials", initialToolId] : ["price_feed", "news_feed", "financials"])
  );
  const [portfolioSymbols, setPortfolioSymbols] = useState<string[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [stockInput, setStockInput] = useState("");
  // Danh sách mã + tên công ty (cho gợi ý autocomplete khi thêm mã theo dõi)
  const [allTickers, setAllTickers] = useState<{ symbol: string; name: string }[]>([]);

  // ── News sources (real from Supabase) ────────────────────────────────────
  const [newsSources, setNewsSources] = useState<string[]>([]); // selected sources, empty = all
  const [availableNewsSources, setAvailableNewsSources] = useState<{id: string; label: string; count: number}[]>([]);

  // ── KB docs (real from Supabase) ──────────────────────────────────────────
  const [kbDocs, setKbDocs] = useState<KBDoc[]>([]);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [showKBPicker, setShowKBPicker] = useState(false);
  const [kbSearch, setKbSearch] = useState("");
  const [showToolsPicker, setShowToolsPicker] = useState(false);
  const [toolsSearch, setToolsSearch] = useState("");
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [showWatchlistPicker, setShowWatchlistPicker] = useState(false);
  const [showTriggerPicker, setShowTriggerPicker] = useState(false);

  // ── Accordion ─────────────────────────────────────────────────────────────
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["model", "tools", "watchlist"]));

  // ── AI optimize ───────────────────────────────────────────────────────────
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showOptimized, setShowOptimized] = useState(false);

  // ── Resizable panels ──────────────────────────────────────────────────────
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(360);
  const draggingLeft = useRef(false);
  const draggingRight = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  const startDragLeft = useCallback((e: React.MouseEvent) => {
    draggingLeft.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = leftWidth;
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!draggingLeft.current) return;
      setLeftWidth(Math.max(220, Math.min(520, dragStartW.current + ev.clientX - dragStartX.current)));
    };
    const onUp = () => { draggingLeft.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [leftWidth]);

  const startDragRight = useCallback((e: React.MouseEvent) => {
    draggingRight.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = rightWidth;
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!draggingRight.current) return;
      setRightWidth(Math.max(240, Math.min(520, dragStartW.current - (ev.clientX - dragStartX.current))));
    };
    const onUp = () => { draggingRight.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [rightWidth]);

  // ── Test run state ────────────────────────────────────────────────────────
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<BriefOutput | null>(null);
  const [runResultText, setRunResultText] = useState<string | null>(null);
  const [runResultRefs, setRunResultRefs] = useState<Array<{ index: number; label: string; url: string }>>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [runTime, setRunTime] = useState<number>(0);
  const [runTokens, setRunTokens] = useState<number>(0);

  // ── History ───────────────────────────────────────────────────────────────
  const [rightTab, setRightTab] = useState<"preview" | "history">("preview");
  const [sessions, setSessions] = useState<TestSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsHasMore, setSessionsHasMore] = useState(false);
  const [sessionsLoadingMore, setSessionsLoadingMore] = useState(false);
  const [viewingSessionLabel, setViewingSessionLabel] = useState<string | null>(null);

  // ── Save ──────────────────────────────────────────────────────────────────
  const [isSaved, setIsSaved] = useState(false);

  // ── Schedule ──────────────────────────────────────────────────────────────
  // ── Điều kiện kích hoạt agent ──
  const [triggerType, setTriggerType] = useState<"manual" | "scheduled" | "event">("manual");
  const [eventType, setEventType] = useState<"insider_buy" | "volume_spike" | "high_impact_news">("volume_spike");
  const [eventMultiple, setEventMultiple] = useState(2);
  const [eventDays, setEventDays] = useState(7);
  const [eventMinImpact, setEventMinImpact] = useState(5);
  const [frequency, setFrequency] = useState<"daily" | "weekdays" | "weekly" | "custom">("daily");
  const [scheduleTime, setScheduleTime] = useState("09:15");
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4]));
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [notifyZalo, setNotifyZalo] = useState(false);
  const [zaloLinkName, setZaloLinkName] = useState<string | null>(null);  // null = chưa kết nối; "" hoặc tên = đã kết nối
  const [zaloConnecting, setZaloConnecting] = useState(false);  // đang hiện card kết nối inline
  const [zaloCode, setZaloCode] = useState<string | null>(null);
  const [zaloBusy, setZaloBusy] = useState(false);
  const [zaloCopied, setZaloCopied] = useState(false);

  const refreshZaloLink = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const link = await getZaloLink(user.id);
    setZaloLinkName(link ? (link.displayName || "") : null);
    if (link) { setZaloConnecting(false); setZaloCode(null); }
  };
  const startZaloConnect = async () => {
    setZaloConnecting(true); setZaloBusy(true);
    try { setZaloCode(await genZaloCode()); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setZaloBusy(false); }
  };

  // ── Cảnh báo rời trang khi có thay đổi chưa lưu ─────────────────────────────
  // agentLoaded: true khi agent (nếu có agentId) đã nạp xong dữ liệu thật, hoặc luôn true
  // với agent mới tạo (không cần chờ nạp). initialSnapshot chụp lại đúng 1 lần trạng thái
  // "vừa nạp xong" để so sánh — nhờ vậy phát hiện đúng thay đổi thật của user, không bị race.
  const [agentLoaded, setAgentLoaded] = useState(!agentId);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const leaveActionRef = useRef<() => void>(() => {});

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleDay = (d: number) => {
    if (frequency === "weekly") { setSelectedDays(new Set([d])); return; }
    setSelectedDays(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; });
  };
  const toggleSection = (id: string) =>
    setOpenSections(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleKB = (id: string) =>
    setSelectedKB(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Load real KB docs from Supabase ──────────────────────────────────────
  useEffect(() => {
    supabase.from("knowledge_documents").select("id, title, file_type, status").order("created_at", { ascending: false }).limit(50).then(({ data }) => {
      if (data) setKbDocs(data as KBDoc[]);
    });
  }, []);

  // ── Load distinct news sources from Supabase ──────────────────────────────
  useEffect(() => {
    supabase.from("market_news").select("source").not("source", "is", null).limit(2000).then(({ data }) => {
      if (!data) return;
      const counts: Record<string, number> = {};
      for (const row of data) { if (row.source) counts[row.source] = (counts[row.source] ?? 0) + 1; }
      const SOURCE_LABELS: Record<string, string> = {
        cafef: "CafeF", vietstock: "Vietstock", markettimes: "Market Times",
        thoibaonganhang: "Thời báo Ngân hàng", stockbiz: "Stockbiz",
        vnexpress: "VnExpress", thoibaotaichinhvietnam: "TB Tài chính VN",
        baodautu: "Báo Đầu tư", vneconomy: "VnEconomy", vietnamfinance: "Vietnam Finance",
        tinnhanhchungkhoan: "Tin nhanh Chứng khoán", thesaigontimes: "The Saigon Times",
      };
      const list = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => ({ id, label: SOURCE_LABELS[id] ?? id, count }));
      setAvailableNewsSources(list);
    });
  }, []);

  // ── Load real portfolio holdings ──────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserEmail(user.email ?? "");
      getZaloLink(user.id).then(link => setZaloLinkName(link ? (link.displayName || "") : null));
      supabase.from("portfolio_holdings").select("symbol").eq("user_id", user.id).then(({ data }) => {
        if (data?.length) {
          const syms = data.map((h: { symbol: string }) => h.symbol);
          // Chỉ lưu danh sách mã trong danh mục; KHÔNG động vào watchlist ở đây — trạng thái
          // "Kết nối danh mục" được suy ra (derived) từ so sánh watchlist với portfolioSymbols
          // lúc render (xem isPortfolioConnected), nên không cần/không nên strip watchlist khi mount.
          setPortfolioSymbols(syms);
        }
      });
    });
  }, []);
  const toggleTool = (id: string) =>
    setSelectedTools(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addStock = (sym: string) => {
    const s = sym.trim().toUpperCase();
    // Không cần chặn theo "locked" nữa — nếu đang kết nối danh mục (watchlist == portfolioSymbols),
    // thêm mã mới ngoài danh mục sẽ tự động phá vỡ sự trùng khớp và tắt "Kết nối danh mục" (xem isPortfolioConnected).
    if (s && !watchlist.includes(s)) setWatchlist(p => [...p, s]);
    setStockInput("");
  };

  // ── Load sessions ─────────────────────────────────────────────────────────
  const PAGE = 10;
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      let query = supabase
        .from("agent_test_sessions")
        .select("id, created_at, template_id, status, tokens_used, run_time_s, error, output, config")
        .order("created_at", { ascending: false })
        .limit(PAGE + 1);
      if (agentId) query = query.eq("agent_id", agentId);
      const { data } = await query;
      const rows = (data as TestSession[]) ?? [];
      setSessionsHasMore(rows.length > PAGE);
      setSessions(rows.slice(0, PAGE));
    } catch { /* ignore */ } finally {
      setSessionsLoading(false);
    }
  }, [agentId]);

  const loadMoreSessions = async () => {
    setSessionsLoadingMore(true);
    try {
      const oldest = sessions[sessions.length - 1]?.created_at;
      if (!oldest) return;
      let query = supabase
        .from("agent_test_sessions")
        .select("id, created_at, template_id, status, tokens_used, run_time_s, error, output, config")
        .order("created_at", { ascending: false })
        .lt("created_at", oldest)
        .limit(PAGE + 1);
      if (agentId) query = query.eq("agent_id", agentId);
      const { data } = await query;
      const rows = (data as TestSession[]) ?? [];
      setSessionsHasMore(rows.length > PAGE);
      setSessions(prev => [...prev, ...rows.slice(0, PAGE)]);
    } catch { /* ignore */ } finally {
      setSessionsLoadingMore(false);
    }
  };

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Nạp danh sách mã + tên công ty 1 lần để gợi ý khi gõ
  useEffect(() => {
    supabase.from("tickers").select("symbol,name").eq("is_active", true).order("symbol")
      .then(({ data }) => setAllTickers((data ?? []) as { symbol: string; name: string }[]));
  }, []);

  // ── Load agent on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (!agentId) return;
    supabase.from("agents").select("*").eq("id", agentId).single().then(({ data }) => {
      if (!data) { setPromptLoading(false); return; }
      if (data.name) setAgentName(data.name);
      if (data.description != null) setAgentDesc(data.description);
      if (data.template_id) setTemplateId(data.template_id);
      const isDeepResearch = data.template_id === "deep_research";
      const isOldSystemPrompt = !isDeepResearch && (data.system_prompt?.startsWith("Bạn là chuyên gia") || data.system_prompt?.startsWith("Bạn là AI"));
      setPrompt(data.system_prompt && !isOldSystemPrompt ? data.system_prompt : DEFAULT_PROMPT);
      setPromptLoading(false);
      if (data.model) {
        setSelectedModel(MODELS.some(m => m.id === data.model) ? data.model : "default");
      }
      if (data.tools?.length) setSelectedTools(new Set(data.tools));
      if (data.news_sources?.length) setNewsSources(data.news_sources);
      // Nạp đúng mã đã lưu. "Kết nối danh mục" KHÔNG đọc từ cột use_portfolio (có thể đã lỗi thời) —
      // nó được suy ra (derived) bằng cách so sánh watchlist với portfolioSymbols hiện tại, xem isPortfolioConnected.
      if (data.target_symbols?.length) setWatchlist(data.target_symbols);
      if (data.email_notify != null) setNotifyEmail(data.email_notify);
      if (data.zalo_notify != null) setNotifyZalo(data.zalo_notify);
      const parsedSchedule = parseScheduleValue(data.schedule);
      if (parsedSchedule) {
        setFrequency(parsedSchedule.frequency);
        setScheduleTime(parsedSchedule.time);
        if (parsedSchedule.days.length) setSelectedDays(new Set(parsedSchedule.days));
      }
      // Điều kiện kích hoạt
      const tt = data.trigger_type || (parsedSchedule ? "scheduled" : "manual");
      setTriggerType(tt === "scheduled" || tt === "event" ? tt : "manual");
      const tc = data.trigger_config;
      if (tc && typeof tc === "object") {
        if (tc.event_type) setEventType(tc.event_type);
        if (tc.multiple) setEventMultiple(Number(tc.multiple));
        if (tc.days) setEventDays(Number(tc.days));
        if (tc.min_impact) setEventMinImpact(Number(tc.min_impact));
      }
      setAgentLoaded(true);
    });
  }, [agentId]);

  // ── Run test ──────────────────────────────────────────────────────────────
  const handleRunTest = async () => {
    // Mã quan tâm là TÙY CHỌN — nếu trống, brain tự rút mã từ prompt
    setIsRunning(true);
    setRunResult(null);
    setRunResultText(null);
    setRunResultRefs([]);
    setRunError(null);
    setViewingSessionLabel(null);
    const start = Date.now();
    try {
      // Bộ khung tư duy Wealbee (đã tích hợp KG) — edge function agent-dry-run.
      const { data: { session } } = await supabase.auth.getSession();
      const jwt = session?.access_token ?? "";
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/agent-dry-run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
          body: JSON.stringify({
            templateId,
            systemPrompt: prompt,
            watchSymbols: allSymbols.length ? allSymbols : undefined,
            model: selectedModel,
            tools: [...selectedTools],
            agentId: agentId ?? null,
            agentName,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRunResultText(json.output as string);
      if (json.refs) setRunResultRefs(json.refs);
      setRunTokens(json.tokensUsed ?? 0);
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunTime(Math.round((Date.now() - start) / 100) / 10);
      setIsRunning(false);
      loadSessions();
      notifyWalletChanged();  // Beeny vừa bị trừ → refresh sidebar
    }
  };

  // ── Save agent ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setIsSaved(true);
    const schedule = triggerType === "scheduled"
      ? buildScheduleValue(frequency, scheduleTime, [...selectedDays].sort((a, b) => a - b))
      : "manual";
    const trigger_config = triggerType === "event"
      ? {
          event_type: eventType,
          symbols: allSymbols,
          ...(eventType === "volume_spike" ? { multiple: eventMultiple } : {}),
          ...(eventType === "insider_buy" ? { days: eventDays } : {}),
          ...(eventType === "high_impact_news" ? { min_impact: eventMinImpact } : {}),
        }
      : null;
    const payload = {
      name: agentName, description: agentDesc, system_prompt: prompt, model: selectedModel,
      tools: [...selectedTools], target_symbols: allSymbols, use_portfolio: isPortfolioConnected,
      news_sources: newsSources,
      email_notify: notifyEmail, zalo_notify: notifyZalo, schedule, status: "active",
      trigger_type: triggerType, trigger_config,
      updated_at: new Date().toISOString(),
    };
    if (agentId) {
      const { error } = await supabase.from("agents").update(payload).eq("id", agentId);
      if (error) { console.error("Save agent error:", error.message); setIsSaved(false); return; }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      // Giới hạn số agent theo gói (free 2 · pro 5 · premium 15)
      const lim = await canCreateAgent(user!.id);
      if (!lim.ok) {
        alert(`Gói ${lim.plan.toUpperCase()} chỉ tạo được tối đa ${lim.limit} agent (bạn đang có ${lim.count}). Nâng cấp gói để tạo thêm.`);
        setIsSaved(false);
        return;
      }
      const { error } = await supabase.from("agents").insert({ ...payload, user_id: user!.id, template_id: "daily_digest" });
      if (error) { console.error("Save agent error:", error.message); setIsSaved(false); return; }
    }
    // Đã lưu thành công — chốt lại "bản gốc" ngay tại đây để không tự chặn nhầm việc điều
    // hướng đi (blocker) hay lượt onBack() tự động bên dưới. Dùng setState (thay vì mutate ref)
    // để buộc re-render ngay, nhờ đó isDirty/useBlocker cập nhật về false TRƯỚC khi onBack()
    // gọi navigate() — nếu không, blocker vẫn giữ giá trị isDirty=true của lần render trước
    // và hiện nhầm modal "Thay đổi chưa được lưu" dù agent đã lưu xong.
    setInitialSnapshot(buildDraftSnapshot());
    setTimeout(() => onBack(), 1200);
  };

  // ── AI optimize — calls real studio-optimize edge function ───────────────
  // Khi tối ưu xong: hiện NGAY bản tối ưu trong ô prompt để user xem trước.
  // "Áp dụng" → giữ bản tối ưu; "Bỏ qua" → khôi phục prompt trước đó.
  const [prevPrompt, setPrevPrompt] = useState("");
  const handleOptimize = async () => {
    if (!prompt.trim() || isOptimizing) return;
    setIsOptimizing(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/studio-optimize`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) }
      );
      const json = await res.json();
      if (json.optimized_prompt) {
        setPrevPrompt(prompt);                 // nhớ bản cũ để "Bỏ qua"
        setPrompt(json.optimized_prompt);      // hiện bản tối ưu lên ngay
        setShowOptimized(true);
      } else throw new Error(json.error ?? "Không có kết quả");
    } catch { setShowOptimized(false); } finally {
      setIsOptimizing(false);
    }
  };

  const curModel = models.find(m => m.id === selectedModel) ?? models[0];
  const selTools = ALL_TOOLS.filter(t => selectedTools.has(t.id));
  const selFiles = kbDocs.filter(f => selectedKB.has(f.id));
  // "Kết nối danh mục" là trạng thái SUY RA (derived), không phải cờ lưu riêng: bật khi và chỉ khi
  // mã agent đang theo dõi khớp CHÍNH XÁC với danh mục hiện tại. Bất kỳ thay đổi nào phá vỡ sự khớp
  // này (user thêm/xoá mã ở đây, hoặc thêm/xoá cổ phiếu trong danh mục ở nơi khác) đều tự động tắt nó,
  // tới khi user chủ động bấm "Kết nối danh mục" để đồng bộ lại.
  const isPortfolioConnected = portfolioSymbols.length > 0
    && watchlist.length === portfolioSymbols.length
    && watchlist.every(s => portfolioSymbols.includes(s));
  const allSymbols = watchlist;
  const totalMa = allSymbols.length;
  const displayTickers = allSymbols;

  // Tóm tắt điều kiện kích hoạt cho nút mở modal (Section "trigger") — cùng cấu trúc
  // icon + dòng chính + dòng phụ như nút "Công cụ phân tích" / "Mã quan tâm".
  const FREQ_LABEL: Record<typeof frequency, string> = { daily: "Mỗi ngày", weekdays: "Ngày giao dịch", weekly: "Hàng tuần", custom: "Tùy chọn" };
  const EVENT_LABEL: Record<typeof eventType, string> = { volume_spike: "Khối lượng đột biến", insider_buy: "Nội bộ/lãnh đạo mua", high_impact_news: "Tin tác động mạnh" };
  const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const TriggerIcon = triggerType === "manual" ? Play : triggerType === "event" ? Zap : Clock;
  const triggerSummary = (() => {
    if (triggerType === "manual") return { primary: "Thủ công", secondary: "Chỉ chạy khi bạn bấm Chạy thử — không tự động" };
    if (triggerType === "event") {
      const detail = eventType === "volume_spike" ? `Bội số TB20 ≥ ${eventMultiple} lần`
        : eventType === "insider_buy" ? `Trong ${eventDays} ngày gần nhất`
        : `Điểm tác động ≥ ${eventMinImpact}`;
      return { primary: `Theo sự kiện · ${EVENT_LABEL[eventType]}`, secondary: detail };
    }
    const daysStr = frequency === "daily" || frequency === "weekdays"
      ? FREQ_LABEL[frequency]
      : [...selectedDays].sort().map(d => DAY_LABELS[d]).join(", ") || "Chưa chọn ngày";
    return { primary: `Theo lịch · ${FREQ_LABEL[frequency]}`, secondary: `${scheduleTime} · ${daysStr}` };
  })();
  const notifyCount = 1 + (notifyEmail ? 1 : 0) + (notifyZalo ? 1 : 0);
  // Gợi ý mã: khớp tiền tố symbol HOẶC tên công ty; ẩn mã đã thêm; tối đa 8
  const symQuery = stockInput.trim().toUpperCase();
  const stockSuggestions = symQuery
    ? allTickers
        .filter(t => !allSymbols.includes(t.symbol) &&
          (t.symbol.startsWith(symQuery) || (t.name ?? "").toUpperCase().includes(symQuery)))
        .slice(0, 8)
    : [];

  // ── Phát hiện thay đổi chưa lưu ──────────────────────────────────────────
  const buildDraftSnapshot = () => JSON.stringify({
    agentName, agentDesc, prompt, selectedModel,
    selectedKB: [...selectedKB].sort(), selectedTools: [...selectedTools].sort(),
    watchlist: [...watchlist].sort(), newsSources: [...newsSources].sort(),
    triggerType, eventType, eventMultiple, eventDays, eventMinImpact,
    frequency, scheduleTime, selectedDays: [...selectedDays].sort(),
    notifyEmail, notifyZalo,
  });

  // Chụp lại "bản gốc" đúng 1 lần, ngay sau khi agent đã nạp xong (hoặc ngay lập tức với agent mới).
  useEffect(() => {
    if (agentLoaded && initialSnapshot === null) {
      setInitialSnapshot(buildDraftSnapshot());
    }
  });

  const isDirty = initialSnapshot !== null && buildDraftSnapshot() !== initialSnapshot;

  // Cảnh báo khi đóng tab / tải lại trang mà còn thay đổi chưa lưu
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Chặn điều hướng trong app (sidebar, breadcrumb…) khi còn thay đổi chưa lưu.
  // bypassBlockRef: khi handleSave() điều hướng sau lưu → BỎ chặn (tránh hiện nhầm modal "chưa lưu").
  const bypassBlockRef = useRef(false);
  const blocker = useBlocker(() => isDirty && !bypassBlockRef.current);

  const requestLeave = (action: () => void) => {
    if (isDirty) { leaveActionRef.current = action; setConfirmLeaveOpen(true); }
    else action();
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT, background: bgApp }}>

      {/* ── Top bar ── */}
      <div style={{ height: 52, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "0.5px solid " + divider, background: bgPanel, flexShrink: 0, zIndex: 10 }}>
        <button onClick={() => requestLeave(onBack)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: fgMuted, fontSize: 13, fontFamily: FONT }}>
          <ChevronLeft size={16} strokeWidth={1.5} /> Agents
        </button>
        <span style={{ color: isDark ? "rgba(255,255,255,0.20)" : "rgba(26,26,46,0.20)" }}>/</span>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bot size={16} color={brand} strokeWidth={1.5} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 240, gap: 0 }}>
          <input
            value={agentName}
            onChange={e => { setAgentName(e.target.value); setIsSaved(false); }}
            placeholder="Tên agent"
            style={{ border: "none", outline: "none", fontSize: 15, fontWeight: 700, color: fg, background: "transparent", fontFamily: FONT, padding: 0 }}
          />
          <input
            value={agentDesc}
            onChange={e => { setAgentDesc(e.target.value); setIsSaved(false); }}
            placeholder="Thêm mô tả ngắn cho agent (tùy chọn)"
            style={{ border: "none", outline: "none", fontSize: 11, fontWeight: 500, color: fgDisabled, background: "transparent", fontFamily: FONT, padding: 0, marginTop: 1 }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: fgDisabled }}>{selectedTools.size} tools · {selectedKB.size} KB · {watchlist.length} mã</span>
        <button
          onClick={handleRunTest}
          disabled={isRunning}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "0.5px solid " + (isDark ? "rgba(77,143,232,0.30)" : "rgba(8,73,172,0.25)"), background: bgPanel, color: brand, fontSize: 13, fontWeight: 600, cursor: isRunning ? "not-allowed" : "pointer", fontFamily: FONT, opacity: isRunning ? 0.6 : 1 }}>
          <Play size={13} strokeWidth={1.5} /> {isRunning ? "Đang chạy..." : "Chạy thử"}
        </button>
        <button
          onClick={handleSave}
          disabled={isSaved}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "none", background: isSaved ? "#34C759" : brand, color: "#fff", fontSize: 13, fontWeight: 700, cursor: isSaved ? "not-allowed" : "pointer", fontFamily: FONT }}>
          {isSaved ? <><CheckCircle2 size={13} strokeWidth={2} /> Đã lưu!</> : <><Save size={13} strokeWidth={1.5} /> Lưu Agent</>}
        </button>
      </div>

      {/* ── 3-column body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* ════════════ LEFT — Prompt ════════════ */}
        <div style={{ width: leftWidth, flexShrink: 0, background: bgPanel, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          <div style={{ padding: "12px 16px 10px", borderBottom: "0.5px solid " + divider, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: fg, letterSpacing: "0.04em" }}>PERSONA & PROMPT</div>
              <div style={{ fontSize: 11, color: fgDisabled, marginTop: 1 }}>{prompt.length} ký tự</div>
            </div>
            <button
              onClick={handleOptimize}
              disabled={isOptimizing}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, border: "none", background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.08)", color: brand, fontSize: 11, fontWeight: 700, cursor: isOptimizing ? "not-allowed" : "pointer", fontFamily: FONT }}
            >
              {isOptimizing
                ? <><RefreshCw size={11} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} /> Đang tối ưu...</>
                : <><Sparkles size={11} strokeWidth={1.5} /> Tối ưu với AI</>}
            </button>
          </div>

          {showOptimized && (
            <div style={{ padding: "10px 14px", background: isDark ? "rgba(77,143,232,0.08)" : "rgba(8,73,172,0.04)", borderBottom: "0.5px solid " + divider, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Sparkles size={12} color={brand} strokeWidth={1.5} />
                <span style={{ fontSize: 11, fontWeight: 700, color: brand }}>AI đã cải thiện prompt theo chuẩn tài chính, xem trước bên dưới</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setShowOptimized(false)} style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "none", background: brand, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Áp dụng</button>
                <button onClick={() => { setPrompt(prevPrompt); setShowOptimized(false); }} style={{ padding: "6px 10px", borderRadius: 7, border: "0.5px solid " + divider, background: "transparent", color: fgMuted, fontSize: 11, cursor: "pointer", fontFamily: FONT }}>Bỏ qua</button>
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={promptLoading}
            placeholder={promptLoading ? "Đang tải prompt…" : "Nhập persona & prompt cho agent…"}
            style={{ flex: 1, border: "none", outline: "none", resize: "none", padding: "14px 16px", fontSize: 12, lineHeight: 1.7, color: promptLoading ? fgDisabled : fg, background: bgPanel, fontFamily: FONT }}
          />

          <div style={{ padding: "8px 14px", borderTop: "0.5px solid " + dividerFaint, background: bgFaint, flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: fgDisabled, lineHeight: 1.6, display: "flex", alignItems: "center", gap: 5 }}>
              <Lightbulb size={10} strokeWidth={1.5} color={fgDisabled} />
              Cấu trúc tốt: <strong>Vai trò · Nhiệm vụ · Định dạng · Ràng buộc</strong>
            </div>
          </div>

          {/* Drag handle */}
          <div
            onMouseDown={startDragLeft}
            style={{ position: "absolute", top: 0, right: 0, width: 5, height: "100%", cursor: "col-resize", zIndex: 20, borderRight: "0.5px solid " + divider, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <div style={{ width: 3, height: 32, borderRadius: 99, background: isDark ? "rgba(255,255,255,0.12)" : "rgba(8,73,172,0.15)" }} />
          </div>
        </div>

        {/* ════════════ MIDDLE — Config ════════════ */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 0 80px", background: bgApp, minWidth: 0 }}>

          {/* Model */}
          <Section id="model" label="Model LLM" icon={<Sparkles size={14} strokeWidth={1.5} color={brand} />} open={openSections.has("model")} onToggle={() => toggleSection("model")} isDark={isDark}>
            <button
              onClick={() => setShowModelPicker(true)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, cursor: "pointer", border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.18)"), background: bgPanel, fontFamily: FONT }}
            >
              <ModelLogo provider={curModel.provider} size={36} uid={curModel.id} />
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: fg, marginBottom: 4 }}>{curModel.name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {curModel.tags.map(tag => (
                    <span key={tag} style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 5, background: isDark ? "rgba(255,255,255,0.09)" : "rgba(26,26,46,0.07)", color: fgMuted }}>{tag}</span>
                  ))}
                </div>
              </div>
              <ChevronDown size={14} color={fgDisabled} strokeWidth={1.5} />
            </button>
          </Section>

          {/* Knowledge Base — coming soon */}
          <Section id="kb" label="Knowledge Base" icon={<BookOpen size={14} strokeWidth={1.5} color={fgDisabled} />} open={openSections.has("kb")} onToggle={() => toggleSection("kb")} badge="Sắp ra mắt" badgeColor="gray" isDark={isDark}>
            <button
              onClick={() => setShowKBPicker(true)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, cursor: "not-allowed", border: "0.5px dashed " + (isDark ? "rgba(255,255,255,0.08)" : "rgba(26,26,46,0.12)"), background: isDark ? "rgba(255,255,255,0.02)" : "rgba(26,26,46,0.02)", fontFamily: FONT, opacity: 0.55 }}
              disabled
            >
              <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                {selFiles.slice(0, 3).map(f => <FileTypeTag key={f.id} type={f.file_type} size={32} />)}
              </div>
              <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: fgDisabled, marginBottom: 3 }}>
                  {selFiles.length > 0 ? `${selFiles.length} file đã chọn` : "Chưa có file nào"}
                </div>
                <div style={{ fontSize: 11, color: fgDisabled }}>Tính năng đang phát triển, sẽ ra mắt sớm</div>
              </div>
            </button>
          </Section>

          {/* Tools */}
          {/* Công cụ phân tích */}
          <Section id="tools" label="Công cụ phân tích" icon={<Wrench size={14} strokeWidth={1.5} color={brand} />} open={openSections.has("tools")} onToggle={() => toggleSection("tools")} badge={`${selectedTools.size}/${AVAILABLE_TOOLS_COUNT} công cụ`} isDark={isDark}>
            <button
              onClick={() => setShowToolsPicker(true)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, cursor: "pointer", border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.18)"), background: bgPanel, fontFamily: FONT }}
            >
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {selTools.slice(0, 5).map(t => {
                  const Icon = t.Icon;
                  return (
                    <div key={t.id} style={{ width: 30, height: 30, borderRadius: 8, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={14} color={brand} strokeWidth={1.5} />
                    </div>
                  );
                })}
                {selTools.length === 0 && (
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: isDark ? "rgba(255,255,255,0.07)" : "rgba(26,26,46,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Wrench size={14} color={fgDisabled} strokeWidth={1.5} />
                  </div>
                )}
              </div>
              <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: selTools.length > 0 ? fg : fgDisabled, marginBottom: 3 }}>{selTools.length}/{AVAILABLE_TOOLS_COUNT} công cụ đang bật</div>
                <div style={{ fontSize: 11, color: fgSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selTools.length > 0 ? selTools.slice(0, 4).map(t => t.name).join(" · ") + (selTools.length > 4 ? ` +${selTools.length - 4}` : "") : "Nhấn để chọn công cụ phân tích"}
                </div>
              </div>
              <ChevronDown size={14} color={fgDisabled} strokeWidth={1.5} />
            </button>
          </Section>

          {/* Mã quan tâm (tùy chọn) */}
          <Section id="watchlist" label="Mã quan tâm (tùy chọn)" icon={<TrendingUp size={14} strokeWidth={1.5} color={brand} />} open={openSections.has("watchlist")} onToggle={() => toggleSection("watchlist")} badge={`${totalMa} mã`} isDark={isDark}>
            <button
              onClick={() => setShowWatchlistPicker(true)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, cursor: "pointer", border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.18)"), background: bgPanel, fontFamily: FONT }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <TrendingUp size={18} color={brand} strokeWidth={1.5} />
              </div>
              <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: fg, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                  {totalMa} mã theo dõi
                  {isPortfolioConnected && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", color: brand, fontWeight: 700 }}>Danh mục</span>}
                </div>
                <div style={{ fontSize: 11, color: fgSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayTickers.slice(0, 6).join(" · ")}{displayTickers.length > 6 ? ` +${displayTickers.length - 6}` : ""}
                </div>
              </div>
              <ChevronDown size={14} color={fgDisabled} strokeWidth={1.5} />
            </button>
          </Section>

          {/* Điều kiện kích hoạt agent */}
          <Section id="trigger" label="Điều kiện kích hoạt agent" icon={<Clock size={14} strokeWidth={1.5} color={brand} />} open={openSections.has("trigger")} onToggle={() => toggleSection("trigger")} badge={triggerType === "manual" ? "Thủ công" : triggerType === "scheduled" ? scheduleTime : "Sự kiện"} isDark={isDark}>
            <button
              onClick={() => setShowTriggerPicker(true)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, cursor: "pointer", border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.18)"), background: bgPanel, fontFamily: FONT }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <TriggerIcon size={16} color={brand} strokeWidth={1.5} />
              </div>
              <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: fg, marginBottom: 3 }}>{triggerSummary.primary}</div>
                <div style={{ fontSize: 11, color: fgSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{triggerSummary.secondary}</div>
              </div>
              <ChevronDown size={14} color={fgDisabled} strokeWidth={1.5} />
            </button>
          </Section>

          {/* Phương thức thông báo — tách riêng khỏi điều kiện kích hoạt (chỉ 3 dòng bật/tắt,
              không cần picker modal như tools/watchlist, chỉ cần accordion riêng để đỡ dài trang) */}
          <Section id="notify" label="Phương thức thông báo" icon={<Bell size={14} strokeWidth={1.5} color={brand} />} open={openSections.has("notify")} onToggle={() => toggleSection("notify")} badge={`${notifyCount}/3 kênh`} isDark={isDark}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid " + (isDark ? "rgba(77,143,232,0.25)" : "rgba(8,73,172,0.20)"), background: isDark ? "rgba(77,143,232,0.08)" : "rgba(8,73,172,0.04)" }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Inbox size={16} color={brand} strokeWidth={1.5} /></div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: brand }}>Inbox Wealbee</div><div style={{ fontSize: 11, color: fgSubtle }}>Luôn bật, kết quả vào Inbox app</div></div>
                <div style={{ width: 36, height: 20, borderRadius: 99, background: brand, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 3px", flexShrink: 0 }}><div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff" }} /></div>
              </div>

              <div onClick={() => setNotifyEmail(v => !v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer", border: notifyEmail ? "1px solid " + (isDark ? "rgba(77,143,232,0.30)" : "rgba(8,73,172,0.25)") : "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.10)"), background: notifyEmail ? (isDark ? "rgba(77,143,232,0.06)" : "rgba(8,73,172,0.03)") : bgPanel, transition: "all 120ms ease" }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "#fff", border: "1px solid " + (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: notifyEmail ? 1 : 0.55, transition: "opacity 150ms ease" }}><GmailIcon size={20} /></div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: notifyEmail ? 700 : 400, color: fg }}>Email</div><div style={{ fontSize: 11, color: fgSubtle }}>{notifyEmail ? (userEmail || "email của bạn") : "Gửi brief qua email"}</div></div>
                <div style={{ width: 36, height: 20, borderRadius: 99, flexShrink: 0, background: notifyEmail ? brand : isDark ? "rgba(255,255,255,0.18)" : "rgba(26,26,46,0.18)", display: "flex", alignItems: "center", justifyContent: notifyEmail ? "flex-end" : "flex-start", padding: "0 3px", transition: "all 200ms ease" }}><div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} /></div>
              </div>

              <div onClick={() => setNotifyZalo(v => !v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer", border: notifyZalo ? "1px solid rgba(0,120,255,0.30)" : "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.10)"), background: notifyZalo ? "rgba(0,120,255,0.04)" : bgPanel, transition: "all 120ms ease" }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: "#fff", border: "1px solid " + (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"), display: "flex", alignItems: "center", justifyContent: "center", opacity: notifyZalo ? 1 : 0.55, transition: "opacity 150ms ease" }}>
                  <ZaloWordmark size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: notifyZalo ? 700 : 400, color: fg, display: "flex", alignItems: "center", gap: 5 }}>Zalo Bot {notifyZalo && zaloLinkName === null && <span style={{ fontSize: 10, background: "rgba(0,120,255,0.10)", color: "#0068FF", padding: "1px 6px", borderRadius: 6, fontWeight: 600 }}>Cần kết nối</span>}</div>
                  <div style={{ fontSize: 11, color: fgSubtle }}>Nhận brief qua tin nhắn bot Zalo của Wealbee</div>
                </div>
                <div style={{ width: 36, height: 20, borderRadius: 99, flexShrink: 0, background: notifyZalo ? "#0068FF" : "rgba(26,26,46,0.18)", display: "flex", alignItems: "center", justifyContent: notifyZalo ? "flex-end" : "flex-start", padding: "0 3px", transition: "all 200ms ease" }}><div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} /></div>
              </div>

              {notifyZalo && (
                zaloLinkName !== null ? (
                  /* Đã kết nối → confirm */
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(26,168,95,0.07)", border: "0.5px solid rgba(26,168,95,0.25)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#1a7a3a", fontWeight: 700 }}>
                      <Check size={12} strokeWidth={2.5} color="#1a7a3a" /> Đã kết nối Zalo{zaloLinkName ? ` · ${zaloLinkName}` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: fgSubtle, lineHeight: 1.5, marginTop: 2 }}>Agent này sẽ gửi brief về Zalo của bạn sau mỗi lần chạy.</div>
                  </div>
                ) : !zaloConnecting ? (
                  /* Chưa kết nối → nhắc + nút mở card inline */
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(0,120,255,0.05)", border: "0.5px solid rgba(0,120,255,0.15)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#0068FF", fontWeight: 700, marginBottom: 3 }}>
                      <Settings size={11} strokeWidth={1.5} color="#0068FF" /> Chưa kết nối Zalo
                    </div>
                    <div style={{ fontSize: 11, color: fgSubtle, lineHeight: 1.5, marginBottom: 6 }}>Bạn cần liên kết tài khoản với bot Zalo của Wealbee thì agent mới gửi được thông báo.</div>
                    <button type="button" onClick={startZaloConnect}
                      style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: "#0068FF", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                      Kết nối Zalo ngay
                    </button>
                  </div>
                ) : (
                  /* Card kết nối inline: mở bot + gửi mã, không rời trang */
                  <div style={{ padding: 12, borderRadius: 10, background: "rgba(0,120,255,0.05)", border: "1px solid rgba(0,120,255,0.20)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: fg, marginBottom: 6 }}>Bước 1 — Mở bot & Bước 2 — gửi mã dưới đây</div>
                      <a href={ZALO_BOT_LINK} target="_blank" rel="noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "#0068FF", color: "#fff", fontSize: 11.5, fontWeight: 700, textDecoration: "none", fontFamily: FONT, marginBottom: 8 }}>
                        <MessageCircle size={13} /> Mở Bot Wealbee
                      </a>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, fontFamily: "monospace", fontSize: 20, fontWeight: 800, letterSpacing: "0.14em", color: "#0068FF", textAlign: "center", background: bgPanel, borderRadius: 8, padding: "7px 0", border: "1px dashed rgba(0,120,255,0.4)" }}>
                          {zaloCode ?? "……"}
                        </div>
                        {zaloCode && (
                          <button type="button" onClick={() => { navigator.clipboard.writeText(zaloCode); setZaloCopied(true); setTimeout(() => setZaloCopied(false), 1500); }}
                            title="Sao chép" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, border: "0.5px solid " + divider, background: "transparent", cursor: "pointer", color: fg }}>
                            {zaloCopied ? <Check size={16} color="#1a7a3a" /> : <Copy size={16} />}
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: fgSubtle, margin: "5px 0 8px" }}>Mã hết hạn sau 15 phút · trên máy tính quét QR bên phải</div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <button type="button" onClick={refreshZaloLink} disabled={zaloBusy}
                          style={{ padding: "6px 12px", borderRadius: 7, border: "none", background: "#1a7a3a", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 5 }}>
                          <Check size={13} /> Đã gửi, kiểm tra
                        </button>
                        <button type="button" onClick={() => { setZaloConnecting(false); setZaloCode(null); }}
                          style={{ padding: "6px 4px", border: "none", background: "transparent", color: fgSubtle, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
                          Đóng
                        </button>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ background: "#fff", borderRadius: 8, padding: 6, border: "0.5px solid " + divider }}>
                        <img src={ZALO_BOT_QR} alt="QR Bot Wealbee" width={104} height={104} style={{ display: "block" }} />
                      </div>
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: fgSubtle, textAlign: "center", maxWidth: 116 }}>Quét bằng camera Zalo</span>
                    </div>
                  </div>
                )
              )}
            </div>
          </Section>
        </div>

        {/* ════════════ RIGHT — Preview / History ════════════ */}
        <div style={{ width: rightWidth, flexShrink: 0, borderLeft: "0.5px solid " + divider, background: bgPanel, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          {/* Drag handle */}
          <div onMouseDown={startDragRight} style={{ position: "absolute", top: 0, left: 0, width: 5, height: "100%", cursor: "col-resize", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 3, height: 32, borderRadius: 99, background: isDark ? "rgba(255,255,255,0.12)" : "rgba(8,73,172,0.15)" }} />
          </div>

          {/* Tab header */}
          <div style={{ padding: "8px 16px 0 20px", borderBottom: "0.5px solid " + divider, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {(["preview", "history"] as const).map(tab => (
              <button key={tab} onClick={() => setRightTab(tab)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px 8px", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: FONT, color: rightTab === tab ? brand : fgMuted, borderBottom: rightTab === tab ? `2px solid ${brand}` : "2px solid transparent", transition: "color 100ms" }}>
                {tab === "preview"
                  ? <><Eye size={12} strokeWidth={1.5} /> PREVIEW</>
                  : <><History size={12} strokeWidth={1.5} /> LỊCH SỬ {sessions.length > 0 && <span style={{ background: brand, color: "#fff", borderRadius: 99, fontSize: 10, padding: "0 5px", fontWeight: 700 }}>{sessions.length}</span>}</>
                }
              </button>
            ))}
            {rightTab === "preview" && (runResult || runResultText) && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <span style={{ fontSize: 10, color: fgDisabled }}>{runTime}s</span>
                <span style={{ fontSize: 10, color: fgDisabled }}>{runTokens.toLocaleString()} tok</span>
              </div>
            )}
          </div>

          {/* History tab */}
          {rightTab === "history" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {sessionsLoading && <div style={{ textAlign: "center", padding: 24, fontSize: 12, color: fgDisabled }}>Đang tải...</div>}
              {!sessionsLoading && sessions.length === 0 && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24, textAlign: "center" }}>
                  <History size={32} color={isDark ? "rgba(77,143,232,0.30)" : "rgba(8,73,172,0.20)"} strokeWidth={1.5} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: fg }}>Chưa có lịch sử</div>
                  <div style={{ fontSize: 12, color: fgSubtle, lineHeight: 1.6 }}>Mỗi lần bấm <strong>Chạy thử</strong> sẽ được lưu lại tại đây.</div>
                </div>
              )}
              {!sessionsLoading && sessions.map(s => {
                const isSuccess = s.status === "success";
                const dt = new Date(s.created_at);
                const label = dt.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) + " " + dt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
                const handleViewSession = () => {
                  if (!isSuccess || !s.output) return;
                  let briefOutput: BriefOutput | null = null;
                  let textOutput: string | null = null;
                  if (s.template_id === "daily_digest") {
                    try { briefOutput = JSON.parse(s.output); if (typeof briefOutput !== "object" || !briefOutput || !("sections" in briefOutput)) { briefOutput = null; textOutput = s.output; } }
                    catch { textOutput = s.output; }
                  } else { textOutput = s.output; }
                  if (briefOutput) { setRunResult(briefOutput); setRunResultText(null); }
                  else { setRunResultText(textOutput); setRunResult(null); }
                  setRunResultRefs([]);
                  setRunTokens(s.tokens_used ?? 0);
                  setRunTime(s.run_time_s ?? 0);
                  setViewingSessionLabel(label);
                  if (s.config) { if (s.config.systemPrompt != null) setPrompt(s.config.systemPrompt); if (s.config.model) setSelectedModel(s.config.model); if (s.config.tools) setSelectedTools(new Set(s.config.tools)); if (s.config.watchSymbols) setWatchlist(s.config.watchSymbols); }
                  setRightTab("preview");
                };
                return (
                  <div key={s.id} onClick={handleViewSession} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.08)" : "rgba(8,73,172,0.10)"), background: bgPanel, cursor: isSuccess && s.output ? "pointer" : "default", transition: "border-color 120ms" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: isSuccess ? "#34C759" : "#FF3B30", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: isSuccess ? fg : fgMuted, flex: 1 }}>{label}</span>
                    <span style={{ fontSize: 10, color: fgDisabled }}>{s.run_time_s}s · {(s.tokens_used ?? 0).toLocaleString()} tok</span>
                    {isSuccess && s.output && <span style={{ fontSize: 10, color: brand, marginLeft: 4, fontWeight: 600 }}>→</span>}
                  </div>
                );
              })}
              {sessionsHasMore && (
                <button
                  onClick={loadMoreSessions}
                  disabled={sessionsLoadingMore}
                  style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.10)" : "rgba(8,73,172,0.15)"), background: "none", color: brand, fontSize: 12, fontWeight: 600, cursor: sessionsLoadingMore ? "not-allowed" : "pointer", fontFamily: FONT, opacity: sessionsLoadingMore ? 0.6 : 1 }}>
                  {sessionsLoadingMore ? "Đang tải..." : "Xem thêm"}
                </button>
              )}
            </div>
          )}

          {/* Preview tab */}
          {rightTab === "preview" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {!isRunning && !runResult && !runResultText && !runError && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 12, padding: 24 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Play size={26} color={isDark ? "rgba(77,143,232,0.50)" : "rgba(8,73,172,0.35)"} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: fg }}>Chưa có kết quả</p>
                    <p style={{ margin: 0, fontSize: 12, color: fgSubtle, lineHeight: 1.6 }}>Nhấn <strong>Chạy thử</strong> để kiểm tra agent với cấu hình hiện tại trước khi lưu.</p>
                  </div>
                  <button onClick={handleRunTest} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 10, border: "none", background: brand, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                    <Play size={14} strokeWidth={1.5} /> Chạy thử ngay
                  </button>
                </div>
              )}
              {isRunning && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
                  <div style={{ display: "flex", gap: 6 }}>{[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: brand, opacity: 0.6, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}</div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: fg }}>Đang chạy thử...</p>
                    <p style={{ margin: 0, fontSize: 11, color: fgSubtle }}>Gọi {selectedTools.size} tools · {watchlist.length} mã</p>
                  </div>
                  <div style={{ width: "100%", background: bgMuted, borderRadius: 8, overflow: "hidden" }}>
                    {["Lấy dữ liệu thị trường", "Kiểm tra danh mục", "Đọc tin tức", "Tổng hợp AI..."].map((step, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: i < 3 ? "0.5px solid " + dividerFaint : "none" }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: i < 2 ? "#34C759" : brand, opacity: i < 2 ? 1 : 0.5 }} />
                        <span style={{ fontSize: 11, color: i < 2 ? fg : fgSubtle }}>{step}</span>
                        {i < 2 && <Check size={11} color="#34C759" strokeWidth={2.5} style={{ marginLeft: "auto" }} />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {runError && !isRunning && (
                <div style={{ padding: "12px 14px", borderRadius: 9, background: "rgba(255,59,48,0.07)", border: "0.5px solid rgba(255,59,48,0.25)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <AlertTriangle size={13} color="#FF3B30" strokeWidth={2} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#c0392b" }}>Lỗi khi chạy thử</span>
                  </div>
                  <span style={{ fontSize: 11, color: fgMuted }}>{runError}</span>
                </div>
              )}
              {(runResult || runResultText) && !isRunning && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, background: viewingSessionLabel ? (isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.06)") : "rgba(52,199,89,0.08)", border: "0.5px solid " + (viewingSessionLabel ? (isDark ? "rgba(77,143,232,0.25)" : "rgba(8,73,172,0.18)") : "rgba(52,199,89,0.20)"), flexShrink: 0 }}>
                    {viewingSessionLabel ? <History size={13} color={brand} strokeWidth={2} /> : <CheckCircle2 size={14} color="#34C759" strokeWidth={2} />}
                    <span style={{ fontSize: 12, fontWeight: 700, color: viewingSessionLabel ? brand : "#1a7a3a" }}>{viewingSessionLabel ? `Lịch sử · ${viewingSessionLabel}` : "Chạy thử thành công"}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: fgDisabled }}>{runTime}s · {runTokens.toLocaleString()} tok</span>
                    {viewingSessionLabel && <button onClick={() => { setRunResult(null); setRunResultText(null); setViewingSessionLabel(null); }} style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", color: fgMuted, fontSize: 11, fontWeight: 600, fontFamily: FONT, padding: "2px 4px" }}>✕</button>}
                  </div>
                  <div style={{ background: bgMuted, borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>OUTPUT MẪU</div>
                    {runResult && <BriefRenderer brief={runResult} isDark={isDark} />}
                    {runResultText && <RichContent text={runResultText} refs={runResultRefs} />}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, flexShrink: 0 }}>
                    {[{ label: "Thời gian", value: `${runTime}s` }, { label: "Tokens", value: runTokens.toLocaleString() }, { label: "Tools gọi", value: `${selectedTools.size}` }].map(s => (
                      <div key={s.label} style={{ background: bgMuted, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: brand }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: fgSubtle, marginTop: 1 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Save button */}
          <div style={{ padding: "12px 14px", borderTop: "0.5px solid " + divider, flexShrink: 0 }}>
            <button onClick={handleSave} disabled={isSaved} style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: isSaved ? "#34C759" : brand, color: "#fff", fontSize: 14, fontWeight: 700, cursor: isSaved ? "not-allowed" : "pointer", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background 200ms ease" }}>
              {isSaved ? <><CheckCircle2 size={16} strokeWidth={2} /> Agent đã lưu!</> : <><Save size={15} strokeWidth={1.5} /> Lưu Agent</>}
            </button>
            {!isSaved && (
              <p style={{ margin: "6px 0 0", fontSize: 10, color: fgDisabled, textAlign: "center", fontFamily: FONT }}>Agent sẽ bắt đầu chạy theo lịch sau khi lưu</p>
            )}
          </div>
        </div>
      </div>

      {/* ════════ SETUP MODAL — tên + mô tả (chỉ khi tạo mới) ════════ */}
      {needsSetup && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: FONT }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: "100%", borderRadius: 16, overflow: "hidden", background: bgPanel, boxShadow: "0 24px 80px rgba(0,0,0,0.22), 0 0 0 0.5px " + divider }}>
            {/* header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "0.5px solid " + divider }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: brand + "1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles style={{ width: 16, height: 16, color: brand }} />
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: fg }}>Tạo Agent mới</span>
              </div>
              <button onClick={onBack} aria-label="Đóng" style={{ background: "none", border: "none", cursor: "pointer", color: fgMuted, display: "flex", padding: 2 }}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>
            {/* body */}
            <div style={{ padding: 22 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: fg, marginBottom: 8 }}>
                Tên Agent <span style={{ color: "#e0524d" }}>*</span>
              </label>
              <div style={{ position: "relative", marginBottom: 20 }}>
                <input
                  value={agentName}
                  onChange={e => setAgentName(e.target.value.slice(0, 40))}
                  placeholder="Đặt tên ngắn gọn, dễ nhận biết"
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter" && agentName.trim()) setNeedsSetup(false); }}
                  style={{ width: "100%", boxSizing: "border-box", padding: "11px 54px 11px 14px", borderRadius: 10, border: "1px solid " + inputBorder, background: bgMuted, color: fg, fontSize: 14, fontFamily: FONT, outline: "none" }}
                />
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: fgSubtle }}>{agentName.length}/40</span>
              </div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: fg, marginBottom: 8 }}>
                Mô tả chức năng <span style={{ fontSize: 12, fontWeight: 600, color: fgSubtle }}>(tùy chọn)</span>
              </label>
              <div style={{ position: "relative" }}>
                <textarea
                  value={agentDesc}
                  onChange={e => setAgentDesc(e.target.value.slice(0, 800))}
                  placeholder="Giới thiệu ngắn về chức năng của agent, hiển thị cho người dùng."
                  rows={4}
                  style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px 24px", borderRadius: 10, border: "1px solid " + inputBorder, background: bgMuted, color: fg, fontSize: 14, fontFamily: FONT, outline: "none", resize: "vertical", lineHeight: 1.5 }}
                />
                <span style={{ position: "absolute", right: 12, bottom: 12, fontSize: 11, color: fgSubtle }}>{agentDesc.length}/800</span>
              </div>
            </div>
            {/* footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px", borderTop: "0.5px solid " + divider }}>
              <button onClick={onBack} style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid " + inputBorder, background: "transparent", color: fgMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Huỷ</button>
              <button
                onClick={() => agentName.trim() && setNeedsSetup(false)}
                disabled={!agentName.trim()}
                style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: agentName.trim() ? brand : (isDark ? "rgba(255,255,255,0.12)" : "#e5e7eb"), color: agentName.trim() ? "#fff" : fgDisabled, fontSize: 13, fontWeight: 700, cursor: agentName.trim() ? "pointer" : "not-allowed", fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}>
                Tiếp tục <ArrowRight style={{ width: 15, height: 15 }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ XÁC NHẬN RỜI TRANG KHI CHƯA LƯU ════════ */}
      {(confirmLeaveOpen || blocker.state === "blocked") && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: FONT }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: "100%", borderRadius: 16, overflow: "hidden", background: bgPanel, boxShadow: "0 24px 80px rgba(0,0,0,0.22), 0 0 0 0.5px " + divider }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 22px", borderBottom: "0.5px solid " + divider }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,149,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle style={{ width: 16, height: 16, color: "#FF9500" }} />
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: fg }}>Thay đổi chưa được lưu</span>
            </div>
            <div style={{ padding: 22, fontSize: 13.5, color: fgMuted, lineHeight: 1.6 }}>
              Bạn vừa thay đổi cấu hình agent này nhưng chưa bấm "Lưu Agent". Nếu rời khỏi trang bây giờ, các thay đổi vừa rồi sẽ bị xoá.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px", borderTop: "0.5px solid " + divider }}>
              <button
                onClick={() => { setConfirmLeaveOpen(false); if (blocker.state === "blocked") blocker.reset(); }}
                style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid " + inputBorder, background: "transparent", color: fgMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
                Tiếp tục chỉnh sửa
              </button>
              <button
                onClick={() => { setConfirmLeaveOpen(false); if (blocker.state === "blocked") blocker.proceed(); else leaveActionRef.current(); }}
                style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: "#e0524d", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                Rời khỏi, xoá thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODEL PICKER MODAL ════════ */}
      {showModelPicker && (() => {
        const lower = modelSearch.toLowerCase();
        const filtered = models.filter(m => !modelSearch || m.name.toLowerCase().includes(lower) || m.provider.toLowerCase().includes(lower));
        const close = () => { setShowModelPicker(false); setModelSearch(""); };
        return (
          <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 640, maxHeight: "78vh", borderRadius: 16, overflow: "hidden", background: bgPanel, display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.22), 0 0 0 0.5px " + divider }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 14px", borderBottom: "0.5px solid " + divider, flexShrink: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: fg, flex: 1 }}>Model selection</span>
                <button onClick={close} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer" }}><X size={16} color={fgMuted} strokeWidth={1.5} /></button>
              </div>
              <div style={{ padding: "10px 16px", borderBottom: "0.5px solid " + divider, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 9, background: bgMuted, border: "0.5px solid " + divider }}>
                  <Search size={13} color={fgDisabled} strokeWidth={1.5} />
                  <input autoFocus value={modelSearch} onChange={e => setModelSearch(e.target.value)} placeholder="Tìm model..." style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: fg, fontFamily: FONT }} />
                  {modelSearch && <button onClick={() => setModelSearch("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}><X size={12} color={fgDisabled} strokeWidth={2} /></button>}
                </div>
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {MODEL_GROUPS.map(group => {
                  const groupModels = group.ids.map(id => models.find(m => m.id === id)!).filter(m => m && filtered.includes(m));
                  if (groupModels.length === 0) return null;
                  return (
                    <div key={group.provider}>
                      <div style={{ padding: "10px 20px 4px", fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.06em" }}>{group.provider}</div>
                      {groupModels.map((m, idx) => {
                        const sel = selectedModel === m.id;
                        const disabled = !m.available;
                        return (
                          <div key={m.id} onClick={() => { if (!disabled) { setSelectedModel(m.id); close(); } }} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", cursor: disabled ? "default" : "pointer", background: sel ? (isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.05)") : "transparent", borderBottom: idx < groupModels.length - 1 ? "0.5px solid " + dividerFaint : "none", transition: "background 80ms", opacity: disabled ? 0.42 : 1 }}>
                            <ModelLogo provider={m.provider} size={44} uid={m.id} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: sel ? brand : fg }}>{m.name}</span>
                                {sel && <Check size={13} color={brand} strokeWidth={2.5} />}
                                {disabled && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(26,26,46,0.07)", color: fgDisabled }}>{(m as any).disabledReason ?? "Sắp tích hợp"}</span>}
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                                {m.tags.map(tag => <span key={tag} style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: isDark ? "rgba(255,255,255,0.09)" : "rgba(26,26,46,0.07)", color: fgMuted }}>{tag}</span>)}
                              </div>
                              <div style={{ fontSize: 12, color: fgSubtle, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.desc}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: fgDisabled, fontSize: 13 }}>Không tìm thấy model nào</div>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ════════ TOOLS PICKER MODAL ════════ */}
      {showToolsPicker && (() => {
        const lower = toolsSearch.toLowerCase();
        const close = () => { setShowToolsPicker(false); setToolsSearch(""); };
        return (
          <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 620, maxHeight: "80vh", borderRadius: 16, overflow: "hidden", background: bgPanel, display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.22), 0 0 0 0.5px " + divider }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 14px", borderBottom: "0.5px solid " + divider, flexShrink: 0 }}>
                <Wrench size={16} color={brand} strokeWidth={1.5} />
                <span style={{ fontSize: 16, fontWeight: 700, color: fg, flex: 1 }}>Công cụ phân tích</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.10)", color: brand }}>{selectedTools.size}/{AVAILABLE_TOOLS_COUNT} đang bật</span>
                <button onClick={() => { if (selectedTools.size === AVAILABLE_TOOLS_COUNT) setSelectedTools(new Set()); else setSelectedTools(new Set(ALL_TOOLS.filter(t => t.available).map(t => t.id))); }} style={{ padding: "5px 12px", borderRadius: 7, border: "0.5px solid " + divider, background: "transparent", color: brand, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  {selectedTools.size === AVAILABLE_TOOLS_COUNT ? "Tắt tất cả" : "Bật tất cả"}
                </button>
                <button onClick={close} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer" }}><X size={16} color={fgMuted} strokeWidth={1.5} /></button>
              </div>
              <div style={{ padding: "10px 16px", borderBottom: "0.5px solid " + divider, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 9, background: bgMuted, border: "0.5px solid " + divider }}>
                  <Search size={13} color={fgDisabled} strokeWidth={1.5} />
                  <input autoFocus value={toolsSearch} onChange={e => setToolsSearch(e.target.value)} placeholder="Tìm công cụ..." style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: fg, fontFamily: FONT }} />
                  {toolsSearch && <button onClick={() => setToolsSearch("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}><X size={12} color={fgDisabled} strokeWidth={2} /></button>}
                </div>
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {TOOL_GROUPS.map(group => {
                  const groupTools = group.tools.filter(t => t.available && (!toolsSearch || t.name.toLowerCase().includes(lower) || t.desc.toLowerCase().includes(lower) || group.category.toLowerCase().includes(lower)));
                  if (groupTools.length === 0) return null;
                  return (
                    <div key={group.id}>
                      <div style={{ padding: "10px 20px 4px", fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.06em" }}>{group.category}</div>
                      {groupTools.map((t, idx) => {
                        const Icon = t.Icon;
                        const sel = selectedTools.has(t.id);
                        const expanded = expandedTools.has(t.id);
                        const needsExpand = t.desc.length > 100;
                        return (
                          <div key={t.id} style={{ borderBottom: idx < groupTools.length - 1 ? "0.5px solid " + dividerFaint : "none" }}>
                            <div onClick={() => toggleTool(t.id)} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 20px", cursor: "pointer", background: sel ? (isDark ? "rgba(255,255,255,0.045)" : "rgba(26,26,46,0.03)") : "transparent", transition: "background 80ms" }}>
                              <div style={{ width: 44, height: 44, borderRadius: 12, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                                <Icon size={20} color={brand} strokeWidth={1.5} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 3, display: "flex", alignItems: "center", gap: 7 }}>
                                  {t.name}
                                </div>
                                {t.includes?.length > 0 && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 7 }}>
                                    {t.includes.map(inc => (
                                      <span key={inc} style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)", color: brand }}>
                                        {inc}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div style={{
                                  fontSize: 12, color: fgSubtle, lineHeight: 1.5,
                                  ...(expanded ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }),
                                }}>
                                  {t.desc}
                                </div>
                                {needsExpand && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedTools(prev => {
                                        const next = new Set(prev);
                                        next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                                        return next;
                                      });
                                    }}
                                    style={{ marginTop: 3, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 700, color: brand, fontFamily: FONT }}
                                  >
                                    {expanded ? "Thu gọn" : "Xem thêm"}
                                  </button>
                                )}
                              </div>
                              <div style={{ width: 40, height: 22, borderRadius: 99, flexShrink: 0, background: sel ? brand : isDark ? "rgba(255,255,255,0.12)" : "rgba(26,26,46,0.12)", display: "flex", alignItems: "center", justifyContent: sel ? "flex-end" : "flex-start", padding: "0 3px", transition: "all 200ms ease", marginTop: 2 }}>
                                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.20)" }} />
                              </div>
                            </div>
                            {/* News source picker, chỉ hiện với news_feed khi đang bật */}
                            {t.id === "news_feed" && sel && availableNewsSources.length > 0 && (
                              <div onClick={e => e.stopPropagation()} style={{ margin: "0 20px 14px", padding: "12px 14px", borderRadius: 10, background: isDark ? "rgba(255,152,0,0.06)" : "rgba(255,152,0,0.05)", border: "0.5px solid rgba(255,152,0,0.20)" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#FF9500", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                                  Nguồn tin tức
                                  <span style={{ fontWeight: 500, color: fgDisabled, textTransform: "none", letterSpacing: 0, marginLeft: 6 }}>
                                    {newsSources.length === 0 ? "(tất cả nguồn)" : `(${newsSources.length} nguồn đã chọn)`}
                                  </span>
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                                  {availableNewsSources.map(src => {
                                    const active = newsSources.includes(src.id);
                                    return (
                                      <div key={src.id} onClick={() => setNewsSources(prev =>
                                        active ? prev.filter(s => s !== src.id) : [...prev, src.id]
                                      )} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8, cursor: "pointer", border: active ? "1px solid rgba(255,152,0,0.5)" : "0.5px solid " + divider, background: active ? "rgba(255,152,0,0.12)" : isDark ? "rgba(255,255,255,0.04)" : "rgba(26,26,46,0.03)", transition: "all 120ms" }}>
                                        <div style={{ width: 14, height: 14, borderRadius: 4, border: active ? "none" : "1.5px solid " + fgDisabled, background: active ? "#FF9500" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 120ms" }}>
                                          {active && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                        </div>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: active ? "#FF9500" : fg }}>{src.label}</span>
                                        <span style={{ fontSize: 10, color: fgDisabled }}>{src.count}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                                {newsSources.length > 0 && (
                                  <div onClick={() => setNewsSources([])} style={{ marginTop: 8, fontSize: 11, color: fgDisabled, cursor: "pointer", textDecoration: "underline" }}>Bỏ chọn tất cả (lấy từ tất cả nguồn)</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ════════ WATCHLIST PICKER MODAL ════════ */}
      {showWatchlistPicker && (
        <div onClick={() => setShowWatchlistPicker(false)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 520, maxHeight: "80vh", borderRadius: 16, overflow: "hidden", background: bgPanel, display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.22), 0 0 0 0.5px " + divider }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 14px", borderBottom: "0.5px solid " + divider, flexShrink: 0 }}>
              <TrendingUp size={16} color={brand} strokeWidth={1.5} />
              <span style={{ fontSize: 16, fontWeight: 700, color: fg, flex: 1 }}>Theo dõi thị trường</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.10)", color: brand }}>{totalMa} mã</span>
              <button onClick={() => setShowWatchlistPicker(false)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer" }}><X size={16} color={fgMuted} strokeWidth={1.5} /></button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              <div style={{ padding: "14px 20px", borderBottom: "0.5px solid " + divider }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Kết nối danh mục</div>
                <div onClick={() => {
                  if (!portfolioSymbols.length) return;
                  // Bấm khi ĐANG kết nối → ngắt kết nối, xoá sạch để user tự chọn lại từ đầu.
                  // Bấm khi CHƯA kết nối → đồng bộ chủ động: mã theo dõi chuyển hẳn về đúng mã trong danh mục.
                  setWatchlist(isPortfolioConnected ? [] : portfolioSymbols);
                }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, cursor: portfolioSymbols.length > 0 ? "pointer" : "default", border: isPortfolioConnected ? "1px solid " + (isDark ? "rgba(77,143,232,0.35)" : "rgba(8,73,172,0.30)") : "0.5px solid " + divider, background: isPortfolioConnected ? (isDark ? "rgba(77,143,232,0.08)" : "rgba(8,73,172,0.05)") : bgMuted, transition: "all 120ms", opacity: portfolioSymbols.length === 0 ? 0.45 : 1 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: isPortfolioConnected ? (isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)") : isDark ? "rgba(255,255,255,0.07)" : "rgba(26,26,46,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><TrendingUp size={18} color={isPortfolioConnected ? brand : fgDisabled} strokeWidth={1.5} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isPortfolioConnected ? brand : fg }}>Kết nối danh mục hiện tại</div>
                    <div style={{ fontSize: 11, color: fgSubtle, marginTop: 2 }}>
                      {portfolioSymbols.length > 0 ? `${portfolioSymbols.join(" · ")} (${portfolioSymbols.length} mã)` : "Chưa có danh mục, thêm mã bên dưới"}
                    </div>
                  </div>
                  <div style={{ width: 40, height: 22, borderRadius: 99, background: isPortfolioConnected ? brand : isDark ? "rgba(255,255,255,0.15)" : "rgba(26,26,46,0.15)", display: "flex", alignItems: "center", justifyContent: isPortfolioConnected ? "flex-end" : "flex-start", padding: "0 3px", transition: "all 200ms", flexShrink: 0 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.20)" }} />
                  </div>
                </div>
              </div>
              <div style={{ padding: "14px 20px", borderBottom: watchlist.length > 0 ? "0.5px solid " + divider : "none" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Thêm mã theo dõi</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, position: "relative" }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 9, background: bgMuted, border: "0.5px solid " + (stockSuggestions.length ? brand : divider) }}>
                    <Search size={13} color={fgDisabled} strokeWidth={1.5} />
                    <input value={stockInput} onChange={e => setStockInput(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === "Enter") addStock(stockSuggestions[0]?.symbol ?? stockInput); }} placeholder="Gõ mã hoặc tên công ty…" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: fg, fontFamily: FONT }} />
                  </div>
                  <button onClick={() => addStock(stockSuggestions[0]?.symbol ?? stockInput)} style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: brand, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 5 }}><Plus size={14} strokeWidth={2.5} /></button>
                  {stockSuggestions.length > 0 && (
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30, background: bgPanel, border: "0.5px solid " + divider, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.16)", overflow: "hidden", maxHeight: 264, overflowY: "auto" }}>
                      {stockSuggestions.map(t => (
                        <div key={t.symbol} onMouseDown={e => { e.preventDefault(); addStock(t.symbol); }}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", cursor: "pointer", borderBottom: "0.5px solid " + dividerFaint }}
                          onMouseEnter={e => (e.currentTarget.style.background = bgMuted)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: brand, minWidth: 46, flexShrink: 0 }}>{t.symbol}</span>
                          <span style={{ fontSize: 12, color: fgMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {POPULAR_STOCKS.filter(s => !allSymbols.includes(s)).map(s => (
                    <span key={s} onClick={() => setWatchlist(p => [...p, s])} style={{ padding: "5px 12px", borderRadius: 99, border: "0.5px dashed " + brand, fontSize: 12, fontWeight: 600, color: brand, cursor: "pointer" }}>+ {s}</span>
                  ))}
                </div>
              </div>
              {allSymbols.length > 0 && (
                <div style={{ padding: "14px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Đang theo dõi ({allSymbols.length})</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {watchlist.map(sym => (
                      <span key={sym} style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "6px 10px 6px 14px", borderRadius: 99,
                        background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.08)",
                        fontSize: 13, fontWeight: 700, color: brand,
                      }}>
                        {sym}
                        <button onClick={() => setWatchlist(p => p.filter(s => s !== sym))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}><X size={11} color={brand} strokeWidth={2.5} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════ TRIGGER PICKER MODAL ════════ */}
      {showTriggerPicker && (
        <div onClick={() => setShowTriggerPicker(false)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 480, maxHeight: "80vh", borderRadius: 16, overflow: "hidden", background: bgPanel, display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.22), 0 0 0 0.5px " + divider }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 14px", borderBottom: "0.5px solid " + divider, flexShrink: 0 }}>
              <Clock size={16} color={brand} strokeWidth={1.5} />
              <span style={{ fontSize: 16, fontWeight: 700, color: fg, flex: 1 }}>Điều kiện kích hoạt agent</span>
              <button onClick={() => setShowTriggerPicker(false)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer" }}><X size={16} color={fgMuted} strokeWidth={1.5} /></button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px" }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {([
                  { id: "manual", label: "Thủ công", Icon: Play },
                  { id: "scheduled", label: "Theo lịch", Icon: Clock },
                  { id: "event", label: "Theo sự kiện", Icon: Zap },
                ] as const).map(o => {
                  const active = triggerType === o.id;
                  return (
                    <div key={o.id} onClick={() => setTriggerType(o.id)} style={{ flex: 1, padding: "10px 8px", borderRadius: 10, cursor: "pointer", textAlign: "center", border: active ? "1.5px solid " + brand : "0.5px solid " + (isDark ? "rgba(255,255,255,0.08)" : "rgba(8,73,172,0.10)"), background: active ? (isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.05)") : "transparent", transition: "all 120ms ease" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 13, fontWeight: 700, color: active ? brand : fgMuted }}>
                        <o.Icon size={13} strokeWidth={1.5} color={active ? brand : fgMuted} />{o.label}
                      </div>
                    </div>
                  );
                })}
              </div>

              {triggerType === "manual" && (
                <div style={{ padding: "10px 12px", borderRadius: 9, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(26,26,46,0.03)", fontSize: 11, color: fgMuted, lineHeight: 1.5 }}>
                  Agent chỉ chạy khi bạn bấm <strong>Chạy thử</strong> / chạy tay. Không tự động.
                </div>
              )}

              {triggerType === "event" && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Loại sự kiện kích hoạt</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>
                    {([
                      { id: "volume_spike", label: "Khối lượng đột biến", desc: "KL một phiên vượt bội số TB20 phiên" },
                      { id: "insider_buy", label: "Nội bộ / lãnh đạo MUA", desc: "Có giao dịch mua của người nội bộ" },
                      { id: "high_impact_news", label: "Tin tác động mạnh", desc: "Tin có điểm tác động ≥ ngưỡng" },
                    ] as const).map(e => {
                      const active = eventType === e.id;
                      return (
                        <div key={e.id} onClick={() => setEventType(e.id)} style={{ padding: "10px 12px", borderRadius: 10, cursor: "pointer", border: active ? "1px solid " + brand : "0.5px solid " + (isDark ? "rgba(255,255,255,0.08)" : "rgba(8,73,172,0.10)"), background: active ? (isDark ? "rgba(77,143,232,0.08)" : "rgba(8,73,172,0.04)") : bgPanel }}>
                          <div style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? brand : fg }}>{e.label}</div>
                          <div style={{ fontSize: 11, color: fgSubtle, marginTop: 2 }}>{e.desc}</div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Tham số theo loại */}
                  {eventType === "volume_spike" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: fg }}>
                      <span>Bội số TB20:</span>
                      <input type="number" min={1} step={0.5} value={eventMultiple} onChange={e => setEventMultiple(Number(e.target.value) || 2)} style={{ width: 70, padding: "6px 8px", borderRadius: 7, border: "0.5px solid " + inputBorder, background: bgPanel, color: fg, fontSize: 13, fontWeight: 700, outline: "none", fontFamily: FONT }} />
                      <span style={{ color: fgSubtle }}>lần (vd 2 = gấp đôi TB)</span>
                    </div>
                  )}
                  {eventType === "insider_buy" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: fg }}>
                      <span>Trong vòng:</span>
                      <input type="number" min={1} value={eventDays} onChange={e => setEventDays(Number(e.target.value) || 7)} style={{ width: 70, padding: "6px 8px", borderRadius: 7, border: "0.5px solid " + inputBorder, background: bgPanel, color: fg, fontSize: 13, fontWeight: 700, outline: "none", fontFamily: FONT }} />
                      <span style={{ color: fgSubtle }}>ngày gần nhất</span>
                    </div>
                  )}
                  {eventType === "high_impact_news" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: fg }}>
                      <span>Điểm tác động ≥</span>
                      <input type="number" min={1} max={10} step={0.5} value={eventMinImpact} onChange={e => setEventMinImpact(Number(e.target.value) || 5)} style={{ width: 70, padding: "6px 8px", borderRadius: 7, border: "0.5px solid " + inputBorder, background: bgPanel, color: fg, fontSize: 13, fontWeight: 700, outline: "none", fontFamily: FONT }} />
                      <span style={{ color: fgSubtle }}>(thang -10..+10)</span>
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: fgDisabled, marginTop: 10, lineHeight: 1.5 }}>
                    Áp dụng cho các mã trong "Mã quan tâm". Hệ thống kiểm tra định kỳ, đúng điều kiện → agent tự chạy & tạo báo cáo.
                  </div>
                </div>
              )}

              {triggerType === "scheduled" && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Tần suất phân tích</div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    {([{ id: "daily", label: "Mỗi ngày" }, { id: "weekdays", label: "Ngày GD" }, { id: "weekly", label: "Hàng tuần" }, { id: "custom", label: "Tùy chọn" }] as const).map(f => (
                      <button key={f.id} onClick={() => { setFrequency(f.id); if (f.id === "weekly") setSelectedDays(new Set([0])); if (f.id === "daily" || f.id === "weekdays") setSelectedDays(new Set([0, 1, 2, 3, 4])); }} style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: "none", cursor: "pointer", background: frequency === f.id ? brand : isDark ? "rgba(255,255,255,0.07)" : "rgba(26,26,46,0.06)", color: frequency === f.id ? "#fff" : fgMuted, fontSize: 11, fontWeight: frequency === f.id ? 700 : 500, fontFamily: FONT, transition: "all 100ms ease" }}>{f.label}</button>
                    ))}
                  </div>
                  {(frequency === "weekly" || frequency === "custom") && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Ngày trong tuần</div>
                      <div style={{ display: "flex", gap: 5 }}>
                        {["T2","T3","T4","T5","T6","T7","CN"].map((d, i) => {
                          const isWknd = i >= 5; const sel = selectedDays.has(i);
                          return <button key={d} onClick={() => toggleDay(i)} style={{ flex: 1, aspectRatio: "1", borderRadius: 8, border: "none", cursor: "pointer", background: sel ? (isWknd ? "#FF9500" : brand) : isDark ? "rgba(255,255,255,0.07)" : "rgba(26,26,46,0.06)", color: sel ? "#fff" : isWknd ? "#FF9500" : fgMuted, fontSize: 11, fontWeight: sel ? 700 : 500, fontFamily: FONT, transition: "all 100ms ease", padding: "7px 0" }}>{d}</button>;
                        })}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Giờ gửi</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "0.5px solid " + inputBorder, background: bgPanel, fontSize: 13, fontWeight: 700, color: fg, outline: "none", fontFamily: FONT, cursor: "pointer" }} />
                      <div style={{ display: "flex", gap: 5 }}>
                        {["09:15","11:30","15:15"].map(t => (
                          <button key={t} onClick={() => setScheduleTime(t)} style={{ padding: "7px 8px", borderRadius: 7, border: "none", cursor: "pointer", background: scheduleTime === t ? (isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)") : isDark ? "rgba(255,255,255,0.05)" : "rgba(26,26,46,0.05)", color: scheduleTime === t ? brand : fgMuted, fontSize: 11, fontWeight: scheduleTime === t ? 700 : 400, fontFamily: FONT }}>{t}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: fgDisabled, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                      <Info size={9} strokeWidth={1.5} color={fgDisabled} />09:15 = đầu phiên · 11:30 = giữa phiên · 15:15 = cuối phiên
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:.4;transform:scale(.9)} 50%{opacity:1;transform:scale(1.1)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

// ── Section accordion ────────────────────────────────────────────────────────
function Section({
  id, label, icon, open, onToggle, badge, badgeColor = "brand", children, isDark = false,
}: {
  id: string; label: string; icon: React.ReactNode;
  open: boolean; onToggle: () => void;
  badge?: string; badgeColor?: "brand" | "gray"; children: React.ReactNode;
  isDark?: boolean;
}) {
  void id;
  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgDisabled = isDark ? "rgba(240,242,255,0.30)" : "#3D3D52";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.08)";
  const badgeBg = badgeColor === "gray"
    ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(26,26,46,0.07)")
    : (isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.10)");
  const badgeFg = badgeColor === "gray" ? fgDisabled : brand;
  return (
    <div style={{ borderBottom: "0.5px solid " + divider }}>
      <button onClick={onToggle} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
        {icon}
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: fg }}>{label}</span>
        {badge && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: badgeBg, color: badgeFg }}>{badge}</span>}
        {open ? <ChevronUp size={14} strokeWidth={1.5} color={fgDisabled} /> : <ChevronDown size={14} strokeWidth={1.5} color={fgDisabled} />}
      </button>
      {open && <div style={{ padding: "0 14px 14px" }}>{children}</div>}
    </div>
  );
}

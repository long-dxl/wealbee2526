/**
 * BeeAI Chat Client
 * Gọi Edge Function bee-ai-chat với SSE streaming
 */

import { supabase } from "./client";

export interface ToolStep {
  name: string;
  status: "loading" | "done";
  label: string;
}

export interface SourceRef { index: number; label: string; url: string; }

export interface ChatStreamCallbacks {
  onChunk: (text: string) => void;
  onStep?: (step: ToolStep) => void;
  onDone: (info: { sessionId: string; tokens?: number; model?: string; refs?: SourceRef[] }) => void;
  onError: (error: string) => void;
}

export interface ContextCardPayload {
  id?: string;
  type: string;
  label: string;
  badge?: string;
  summary?: string;
}

/**
 * sendChatMessage — stream BeeAI response
 *
 * @param message      - Tin nhắn của user
 * @param sessionId    - ID session (undefined = tạo mới)
 * @param contextCards - Các card đang được kéo vào ActionHub
 * @param callbacks    - Handlers cho streaming events
 * @returns cleanup function (call để cancel stream)
 */
export async function sendChatMessage(
  message: string,
  sessionId: string | undefined,
  contextCards: ContextCardPayload[] | null,
  callbacks: ChatStreamCallbacks
): Promise<() => void> {
  // Get current user session token
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    callbacks.onError("Bạn cần đăng nhập để dùng BeeAI");
    return () => {};
  }

  const controller = new AbortController();

  (async () => {
    try {
      // Bộ não kg-stock-vn (thay bee-ai-chat). Cấu hình URL qua VITE_KG_API_URL.
      const KG_API = (import.meta.env.VITE_KG_API_URL as string) || "http://localhost:8077";

      // Hiển thị trạng thái đang phân tích (đường sâu có thể mất vài chục giây)
      callbacks.onStep?.({ name: "analyze", status: "loading", label: "Đang phân tích (KG + dữ liệu Wealbee)..." });

      const res = await fetch(`${KG_API}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Gửi thẻ kéo vào DẠNG CÓ CẤU TRÚC (id/type) để backend lấy đúng nội dung gốc (báo cáo/tin)
        body: JSON.stringify({
          message,
          context_cards: contextCards?.length ? contextCards : undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        let msg = `Lỗi ${res.status}`;
        try { msg = (JSON.parse(errorText).error) || msg; } catch { /* */ }
        callbacks.onError(msg);
        return;
      }

      const data = await res.json() as { markdown?: string; model?: string; sources?: SourceRef[] };
      callbacks.onStep?.({ name: "analyze", status: "done", label: "Phân tích hoàn tất" });

      const text = data.markdown || "(không có nội dung)";
      callbacks.onChunk(text);
      callbacks.onDone({
        sessionId: sessionId ?? crypto.randomUUID(),
        model: data.model || "kg-stock-vn",
        refs: data.sources,
      });
    } catch (err) {
      if (controller.signal.aborted) return; // User cancelled
      callbacks.onError(String(err));
    }
  })();

  return () => controller.abort();
}

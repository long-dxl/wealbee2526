/**
 * BeeAI Chat Client
 * Gọi Edge Function bee-ai-chat với SSE streaming
 */

import { supabase } from "./client";

export interface ChatStreamCallbacks {
  onChunk: (text: string) => void;
  onDone: (info: { sessionId: string; tokens?: number; model?: string }) => void;
  onError: (error: string) => void;
}

export interface ContextCardPayload {
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
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const fnUrl = `${SUPABASE_URL}/functions/v1/bee-ai-chat`;

      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          session_id: sessionId,
          context_cards: contextCards?.length ? contextCards : undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        let msg = `Lỗi ${res.status}`;
        try {
          const err = JSON.parse(errorText);
          msg = err.error || msg;
        } catch { /* */ }
        callbacks.onError(msg);
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError("Không thể đọc stream");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === "[DONE]") continue;

          try {
            const event = JSON.parse(raw);
            if (event.type === "chunk" && event.text) {
              callbacks.onChunk(event.text);
            } else if (event.type === "done") {
              callbacks.onDone({
                sessionId: event.session_id,
                tokens: event.tokens,
                model: event.model,
              });
            } else if (event.type === "error") {
              callbacks.onError(event.message || "Lỗi không xác định");
            }
          } catch { /* skip malformed SSE line */ }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return; // User cancelled
      callbacks.onError(String(err));
    }
  })();

  return () => controller.abort();
}

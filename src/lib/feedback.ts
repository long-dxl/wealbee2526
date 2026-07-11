import { supabase } from "./supabase/client";

export type FeedbackType = "bug" | "feature" | "experience" | "other";

export const MAX_FEEDBACK_ATTACHMENTS = 3;
export const MAX_FEEDBACK_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB/ảnh
export const FEEDBACK_ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export interface FeedbackAttachment {
  path: string;
  name: string;
  size: number;
}

export interface SubmitFeedbackInput {
  type: FeedbackType;
  message: string;
  rating: number | null;
  images: File[];
}

export interface SubmitFeedbackResult {
  success: boolean;
  message?: string;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

export async function submitFeedback({ type, message, rating, images }: SubmitFeedbackInput): Promise<SubmitFeedbackResult> {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return { success: false, message: "Bạn cần đăng nhập để gửi phản hồi." };
  }

  const feedbackId = crypto.randomUUID();
  const attachments: FeedbackAttachment[] = [];

  for (let i = 0; i < images.length; i++) {
    const file = images[i];
    const path = `${user.id}/${feedbackId}/${i}-${sanitizeFileName(file.name)}`;
    const { error: uploadErr } = await supabase.storage
      .from("feedback-attachments")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadErr) {
      return { success: false, message: `Tải ảnh "${file.name}" thất bại: ${uploadErr.message}` };
    }
    attachments.push({ path, name: file.name, size: file.size });
  }

  const { error: insertErr } = await supabase.from("feedback").insert({
    id: feedbackId,
    user_id: user.id,
    user_email: user.email ?? "",
    user_name: user.user_metadata?.name || user.email?.split("@")[0] || "User",
    type,
    message: message.trim(),
    rating,
    attachments,
    page_url: typeof window !== "undefined" ? window.location.pathname : null,
  });

  if (insertErr) {
    return { success: false, message: `Gửi phản hồi thất bại: ${insertErr.message}` };
  }

  // Báo cho admin qua email — không chặn/không làm fail luồng gửi feedback của user nếu bước này lỗi
  // (feedback đã lưu DB an toàn; email chỉ là thông báo tiện lợi).
  supabase.functions.invoke("notify-feedback", { body: { feedbackId } }).catch((err) => {
    console.error("notify-feedback failed:", err);
  });

  return { success: true };
}

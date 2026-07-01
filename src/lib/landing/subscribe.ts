interface SubscribeResult {
  success: boolean;
  message: string;
}

export interface FeedbackData {
  type: string;
  rating: number | null;
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function saveFeedback(
  data: FeedbackData
): Promise<SubscribeResult> {
  try {
    const res = await fetch("/api/save-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: data.type,
        rating: data.rating,
        name: data.name,
        email: data.email,
        subject: data.subject,
        message: data.message,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      return { success: false, message: json.error ?? "Có lỗi xảy ra. Vui lòng thử lại." };
    }
    return { success: true, message: "Gửi phản hồi thành công!" };
  } catch {
    return { success: false, message: "Không thể kết nối. Vui lòng kiểm tra mạng và thử lại." };
  }
}

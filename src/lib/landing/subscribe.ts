import { supabase } from "./supabase";

interface Holding {
  symbol: string;
  quantity: number;
}

interface SubscribeResult {
  success: boolean;
  message: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SurveyData {
  age: string;
  experience: string;
  referral: string;
}

export interface FeedbackData {
  type: string;
  rating: number | null;
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function saveSubscriber(
  email: string,
  holdings: Holding[]
): Promise<SubscribeResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return { success: false, message: "Email không hợp lệ." };
  }

  const watchSymbols = Array.isArray(holdings)
    ? holdings.map((h: any) => typeof h === 'string' ? h : h?.symbol).filter(Boolean)
    : [];
  const { error } = await supabase
    .from("digest_subscribers")
    .insert([{ email: normalizedEmail, watch_symbols: watchSymbols, source: "onboarding" }]);

  if (error) {
    if (error.code === "23505") {
      return { success: false, message: "Email này đã được đăng ký trước đó." };
    }
    if (error.code === "42501") {
      return { success: false, message: "Không có quyền thực hiện thao tác này. Vui lòng liên hệ hỗ trợ." };
    }
    if (error.code === "23514") {
      return { success: false, message: "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại thông tin." };
    }
    if (error.message?.includes("Failed to fetch") || error.message?.includes("NetworkError")) {
      return { success: false, message: "Không thể kết nối. Vui lòng kiểm tra mạng và thử lại." };
    }
    return { success: false, message: "Có lỗi xảy ra. Vui lòng thử lại sau." };
  }

  return { success: true, message: "Đăng ký thành công!" };
}

export async function saveSurveyResponse(
  email: string,
  survey: SurveyData
): Promise<void> {
  try {
    await fetch("/api/save-survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        age_group: survey.age,
        experience: survey.experience,
        referral: survey.referral,
      }),
    });
  } catch {
    // Fire-and-forget: don't block onboarding if this fails
  }
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

export async function joinProWaitlist(
  email: string
): Promise<SubscribeResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return { success: false, message: "Email không hợp lệ." };
  }

  const { error } = await supabase
    .from("digest_subscribers")
    .insert([{ email: normalizedEmail, watch_symbols: [], source: "pro_waitlist" }]);

  if (error) {
    if (error.code === "23505") {
      return { success: false, message: "Email này đã được đăng ký." };
    }
    return { success: false, message: "Có lỗi xảy ra. Vui lòng thử lại." };
  }

  return { success: true, message: "Đã nhận! Chúng tôi sẽ thông báo khi Pro mở." };
}

export async function unsubscribeEmail(
  email: string
): Promise<SubscribeResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return { success: false, message: "Email không hợp lệ." };
  }

  try {
    const res = await fetch("/api/unsubscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { success: false, message: data.error ?? "Có lỗi xảy ra. Vui lòng thử lại." };
    }

    return { success: true, message: "Hủy đăng ký thành công." };
  } catch {
    return { success: false, message: "Không thể kết nối. Vui lòng kiểm tra mạng và thử lại." };
  }
}

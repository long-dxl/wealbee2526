export type CardType = "index" | "portfolio" | "news" | "ticker" | "mover" | "tool" | "report";

export interface ContextCard {
  id: string;
  type: CardType;
  label: string;
  badge?: string;
  summary?: string;
}

export const DRAG_CARD_MIME = "application/wealbee-card";

export const cardTypeQuestions: Record<CardType, string[]> = {
  index: [
    "Chỉ số này đang trong xu hướng gì?",
    "Dòng tiền ngoại đang mua hay bán?",
    "Ngành nào đang dẫn dắt chỉ số hôm nay?",
  ],
  portfolio: [
    "Danh mục của tôi rủi ro nhất ở đâu?",
    "Mã nào nên cắt lỗ hoặc chốt lời?",
    "Tôi nên rebalance không hôm nay?",
  ],
  news: [
    "Tin này ảnh hưởng đến danh mục tôi ra sao?",
    "Đây có phải cơ hội để mua vào không?",
    "Rủi ro nào tôi cần chú ý từ tin này?",
  ],
  ticker: [
    "Phân tích kỹ thuật ngắn hạn của mã này?",
    "Định giá P/E hiện tại hợp lý không?",
    "Có nên tăng tỷ trọng mã này không?",
  ],
  mover: [
    "Tại sao mã này đang biến động mạnh?",
    "Xu hướng này có thể kéo dài không?",
    "Tôi có nên theo momentum này không?",
  ],
  tool: [
    "Công cụ này hoạt động thế nào với danh mục của tôi?",
    "Cho tôi ví dụ phân tích thực tế với công cụ này?",
    "Khi nào nên dùng công cụ này trong chiến lược đầu tư?",
  ],
  report: [
    "Luận điểm chính trong báo cáo này là gì?",
    "Báo cáo này ảnh hưởng thế nào đến danh mục của tôi?",
    "Tôi có nên hành động theo khuyến nghị trong báo cáo không?",
  ],
};

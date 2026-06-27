"""
gemini_agent_service.py
-----------------------
AI Agent phân tích đầu tư cổ phiếu Việt Nam sử dụng:
  - SDK: google-genai (thư viện chính thức mới nhất của Google)
  - Model: gemini-2.5-flash (miễn phí qua Google AI Studio)
  - Cơ chế: Function Calling tự động → truy vấn Supabase Knowledge Graph

Cách chạy:
  1. Điền GEMINI_API_KEY và SUPABASE_* vào file .env
  2. pip install -r requirements.txt
  3. python gemini_agent_service.py

Lấy GEMINI_API_KEY miễn phí tại: https://aistudio.google.com/app/apikey
"""

import os
import json
import time
from dotenv import load_dotenv
from google import genai
from google.genai import types

from agent_config import (
    GEMINI_MODELS,
    GEMINI_DEFAULT_IDX,
    get_system_instruction,
    sanitize_citations,
    query_graph_database,
    get_market_price,
    compare_stocks,
    get_market_overview,
    get_stock_news_timeline,
    fetch_fresh_news,
    get_stock_news,
    query_news,
    query_events,
    web_search,
    read_article,
    query_sector_impact,
    query_macro_propagation,
    query_stock_sector_context,
    get_financial_statements,
    get_commodity_prices,
    get_vn_domestic_price,
    get_sector_value_chain,
)

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise EnvironmentError("Thiếu GEMINI_API_KEY trong file .env.")

gemini_client = genai.Client(api_key=GEMINI_API_KEY)
GEMINI_MODEL  = GEMINI_MODELS[GEMINI_DEFAULT_IDX]
from markets.vn.config import TOP_10_TICKERS   # gom về hồ sơ thị trường (single source)

print(f"✅ Khởi tạo: Gemini ({GEMINI_MODEL}) + 15 tools + Supabase KG")


# ============================================================
# CHAT SESSION FACTORY
# ============================================================

def create_chat_session(model: str = None):
    """Khởi tạo phiên chat Gemini với 4 tools."""
    return gemini_client.chats.create(
        model=model or GEMINI_MODEL,
        config=types.GenerateContentConfig(
            system_instruction=get_system_instruction(),
            tools=[get_market_price, compare_stocks,
                   get_market_overview, get_stock_news, query_news, query_events,
                   web_search, read_article, query_sector_impact, query_macro_propagation,
                   query_stock_sector_context, get_financial_statements,
                   get_commodity_prices,
                   get_vn_domestic_price,
                   get_sector_value_chain],
            temperature=0.2,
            max_output_tokens=16384,   # nâng từ 8192 → tránh CẮT câu trả lời dài (phân tích 7c)
        ),
    )


# ============================================================
# HÀM XỬ LÝ CHAT CHÍNH
# ============================================================

def chat_with_investor(user_query: str, chat_session=None) -> tuple[str, object]:
    """
    Xử lý câu hỏi của nhà đầu tư qua Gemini Agent với Function Calling.

    Luồng xử lý tự động:
    1. Người dùng hỏi → Gemini nhận diện cổ phiếu/chủ đề
    2. Gemini tự chọn tool phù hợp (giá, tài chính, tin, sự kiện, ngành×Beta...)
    3. Supabase/vnstock/web trả dữ liệu thật
    4. Gemini tổng hợp → phân tích → trả lời tiếng Việt, có trích nguồn

    Args:
        user_query: Câu hỏi của nhà đầu tư bằng tiếng Việt.
        chat_session: Phiên chat hiện có (None = tạo mới, mất lịch sử).

    Returns:
        tuple: (response_text: str, chat_session: object)
               Trả về cả chat_session để tái sử dụng trong multi-turn.
    """
    # Tạo chat session mới nếu chưa có
    if chat_session is None:
        chat_session = create_chat_session()

    # Thử lần lượt qua các model trong danh sách fallback
    for attempt, model in enumerate(GEMINI_MODELS):
        try:
            # Nếu không phải lần đầu → tạo session mới với model fallback
            if attempt > 0:
                print(f"  ⚡ Thử model fallback: {model}")
                chat_session = create_chat_session(model=model)

            # SDK tự xử lý toàn bộ vòng lặp Function Calling
            response = chat_session.send_message(user_query)
            return sanitize_citations(response.text), chat_session

        except Exception as e:
            err = str(e)
            is_overload = "503" in err or "UNAVAILABLE" in err or "overloaded" in err.lower()
            is_quota    = "429" in err or "RESOURCE_EXHAUSTED" in err or "quota" in err.lower()

            if (is_overload or is_quota) and attempt < len(GEMINI_MODELS) - 1:
                # 503: chờ ngắn rồi thử model sau. 429 (hết hạn mức/ngày): đổi model luôn.
                if is_overload and not is_quota:
                    wait = 2 ** attempt
                    print(f"  ⚠️  {model} quá tải, chờ {wait}s rồi thử model tiếp theo...")
                    time.sleep(wait)
                else:
                    print(f"  ⚠️  {model} hết hạn mức hôm nay, chuyển model tiếp theo...")
                continue

            # Lỗi không phải overload/quota hoặc đã hết model → trả về thông báo lỗi
            if is_quota:
                return (
                    "⚠️ Đã đạt giới hạn miễn phí của Gemini hôm nay trên tất cả model.\n"
                    "Thử lại sau ít phút, hoặc dùng API key trả phí: https://ai.google.dev"
                ), chat_session
            error_msg = (
                f"❌ Lỗi Gemini API ({model}): {err}\n\n"
                f"**Kiểm tra:**\n"
                f"- GEMINI_API_KEY có hợp lệ không?\n"
                f"- Kết nối internet có ổn định không?\n"
                f"- Đã vượt quota miễn phí chưa?"
            )
            return error_msg, chat_session

    return "❌ Tất cả model đều không khả dụng. Vui lòng thử lại sau.", chat_session


# ============================================================
# HÀM TIỆN ÍCH: In kết quả đẹp ra terminal
# ============================================================

def print_response(response_text: str, query: str = ""):
    """In câu trả lời ra terminal với định dạng dễ đọc."""
    separator = "=" * 70
    print(f"\n{separator}")
    if query:
        print(f"❓ Câu hỏi: {query}")
        print("-" * 70)
    print("🤖 Phân tích từ AI Agent:")
    print("-" * 70)
    print(response_text)
    print(separator)


# ============================================================
# DEMO CHẠY THỬ NGHIỆM (Interactive + Batch)
# ============================================================

def run_demo_batch():
    """
    Chạy thử nghiệm batch với 3 câu hỏi mẫu, mỗi câu một session độc lập.
    Dùng để test nhanh khi mới thiết lập hệ thống.
    """
    demo_queries = [
        "Phân tích tác động của tỷ giá USD/VND lên cổ phiếu HPG",
        "Nếu Fed tiếp tục giữ lãi suất cao, cổ phiếu VHM và VIC sẽ bị ảnh hưởng thế nào?",
        "Cho tôi biết mạng lưới quan hệ tài chính của FPT với các yếu tố vĩ mô",
    ]

    print("\n" + "🚀 " * 15)
    print("DEMO: AI AGENT PHÂN TÍCH CỔ PHIẾU VIỆT NAM")
    print("🚀 " * 15)

    for i, query in enumerate(demo_queries, 1):
        print(f"\n[Demo {i}/{len(demo_queries)}]")
        # Mỗi demo dùng session độc lập để test riêng lẻ
        response, _ = chat_with_investor(query)
        print_response(response, query)


def run_interactive_chat():
    """
    Chạy chế độ chat tương tác với lịch sử hội thoại đa lượt (multi-turn).
    Nhập 'exit' hoặc 'quit' để thoát.
    """
    print("\n" + "=" * 70)
    print("💬 CHẾ ĐỘ CHAT TƯƠNG TÁC - AI AGENT CHỨNG KHOÁN VIỆT NAM")
    print("=" * 70)
    print(f"📌 Danh mục hỗ trợ: {', '.join(sorted(TOP_10_TICKERS))}")
    print("📌 Nhập 'exit' hoặc 'quit' để thoát | 'new' để bắt đầu cuộc trò chuyện mới")
    print("=" * 70)

    # Tạo một session chat duy nhất cho toàn bộ cuộc trò chuyện
    # → Gemini sẽ nhớ lịch sử hội thoại trước đó
    session = create_chat_session()
    turn_count = 0

    while True:
        try:
            print()
            user_input = input("Bạn: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n\n👋 Kết thúc phiên chat. Tạm biệt!")
            break

        if not user_input:
            continue

        if user_input.lower() in ("exit", "quit", "thoát"):
            print("👋 Kết thúc phiên chat. Tạm biệt!")
            break

        if user_input.lower() == "new":
            session = create_chat_session()
            turn_count = 0
            print("🔄 Đã tạo cuộc trò chuyện mới (lịch sử đã xóa).")
            continue

        turn_count += 1
        print(f"\n⏳ [Lượt {turn_count}] Đang phân tích...")

        response_text, session = chat_with_investor(user_input, session)
        print_response(response_text)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    import sys

    # Kiểm tra argument dòng lệnh
    mode = sys.argv[1] if len(sys.argv) > 1 else "interactive"

    if mode == "demo":
        # python gemini_agent_service.py demo  → chạy 3 câu hỏi mẫu
        run_demo_batch()
    elif mode == "test":
        # python gemini_agent_service.py test  → test nhanh 1 câu hỏi
        print("🧪 Chạy test nhanh...")
        response, _ = chat_with_investor(
            "Cho tôi xem tổng quan về cổ phiếu VCB và các yếu tố vĩ mô ảnh hưởng"
        )
        print_response(response)
    else:
        # python gemini_agent_service.py  → chế độ chat tương tác (mặc định)
        run_interactive_chat()

"""
evals/cases.py — BỘ CÂU HỎI CHUẨN (golden set) cho regression test.

Hai loại:
  ROUTING_CASES  : kiểm tra câu đi ĐÚNG ĐƯỜNG (instant, không gọi LLM) → bắt lỗi routing regression.
  ANSWER_CASES   : chạy e2e thật → chấm chất lượng (nguồn/disclaimer/không-khuyến-nghị/đúng trọng tâm).

expected_path ∈ {PRICE, REPORT, DEEP, SECTOR, MACRO, LEAN, MODEL}.
checks: tên các metric (xem metrics.py) câu trả lời PHẢI đạt.
"""

# ── ROUTING (nhanh, chạy mỗi commit) ───────────────────────────────────────
ROUTING_CASES = [
    # PRICE
    {"q": "giá HPG hôm nay", "path": "PRICE"},
    {"q": "VCB đang bao nhiêu", "path": "PRICE"},
    # DEEP (câu phân tích/đánh giá + mã — ĐÃ FIX để không lọt model-driven)
    {"q": "phân tích HPG", "path": "DEEP"},
    {"q": "phân tích cổ phiếu HPG", "path": "DEEP"},
    {"q": "đánh giá HPG", "path": "DEEP"},
    {"q": "đánh giá cổ phiếu Hòa Phát", "path": "DEEP"},
    {"q": "HPG thế nào", "path": "DEEP"},
    {"q": "có nên quan tâm HPG không", "path": "DEEP"},
    {"q": "HPG có đáng đầu tư không", "path": "DEEP"},
    {"q": "định giá FPT, TCB, HPG hiện nay và luận điểm đầu tư", "path": "DEEP"},
    {"q": "so sánh HPG và HSG", "path": "DEEP"},
    {"q": "tiềm năng tương lai của Hòa Phát có những dự án gì", "path": "DEEP"},
    {"q": "đánh giá ngành thép và so sánh HPG với các đối thủ ngành", "path": "DEEP"},
    # SECTOR (câu ngành, KHÔNG nêu mã)
    {"q": "triển vọng ngành thép", "path": "SECTOR"},
    {"q": "đánh giá ngành ngân hàng và cổ phiếu tiêu biểu", "path": "SECTOR"},
    {"q": "tổng hợp các báo cáo phân tích ngành bất động sản mới nhất", "path": "SECTOR"},
    # MACRO
    {"q": "lãi suất Fed hiện nay và ảnh hưởng tới chứng khoán Việt Nam", "path": "MACRO"},
    {"q": "tăng trưởng GDP Việt Nam quý gần nhất", "path": "MACRO"},
    {"q": "tỷ giá USD/VND hiện tại và xu hướng", "path": "MACRO"},
    {"q": "lãi suất điều hành của Ngân hàng Nhà nước hiện nay", "path": "MACRO"},
    # REPORT (đọc sâu báo cáo CTCK)
    {"q": "đọc sâu báo cáo phân tích VCB: khuyến nghị, giá mục tiêu, key metric", "path": "REPORT"},
    {"q": "báo cáo phân tích HPG mới nhất giá mục tiêu bao nhiêu", "path": "REPORT"},
    {"q": "CTCK nào khuyến nghị mua HPG, giá mục tiêu", "path": "REPORT"},
    # LEAN (tin/đơn giản)
    {"q": "tin tức HPG", "path": "LEAN"},
    {"q": "VN-Index hôm nay thế nào", "path": "LEAN"},
    # NEGATIVE / EDGE (không được nhận nhầm)
    {"q": "đọc báo cáo tài chính HPG quý gần nhất", "path": "DEEP"},   # BCTC ≠ báo cáo CTCK
    {"q": "phân tích vinhomes", "path": "DEEP"},                       # tên công ty → mã
]

# ── ANSWER QUALITY (e2e thật — chạy theo mẻ nhỏ, tốn quota) ─────────────────
# checks dùng metric trong metrics.py. 'no_reco' = không lọt khuyến nghị mua/bán/tỷ trọng của HỆ THỐNG.
ANSWER_CASES = [
    {"q": "đánh giá ngành thép hiện nay, động lực tăng trưởng và so sánh HPG với các đối thủ ngành",
     "path": "DEEP", "checks": ["has_disclaimer", "no_reco", "has_link", "has_period_anchor", "has_yoy"]},
    {"q": "định giá FPT, TCB, HPG hiện nay, luận điểm đầu tư và rủi ro",
     "path": "DEEP", "checks": ["has_disclaimer", "no_reco", "has_link", "has_valuation"]},
    {"q": "đọc sâu báo cáo phân tích VCB: khuyến nghị, giá mục tiêu và key metric",
     "path": "REPORT", "checks": ["has_disclaimer", "no_reco", "has_link", "targets_sourced"]},
    {"q": "lãi suất Fed hiện nay là bao nhiêu và ảnh hưởng thế nào tới chứng khoán Việt Nam",
     "path": "MACRO", "checks": ["has_disclaimer", "has_link", "macro_number_sourced"]},
    {"q": "tiềm năng tương lai của Hòa Phát có những dự án gì",
     "path": "DEEP", "checks": ["has_disclaimer", "no_reco", "has_link", "fresh_sources"]},
]

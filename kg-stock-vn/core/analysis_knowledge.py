"""
analysis_knowledge.py — KHO TRI THỨC PHÂN TÍCH (modular knowledge cards)
=======================================================================
Tri thức EVERGREEN trích từ chuyên gia (transcripts Tài chính & Kinh doanh: FAnalysis,
"Behind the Numbers", "BCTC như Buffett", The Fund Manager…). Mỗi CARD = 1 framework
phân tích tái sử dụng, gắn `domain` + `loai_hinh`.

THIẾT KẾ ĐỂ DỄ SCALE & KHÔNG PHÌNH PROMPT:
  - GLOBAL card (loai_hinh=None): CÔ ĐỌNG, luôn-bật → ghép vào cuối system instruction qua
    `global_knowledge_block()`. Phần ĐỊNH LƯỢNG đã được tính sẵn (deterministic) trong
    get_financial_statements; card chỉ DẠY agent cách ĐỌC/diễn giải các số/cờ đó.
  - LOAI_HINH card: tri thức CHUYÊN SÂU theo loại hình DN → surface CÓ ĐIỀU KIỆN qua
    get_financial_statements (khung_phan_tich.tri_thuc_nang_cao) — chỉ nạp khi đúng loại hình,
    nên KHÔNG làm nặng prompt luôn-bật.

THÊM NGUỒN MỚI = thêm 1 entry vào CARDS (không sửa prompt/monolith). Đó là điểm "dễ scale".
"""

# loai_hinh khớp _classify_business() trong agent_config.py:
#   "san_xuat_thuong_mai_dich_vu" | "ngan_hang" | "chung_khoan" | "bao_hiem"

CARDS: dict[str, dict] = {
    # ───────────────────────── GLOBAL (luôn-bật, cô đọng) ─────────────────────────
    "earnings_quality": {
        "title": "Chất lượng lợi nhuận (dồn tích)",
        "domain": "earnings_quality",
        "loai_hinh": None,
        "body": (
            "### CHẤT LƯỢNG LỢI NHUẬN — DỒN TÍCH (đọc kèm số deterministic)\n"
            "- Nguyên lý: **Dồn tích = LNST − Dòng tiền HĐKD**. Dồn tích DƯƠNG LỚN / CFO < LNST kéo dài "
            "= lãi 'ảo', chất lượng thấp (Buffett: đừng chỉ đọc KQKD, phải soi BẢNG CÂN ĐỐI).\n"
            "- get_financial_statements trả sẵn: `accruals_ttm_ty`, `accruals_tren_lnst`, `cfo_tren_lnst`, "
            "`co_dau_hieu_dong_tich[]` (các khoản trên BCĐ tăng nhanh hơn doanh thu: phải thu khách hàng, "
            "phải thu khác/bên liên quan, trả trước người bán, XDCB dở dang, chi phí trả trước dài hạn; "
            "ngân hàng = LÃI/PHÍ DỰ THU), và `danh_gia_chat_luong_ln`.\n"
            "- KHI CÓ cờ `co_dau_hieu_dong_tich`: NÊU RÕ trong phần chất lượng LN — tên khoản + %tăng YoY + "
            "cơ chế ('ghi lãi/doanh thu nhưng tiền CHƯA về'). Lợi nhuận KHÁC/bất thường (one-off) lớn → hạ "
            "độ BỀN của lợi nhuận. Không có cờ → ghi nhận tích cực ngắn gọn."
        ),
    },
    "valuation_bands": {
        "title": "Vùng định giá P/E & PEG",
        "domain": "valuation",
        "loai_hinh": None,
        "body": (
            "### VÙNG ĐỊNH GIÁ (tham chiếu lịch sử VN-Index ~10 năm)\n"
            "- Dải P/E: **≤12 = RẺ** (vùng thấp, upside/downside lệch mạnh về phía tăng) · **12–16,5 = trung "
            "tính** · **≥16,5 = ĐẮT** (thận trọng; đầu tư vùng đắt 5 năm lợi nhuận thường mỏng). "
            "get_financial_statements trả `pe`, `pe_vung_thi_truong`.\n"
            "- VỚI TỪNG CỔ PHIẾU: ưu tiên **PEG** (`peg`, `peg_danh_gia` — P/E ÷ %tăng LNST; <1 = rẻ so tăng "
            "trưởng) + SO PEER; dải P/E tuyệt đối chỉ là BỐI CẢNH thị trường, ĐỪNG kết luận 'rẻ/đắt' chỉ bằng "
            "P/E tuyệt đối khi tăng trưởng/ngành khác biệt. Cho phép trả P/E cao NẾU tăng trưởng vượt trội.\n"
            "- DATA-DERIVED tự kiểm: get_financial_statements trả `vi_the_vs_lich_su` (ROE/biên hiện tại nằm "
            "vùng CAO/giữa/THẤP so với 3–4 năm CHÍNH DN) — dùng làm bằng chứng thay cho ngưỡng cứng (vd 'ROE "
            "22% ở vùng CAO 4 năm'), không phán bằng con số chuyên gia cố định."
        ),
    },
    "sector_selection": {
        "title": "Chọn ngành (vĩ mô → ngành)",
        "domain": "sector",
        "loai_hinh": None,
        "body": (
            "### CHỌN NGÀNH — PHƯƠNG PHÁP (CHIỀU tác động lấy từ KG, KHÔNG hardcode)\n"
            "- ⚠️ CHIỀU & ĐỘ MẠNH vĩ mô→ngành: LẤY TỪ KG (query_macro_propagation / query_sector_impact / "
            "query_stock_sector_context) — KG là NGUỒN CHÂN LÝ DUY NHẤT (có sign/weight/lag/mechanism, cập "
            "nhật được, gắn data_source). TUYỆT ĐỐI KHÔNG tự liệt kê chiều theo trí nhớ (tránh lệch với KG). "
            "Có chiều từ KG → `web_search` xác nhận bằng tin/số thực tế rồi mới khẳng định; KG thiếu ngành → web_search.\n"
            "- Pha chu kỳ ngành: khởi động → tăng trưởng → bão hòa → suy thoái → ƯU TIÊN khởi động/tăng trưởng. "
            "Cạnh tranh (5 lực Porter) càng gắt → biên càng mỏng → kém hấp dẫn. Xác định CSF (yếu tố thành công "
            "cốt lõi) của ngành (vd thép: giá thép/quặng/than cốc + thuế CBPG).\n"
            "- Độ hấp dẫn ngành định lượng = **PEG ngành** (P/E ÷ tăng trưởng LN; <1 hấp dẫn). "
            "Lan truyền VĨ MÔ→NGÀNH→×BETA→cổ phiếu."
        ),
    },
    "stock_picking_fm": {
        "title": "Checklist chọn cổ phiếu (fund manager)",
        "domain": "stock_picking",
        "loai_hinh": None,
        "body": (
            "### CHECKLIST CHỌN CỔ PHIẾU (góc nhìn fund manager)\n"
            "- TĂNG TRƯỞNG: DN 3–5 năm tới phải LỚN hơn rõ rệt (lý tưởng LN gấp đôi ~4 năm).\n"
            "- ĐỊNH GIÁ/BIÊN AN TOÀN: mua khi giá ≤ ~80% giá mục tiêu; chạm/vượt mục tiêu → cân nhắc CHỐT, "
            "KHÔNG tham khi đã đắt (đắt + tin xấu = giảm rất nhanh).\n"
            "- CHẤT LƯỢNG: ROE cao & BỀN, ban lãnh đạo đáng tin/có thành tích; LOẠI mã quản trị kém hoặc giá quá đắt.\n"
            "- DANH MỤC: mục tiêu P/E < thị trường & EPS growth > thị trường; đa dạng hóa THỰC CHẤT (tránh "
            "nhiều mã cùng 1 yếu tố rủi ro); position sizing tăng theo upside + độ tin cậy luận điểm.\n"
            "- Hàng tốt-giá-rẻ thường chỉ xuất hiện khi thị trường HOẢNG LOẠN. (Chỉ phân tích, KHÔNG khuyến nghị mua/bán.)"
        ),
    },

    # ───────────────────── CHUYÊN SÂU theo LOẠI HÌNH (nạp có điều kiện) ─────────────────────
    "banking_alm": {
        "title": "Ngân hàng — Quản trị Tài sản-Nợ (ALM)",
        "domain": "banking",
        "loai_hinh": "ngan_hang",
        "body": (
            "### NGÂN HÀNG — QUẢN TRỊ TÀI SẢN-NỢ (ALM), CHIỀU SÂU\n"
            "Gốc rễ rủi ro & NIM = **3 LỆCH PHA (mismatch)**:\n"
            "1. Kỳ hạn (maturity): huy động NGẮN ↔ cho vay DÀI. Đọc bảng 'kỳ hạn còn lại' trong BCTC kiểm "
            "toán — gap âm kỳ ngắn + dương kỳ dài lớn = rủi ro thanh khoản.\n"
            "2. Duration/lãi suất: lãi ĐẦU VÀO tăng khi lãi cho vay đã cố định → BÀO MÒN NIM.\n"
            "3. Tỷ giá: huy động VND, cho vay/tài sản ngoại tệ.\n"
            "THANH KHOẢN: **LDR ≤ 85%** (trần). LCR/NSFR (Basel III, lộ trình ~2026–2027 — đa số NH VN chưa "
            "đạt). Lãi suất liên ngân hàng qua đêm >10% = căng thẳng NGẮN HẠN (đừng nhầm là lãi suất nền).\n"
            "CHẤT LƯỢNG LN: tách **'chất' (NIM)** vs **'lượng' (tăng tín dụng bù NIM giảm)**. CỜ ĐỎ: **LÃI "
            "DỰ THU** (lãi/phí phải thu) tăng nhanh = lãi chưa thu được tiền (hay gắn tín dụng BĐS) — "
            "get_financial_statements gắn cờ ở `co_dau_hieu_dong_tich`. Soi: phân loại nợ + mức trích dự "
            "phòng + bao phủ nợ xấu (LLR). CASA benchmark ngành ~21,5% (VCB dẫn đầu).\n"
            "PHÂN NHÓM: theo khẩu vị rủi ro / tập khách hàng / lĩnh vực cho vay (NH chuyên BĐS phụ thuộc chu "
            "kỳ BĐS). Big4: P/B thấp nhưng vướng trần tăng vốn (vốn Nhà nước). Bank ~½ LN toàn thị trường → "
            "kéo P/E chung xuống; P/B ngành ~1,6 = vùng đáy lịch sử."
        ),
    },
}


# ─────────────────────── TẦNG TRUST: PROVENANCE + PHÂN LOẠI CLAIM ───────────────────────
# Trả lời "đâu đúng đâu sai": gắn NGUỒN + loại claim cho từng card.
#   claim_type: "evergreen"  = nguyên lý bền (Buffett/Porter/ALM) → tin cao, không cần refresh.
#               "time_bound" = NGƯỠNG SỐ theo thời điểm (dải P/E, CASA 21,5%…) → DỄ STALE, cần review/refresh.
#               "mixed"      = khung bền + có vài ngưỡng số time-bound.
# Nguyên tắc dùng: khi NGƯỠNG time-bound MÂU THUẪN với số DATA-DERIVED (PEG, vi_the_vs_lich_su, peer) → TIN DỮ LIỆU.
_CARD_META = {
    "earnings_quality": {"source": "FAnalysis 'Behind the Numbers' / 'BCTC như Buffett' (2025–2026)",
                         "claim_type": "evergreen", "confidence": "cao", "valid_until": None},
    "valuation_bands":  {"source": "The Fund Manager #04 / Góc nhìn TCKD (2026)",
                         "claim_type": "time_bound", "confidence": "trung bình", "valid_until": "2026-12-31"},
    "sector_selection": {"source": "FAnalysis #7 (2026)",
                         "claim_type": "evergreen", "confidence": "cao", "valid_until": None},
    "stock_picking_fm": {"source": "The Fund Manager #04 (2025)",
                         "claim_type": "evergreen", "confidence": "cao", "valid_until": None},
    "banking_alm":      {"source": "FAnalysis Tập 9 / 'Nội soi 8 ngân hàng' (2025–2026)",
                         "claim_type": "mixed", "confidence": "cao", "valid_until": "2026-12-31",
                         "note": "Khung ALM (3 lệch pha, LDR ≤85% là quy định) = bền; benchmark SỐ "
                                 "(CASA ~21,5%, P/B ngành ~1,6) = time_bound → web_search số mới."},
}
for _k, _m in _CARD_META.items():
    if _k in CARDS:
        CARDS[_k].update(_m)


def stale_claims(today: str) -> list[dict]:
    """Governance (dev): liệt kê card time-bound đã QUÁ hạn review (valid_until < today, YYYY-MM-DD)."""
    out = []
    for k, c in CARDS.items():
        vu = c.get("valid_until")
        if vu and c.get("claim_type") in ("time_bound", "mixed") and vu < today:
            out.append({"card": k, "title": c.get("title"), "source": c.get("source"),
                        "valid_until": vu, "claim_type": c.get("claim_type")})
    return out


def global_knowledge_block() -> str:
    """Ghép các GLOBAL card (loai_hinh=None) thành 1 khối cô đọng cho system instruction."""
    bodies = [c["body"] for c in CARDS.values() if c.get("loai_hinh") is None]
    header = ("## KHUNG PHÂN TÍCH NÂNG CAO — TRI THỨC CHUYÊN GIA (đọc cùng số liệu deterministic)\n"
              "Các khung dưới đây bổ trợ PLAYBOOK loại hình ở trên; phần định lượng đã được tính sẵn "
              "trong get_financial_statements — hãy DIỄN GIẢI đúng.\n"
              "⚠️ ƯU TIÊN DỮ LIỆU: các NGƯỠNG SỐ trong khung (dải P/E, CASA ~21,5%, P/B ~1,6…) là BỐI CẢNH "
              "theo thời điểm (nguồn chuyên gia) — khi MÂU THUẪN với số data-derived (PEG, vi_the_vs_lich_su, "
              "peer, số web mới) thì TIN DỮ LIỆU; chiều vĩ mô→ngành LẤY TỪ KG, không từ trí nhớ.")
    return header + "\n\n" + "\n\n".join(bodies)


def card_for_loai_hinh(loai: str):
    """Trả body card CHUYÊN SÂU cho 1 loại hình (None nếu chưa có) — để surface qua tool output."""
    for c in CARDS.values():
        if c.get("loai_hinh") == loai:
            return c["body"]
    return None

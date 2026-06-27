"""
evals/metrics.py — METRIC DETERMINISTIC chấm câu trả lời (không cần LLM, chạy nhanh, lặp lại được).

Mỗi metric: (answer, ctx) -> bool. ctx chứa tool_calls + bundle để check sâu (vd targets_sourced).
Trả True = ĐẠT. Dùng cho regression + đo "tỷ lệ số liệu truy được nguồn / không khuyến nghị / có mốc…".
"""
import re

# Từ khuyến nghị của HỆ THỐNG bị CẤM (khác việc trích khuyến nghị CTCK trong bảng báo cáo — cái đó OK).
# Chỉ bắt cụm RÕ RÀNG là lời khuyên hệ thống (tránh false-positive với "tăng tỷ trọng xuất khẩu" v.v.).
_RECO_LEAK = ("nên mua", "khuyến nghị mua", "khuyến nghị bán", "nên bán", "hãy mua", "mua gom",
              "dca", "phân bổ danh mục", "phân bổ tỷ trọng", "tỷ trọng danh mục",
              "core-value-growth", "nên nắm giữ", "nên giải ngân", "khuyến nghị nắm giữ")


def has_disclaimer(answer, ctx=None):
    return bool(re.search(r"tham khảo|không phải.*khuyến nghị|tự chịu trách nhiệm", answer, re.I))


def no_reco(answer, ctx=None):
    al = answer.lower()
    # cho phép "khuyến nghị" khi gắn nguồn CTCK (vd "MBS khuyến nghị MUA [link]") — chỉ chặn lời hệ thống
    for w in _RECO_LEAK:
        if w in al:
            # nếu nằm cùng dòng có tên CTCK/nguồn link → bỏ qua (trích bên thứ ba)
            for line in answer.split("\n"):
                if w in line.lower() and not re.search(r"MBS|SSI|Vietcap|VCBS|KBSV|BSC|\]\(http", line):
                    return False
    return True


def has_link(answer, ctx=None):
    return bool(re.search(r"\]\(https?://", answer))


def has_period_anchor(answer, ctx=None):
    # nêu rõ mốc: TTM tới Qx / Quý 20xx-Qx / Qx/20xx
    return bool(re.search(r"20\d{2}-Q[1-4]|Q[1-4]/20\d{2}|TTM.*20\d{2}|quý\s*[1-4]", answer, re.I))


def has_yoy(answer, ctx=None):
    return bool(re.search(r"YoY|cùng kỳ|svck", answer, re.I))


def has_valuation(answer, ctx=None):
    return bool(re.search(r"P/E|PEG|P/B|định giá", answer))


def fresh_sources(answer, ctx=None):
    # mọi mốc ngày trong câu trả lời KHÔNG có năm <= 2024 (tránh nguồn cũ)
    years = re.findall(r"\b(20\d{2})\b", answer)
    old = [y for y in years if y in ("2020", "2021", "2022", "2023", "2024")]
    return len(old) == 0


def targets_sourced(answer, ctx=None):
    """Mọi giá mục tiêu trong câu trả lời PHẢI truy được trong nội dung báo cáo đã đọc (chống bịa)."""
    ctx = ctx or {}
    blob = ctx.get("corpus_blob", "")
    if not blob:
        return True  # không có corpus để đối chiếu → bỏ qua (không phạt)
    nums = set(re.findall(r"\d{2,3}[.,]\d{3}", answer))
    if not nums:
        return True
    return all(n in blob or n.replace(".", ",") in blob or n.replace(",", ".") in blob for n in nums)


def macro_number_sourced(answer, ctx=None):
    """Số vĩ mô (%, lãi suất) nên đi kèm link nguồn ở gần (đoạn có số phải có link)."""
    has_pct = re.search(r"\d+[.,]?\d*\s*%", answer)
    if not has_pct:
        return True
    return bool(re.search(r"\]\(https?://", answer))


REGISTRY = {
    "has_disclaimer": has_disclaimer, "no_reco": no_reco, "has_link": has_link,
    "has_period_anchor": has_period_anchor, "has_yoy": has_yoy, "has_valuation": has_valuation,
    "fresh_sources": fresh_sources, "targets_sourced": targets_sourced,
    "macro_number_sourced": macro_number_sourced,
}

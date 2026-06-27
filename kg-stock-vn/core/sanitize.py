"""sanitize.py — guardrail trích dẫn (tách khỏi agent_config). Re-export qua agent_config."""
import re


_CITE_KG          = re.compile(r"\*{0,2}\[\s*(?:knowledge graph|đồ thị tri thức)[^\]]*\]\*{0,2}", re.IGNORECASE)
_CITE_WEIGHT_PAREN = re.compile(r"\s*\([^)]*trọng số[^)]*\)", re.IGNORECASE)   # xóa TRỌN cụm "(… - Trọng số 0.9)"
_CITE_WEIGHT_BARE  = re.compile(r"\s*[-–·,]?\s*trọng số\s*[:=]?\s*[0-9]+(?:[.,][0-9]+)?", re.IGNORECASE)
_CITE_INTERNAL = re.compile(
    r"\*{0,2}\[\s*(?:get_market_overview|get_financial_statements|vnstock|query_[a-z_]+)\b[^\]]*?\]\*{0,2}(?!\()",
    re.IGNORECASE)

# ── Chặn RÒ LỜI GỌI TOOL ra text (Gemini auto-function-calling degrade → in code thay vì gọi) ──
# Triệu chứng user gặp: "print(default_api.get_financial_statements(...))", "get_market_price(ticker='HPG')",
# + bảng rỗng có chuỗi gạch ngang dài hàng nghìn ký tự (sinh token lâu >5'). Đây là RÁC, phải bỏ sạch.
_TOOL_NAMES = ("get_market_price|get_financial_statements|get_market_overview|compare_stocks|get_stock_news|"
               "query_news|query_events|web_search|read_article|query_sector_impact|query_macro_propagation|"
               "query_stock_sector_context|get_commodity_prices|get_vn_domestic_price|get_sector_value_chain")
_LEAK_DEFAULTAPI = re.compile(r"^.*default_api\..*$", re.MULTILINE)          # mọi dòng chứa default_api.
_LEAK_TOOLCALL   = re.compile(rf"^\s*(?:print\s*\(\s*)?(?:default_api\.)?(?:{_TOOL_NAMES})\s*\(.*$",
                              re.IGNORECASE | re.MULTILINE)                  # dòng gọi tool dạng code
_LONG_DASHES     = re.compile(r"-{20,}")                                     # gạch ngang runaway → ---
_TABLE_SEP       = re.compile(r"^\s*\|?[\s:|]*-{2,}[\s:|-]*\|?\s*$")          # dòng phân cách bảng markdown


def _drop_empty_tables(txt: str) -> str:
    """Bỏ bảng markdown CHỈ có header + dòng phân cách mà KHÔNG có dòng dữ liệu (bảng rỗng)."""
    lines = txt.split("\n")
    out, i = [], 0
    while i < len(lines):
        if ("|" in lines[i] and i + 1 < len(lines) and _TABLE_SEP.match(lines[i + 1])):
            j = i + 2
            data = 0
            while j < len(lines) and lines[j].strip().startswith("|"):
                if not _TABLE_SEP.match(lines[j]):
                    data += 1
                j += 1
            if data == 0:                 # header + separator, 0 dòng dữ liệu → bỏ cả cụm
                i = j
                continue
        out.append(lines[i]); i += 1
    return "\n".join(out)


_DISCLAIMER = "⚠️ Thông tin chỉ mang tính tham khảo, không phải khuyến nghị đầu tư."


def ensure_disclaimer(txt: str) -> str:
    """Chuẩn đạo đức (no-recommendation): bảo đảm câu PHÂN TÍCH cổ phiếu có disclaimer — append nếu thiếu."""
    if not txt or len(txt) < 200:
        return txt
    low = txt.lower()
    if "không phải khuyến nghị" in low or "khuyến nghị đầu tư" in low:
        return txt
    if any(k in low for k in ("p/e", "peg", "định giá", "roe", "biên", "cổ phiếu", "vùng giá", "lnst", "doanh thu")):
        return txt.rstrip() + "\n\n" + _DISCLAIMER
    return txt


def sanitize_citations(txt: str) -> str:
    """Guardrail câu trả lời: bỏ trích dẫn KG/nội bộ không hợp lệ + RÒ CODE-TOOL + rác bảng/gạch ngang.
    Giữ nguyên link web [..](http…). Dùng ở app.py + service."""
    if not txt:
        return txt
    # 1) Chặn rò code-tool + gạch ngang runaway TRƯỚC (rác nặng nhất)
    txt = _LEAK_DEFAULTAPI.sub("", txt)
    txt = _LEAK_TOOLCALL.sub("", txt)
    txt = _LONG_DASHES.sub("---", txt)
    # 2) Trích dẫn KG/trọng số/nội bộ
    txt = _CITE_KG.sub("", txt)
    txt = _CITE_WEIGHT_PAREN.sub("", txt)
    txt = _CITE_WEIGHT_BARE.sub("", txt)

    def _repl(m):
        inner = m.group(0)
        date = inner.split("·", 1)[1].strip(" ]*").strip() if "·" in inner else ""
        return f"(cập nhật {date})" if date else ""

    txt = _CITE_INTERNAL.sub(_repl, txt)
    # 3) Dọn rác còn lại
    txt = re.sub(r"\*\*\s*\*\*", "", txt)        # "** **" rỗng do bỏ tag
    txt = re.sub(r"[ \t]{2,}", " ", txt)
    txt = re.sub(r"\s+([.,;:])", r"\1", txt)      # dấu câu lơ lửng
    txt = re.sub(r"\(\s*\)", "", txt)
    txt = _drop_empty_tables(txt)
    txt = re.sub(r"\n{3,}", "\n\n", txt)          # gộp dòng trống thừa
    return txt.strip()

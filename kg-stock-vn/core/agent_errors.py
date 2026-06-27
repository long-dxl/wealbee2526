"""
Error Experience Framework — P2 của redesign UX (Deliverable 7).

Nguyên tắc: TUYỆT ĐỐI không để lọt ra UI người dùng các chuỗi kỹ thuật:
None / null / undefined / Traceback / Exception / *Error / SSL / stack /
HTTP 4xx-5xx / RESOURCE_EXHAUSTED …

Hai loại lỗi:
  1) GLOBAL  — vòng gọi model thất bại → thay chuỗi lỗi thô bằng thông điệp
               bình tĩnh + gợi ý hành động (dùng ở send_and_track).
  2) SOFT    — 1 tool lẻ rỗng/gián đoạn trong khi cả lượt vẫn trả lời được →
               hiện 1 dòng amber nhẹ trong timeline (Layer 2), không chặn.

Module thuần Python — không phụ thuộc Streamlit.
"""

from __future__ import annotations
import re

import core.tool_translations as _tt

# ──────────────────────────────────────────────────────────────────────
# 1) GLOBAL ERROR — phân loại theo dấu hiệu trong chuỗi lỗi
# ──────────────────────────────────────────────────────────────────────
_PATTERNS: list[tuple[str, str]] = [
    ("RATE_LIMIT", r"429|RESOURCE_EXHAUSTED|quota|rate limit"),
    ("OVERLOAD",   r"503|UNAVAILABLE|overloaded"),
    ("AUTH",       r"401|403|PERMISSION_DENIED|API[_ ]?key|API_KEY_INVALID|unauthor"),
    ("TIMEOUT",    r"timeout|timed out|DeadlineExceeded|504"),
    ("NETWORK",    r"SSL|CERTIFICATE|getaddrinfo|Max retries|Failed to establish|"
                   r"ConnectionError|connection (?:reset|refused|aborted)|Name or service"),
    ("BAD_REQUEST",r"\b400\b|INVALID_ARGUMENT|safety|blocked"),
]

# Thông điệp người dùng — bình tĩnh, có hành động gợi ý. {model} điền nếu có.
_GLOBAL_COPY: dict[str, str] = {
    "RATE_LIMIT":  "Mô hình {model} đã hết lượt miễn phí hôm nay. Bạn thử lại sau ít phút, "
                   "hoặc chọn mô hình khác ở nút chọn model.",
    "OVERLOAD":    "Hệ thống AI đang quá tải tạm thời. Vui lòng thử lại sau giây lát.",
    "AUTH":        "Kết nối tới dịch vụ AI đang gặp trục trặc xác thực. Vui lòng thử lại sau.",
    "TIMEOUT":     "Yêu cầu mất nhiều thời gian hơn dự kiến. Bạn thử hỏi lại, hoặc thu hẹp câu hỏi.",
    "NETWORK":     "Kết nối mạng tới dịch vụ AI đang gián đoạn. Vui lòng thử lại sau giây lát.",
    "BAD_REQUEST": "Mình chưa xử lý được yêu cầu này. Bạn thử diễn đạt lại câu hỏi nhé.",
    "UNKNOWN":     "Đã có trục trặc tạm thời khi phân tích. Vui lòng thử lại — nếu vẫn lỗi, "
                   "bạn thử đổi mô hình hoặc hỏi lại sau ít phút.",
}


def classify(err) -> str:
    s = str(err or "")
    for code, pat in _PATTERNS:
        if re.search(pat, s, re.IGNORECASE):
            return code
    return "UNKNOWN"


def friendly_global_error(err, model: str | None = None) -> str:
    """Chuỗi lỗi thô → thông điệp người dùng. KHÔNG bao giờ chứa chi tiết kỹ thuật."""
    code = classify(err)
    msg = _GLOBAL_COPY.get(code, _GLOBAL_COPY["UNKNOWN"])
    return msg.format(model=model or "này")


# ──────────────────────────────────────────────────────────────────────
# 2) FINAL GUARD — chốt chặn cuối: chỉ thay khi text RÕ RÀNG là lỗi rò rỉ
#    (giữ nguyên văn bản phân tích bình thường, tránh false-positive).
# ──────────────────────────────────────────────────────────────────────
_LEAK_SIGNS = re.compile(
    r"Traceback|_ssl\.c|RESOURCE_EXHAUSTED|CERTIFICATE_VERIFY|"
    r"\b[A-Za-z_]+Error\b|Exception\b|stack trace|undefined|"
    r"^Lỗi \(.*\):|HTTP \d{3}",
    re.IGNORECASE | re.MULTILINE,
)


def looks_like_raw_error(text: str) -> bool:
    return bool(text) and bool(_LEAK_SIGNS.search(text))


def sanitize(text: str) -> str:
    """Chốt chặn cuối trước khi render. Chỉ can thiệp nếu text lộ dấu hiệu lỗi thô."""
    if looks_like_raw_error(text):
        return friendly_global_error(text)
    return text


# ──────────────────────────────────────────────────────────────────────
# 3) SOFT ERROR — 1 tool lẻ rỗng/gián đoạn → dòng amber nhẹ trong timeline
# ──────────────────────────────────────────────────────────────────────
_SOFT_COPY: dict[str, str] = {
    "INVALID":  "Mã “{obj}” chưa có dữ liệu phù hợp — đã bỏ qua, dùng phần còn lại",
    "EMPTY":    "Chưa có dữ liệu cho {label} ở nguồn này — đã tiếp tục với phần có sẵn",
    "DB_ERROR": "Nguồn {source} tạm gián đoạn — phân tích dựa trên dữ liệu còn lại",
    "ERROR":    "Một nguồn dữ liệu chưa phản hồi — đã tiếp tục với phần có sẵn",
}
_SOFT_STATUSES = set(_SOFT_COPY.keys())


def _result_of(call: dict) -> dict:
    r = (call or {}).get("result")
    return r if isinstance(r, dict) else {}


def soft_note_for_call(call: dict) -> str | None:
    """Nếu tool call lỗi/rỗng → trả 1 dòng thân thiện; ngược lại None."""
    res = _result_of(call)
    status = str(res.get("status") or "").upper()
    if status not in _SOFT_STATUSES:
        # vài tool báo lỗi chỉ bằng key 'error' không kèm status
        if res.get("error") and not res.get("status"):
            status = "ERROR"
        else:
            return None
    t = _tt.translate_tool(call)
    meta = _tt.TOOL_META.get((call or {}).get("tool", "")) or {}
    obj = t.get("obj_text") or "—"
    label = t.get("past", "dữ liệu").replace("Đã ", "").lower()
    return _SOFT_COPY[status].format(obj=obj, label=label,
                                     source=meta.get("source", "dữ liệu"))


def collect_soft_notes(tool_calls: list) -> list[str]:
    """Gom & loại trùng các soft-note từ toàn bộ tool calls."""
    notes: list[str] = []
    for call in (tool_calls or []):
        n = soft_note_for_call(call)
        if n and n not in notes:
            notes.append(n)
    return notes

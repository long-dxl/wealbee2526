"""
verifier.py — LỚP KIỂM ĐỊNH HẬU KIỂM (deterministic "shadow/reflection" — học từ FinRobot SingleAssistantShadow,
nhưng làm bằng CODE để chắc + rẻ với model lite, không dùng multi-agent free-chat).

Đảm bảo 2 thứ AN TOÀN (không viết lại nội dung, chỉ trung hoà cụm nguy hiểm + gắn cờ):
  1) KHÔNG để lọt LỜI KHUYẾN NGHỊ MUA/BÁN của HỆ THỐNG (giữ nguyên khuyến nghị của CTCK có nguồn/link).
  2) Luôn có disclaimer.

audit()  → non-destructive: trả danh sách vấn đề (cho eval + log).
enforce() → áp SỬA AN TOÀN (trung hoà cụm advice ở dòng KHÔNG có nguồn CTCK) + đảm bảo disclaimer.
"""
import re

# Cụm = LỜI KHUYÊN của hệ thống (token nguy hiểm, regex) → bản trung hoà
_NEUTRALIZE = [
    (re.compile(r"\bnên mua\b", re.I), "có thể quan tâm"),
    (re.compile(r"\bnên bán\b", re.I), "cần theo dõi sát"),
    (re.compile(r"\bnên nắm giữ\b", re.I), "có thể tiếp tục theo dõi"),
    (re.compile(r"\bnên giải ngân\b", re.I), "cần cân nhắc kỹ"),
    (re.compile(r"\bhãy mua\b", re.I), "có thể tìm hiểu thêm"),
    (re.compile(r"\bmua gom\b", re.I), "tích lũy thông tin"),
    (re.compile(r"\bkhuyến nghị mua\b", re.I), "lưu ý theo dõi"),
    (re.compile(r"\bkhuyến nghị bán\b", re.I), "lưu ý rủi ro"),
]
# Cụm phân bổ danh mục (advice mạnh) → cờ audit (không tự xoá để tránh hỏng bảng)
_ALLOC = re.compile(r"phân bổ danh mục|phân bổ tỷ trọng|tỷ trọng danh mục|\bDCA\b|core-value-growth", re.I)
# Dòng được MIỄN (khuyến nghị của BÊN THỨ BA có nguồn) — không trung hoà.
_THIRD_PARTY = re.compile(r"MBS|SSI|Vietcap|VCBS|KBSV|BSC|VNDIRECT|Mirae|HSC|\]\(https?://|CTCK|môi giới", re.I)


def audit(text: str) -> list:
    """Trả danh sách vấn đề (không sửa). Dùng cho eval/log."""
    issues = []
    for line in text.split("\n"):
        if _THIRD_PARTY.search(line):
            continue
        for rx, _ in _NEUTRALIZE:
            if rx.search(line):
                issues.append(("reco_leak", line.strip()[:80]))
                break
        if _ALLOC.search(line):
            issues.append(("allocation_advice", line.strip()[:80]))
    if not re.search(r"tham khảo|không phải.*khuyến nghị|tự chịu trách nhiệm", text, re.I):
        issues.append(("missing_disclaimer", ""))
    return issues


def enforce(text: str) -> tuple[str, list]:
    """Áp sửa AN TOÀN → (text_sạch, issues_đã_xử_lý). Chỉ trung hoà cụm advice ở dòng KHÔNG có nguồn CTCK."""
    issues = audit(text)
    out = []
    for line in text.split("\n"):
        if _THIRD_PARTY.search(line):           # giữ nguyên khuyến nghị CTCK (có nguồn)
            out.append(line); continue
        for rx, repl in _NEUTRALIZE:            # trung hoà lời khuyên của hệ thống
            line = rx.sub(repl, line)
        out.append(line)
    fixed = "\n".join(out)
    # đảm bảo disclaimer (nếu thiếu)
    if not re.search(r"tham khảo|không phải.*khuyến nghị|tự chịu trách nhiệm", fixed, re.I):
        fixed += "\n\n⚠️ Thông tin chỉ mang tính tham khảo, không phải khuyến nghị đầu tư."
    return fixed, issues

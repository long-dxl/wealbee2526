#!/usr/bin/env python3
"""
seed_vn_macro.py — Trích CHỈ SỐ VĨ MÔ VIỆT NAM dạng SỐ từ tin đã crawl (market_news) bằng
GPT-4.1-mini → bảng `vn_macro`. VN macro số không có API free sạch (vnstock/GSO/SBV không có),
nên tái dùng tin mình đã thu thập (12 báo VN) — LƯU snippet + link nguồn để verify, KHÔNG bịa.

Chạy: python seed_vn_macro.py   (cron 1 lần/ngày)
"""
import os
import json
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from supabase import create_client
from openai import OpenAI

load_dotenv()
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))
oai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"), max_retries=1, timeout=60.0)

# 8 chỉ số theo tham khảo miquant (code cố định)
TARGETS = {
    "gdp":            "Tăng trưởng GDP",
    "cpi":            "CPI / Lạm phát",
    "policy_rate":    "Lãi suất điều hành (NHNN/SBV)",
    "interbank_rate": "Lãi suất liên ngân hàng qua đêm",
    "credit_growth":  "Tăng trưởng tín dụng",
    "pmi":            "PMI sản xuất (S&P Global)",
    "trade_balance":  "Cán cân thương mại (xuất siêu + / nhập siêu -)",
    "fdi":            "Vốn FDI thực hiện",
}

SYSTEM = (
    "Bạn là trợ lý dữ liệu vĩ mô Việt Nam. Từ danh sách TIN dưới đây, trích GIÁ TRỊ MỚI NHẤT "
    "cho từng chỉ số. TUYỆT ĐỐI chỉ lấy số CÓ THẬT trong tin — KHÔNG suy diễn, KHÔNG bịa. "
    "Nếu không có tin nào nêu chỉ số đó → để null. Với mỗi số: kèm 'period' (kỳ, vd 'Q2/2026', "
    "'Tháng 6/2026', 'YTD 2026'), 'source_title' (tiêu đề tin nguồn), 'source_url', và 'note' "
    "ngắn (<=12 từ). Đơn vị: GDP/CPI/lãi suất/tín dụng = %, PMI = điểm, cán cân TM & FDI = tỷ USD."
)


KEYWORDS = ["GDP", "CPI", "lạm phát", "lãi suất", "tín dụng", "PMI", "FDI",
            "xuất siêu", "nhập siêu", "cán cân thương mại", "tỷ giá", "tăng trưởng"]


def fetch_news(days: int = 45, limit: int = 150) -> list[dict]:
    """Quét tin có TỪ KHÓA vĩ mô (bất kể news_type — nhiều tin GDP/FDI/Fed là null)."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    or_filter = ",".join(f"title.ilike.%{k}%" for k in KEYWORDS)
    rows = (sb.table("market_news")
            .select("title,content_summary,article_url,published_at")
            .gte("published_at", since).or_(or_filter)
            .order("published_at", desc=True).limit(limit).execute().data) or []
    return rows


def main():
    print("=" * 55)
    print(f"🇻🇳  Trích VN macro từ tin (GPT-4.1-mini) — {datetime.now():%d/%m/%Y %H:%M}")
    print("=" * 55)
    news = fetch_news()
    if not news:
        print("Không có tin vĩ mô để trích."); return
    # Đánh SỐ mỗi tin → LLM trích 'src' = số này → attribution chính xác
    ctx = "\n".join(
        f"[{i}] ({(n.get('published_at') or '')[:10]}) {n.get('title','')} — "
        f"{(n.get('content_summary') or '')[:220]}"
        for i, n in enumerate(news)
    )[:16000]

    schema_hint = json.dumps({k: {"value": None, "unit": "", "period": "", "note": "", "src": None} for k in TARGETS}, ensure_ascii=False)
    user = (f"CHỈ SỐ CẦN TRÍCH (code → tên):\n" +
            "\n".join(f"  {k}: {v}" for k, v in TARGETS.items()) +
            f"\n\nTIN (mỗi tin có số [i]):\n{ctx}\n\n"
            f"Với mỗi chỉ số, trích 'value' (số) + 'unit' + 'period' + 'note' (<=12 từ) + "
            f"'src' = SỐ [i] của tin chứa con số đó. Nếu không tin nào nêu → value=null, src=null. "
            f"Trả DUY NHẤT JSON đúng khung:\n{schema_hint}")

    resp = oai.chat.completions.create(
        model="gpt-4.1-mini", temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
    )
    data = json.loads(resp.choices[0].message.content)

    today = datetime.now(timezone(timedelta(hours=7))).date().isoformat()
    rows, ok = [], 0
    for code, name in TARGETS.items():
        d = data.get(code) or {}
        val = d.get("value")
        if val is None:
            print(f"  {code:15} — không có trong tin")
            continue
        src = d.get("src")
        n = news[src] if isinstance(src, int) and 0 <= src < len(news) else {}
        rows.append({
            "code": code, "name": name, "value": val,
            "unit": d.get("unit") or ("%" if code not in ("pmi", "trade_balance", "fdi") else ("điểm" if code == "pmi" else "tỷ USD")),
            "period": d.get("period"), "note": (d.get("note") or "")[:120],
            "source_title": (n.get("title") or "")[:200], "source_url": n.get("article_url"),
            "as_of": today, "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        ok += 1
        print(f"  {code:15} {val} {rows[-1]['unit']:7} | {d.get('period')} | src[{src}] {(n.get('title') or '')[:45]}")
    if rows:
        sb.table("vn_macro").upsert(rows, on_conflict="code").execute()
    print(f"\n✅ {ok}/{len(TARGETS)} chỉ số VN macro cập nhật (vn_macro)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
seed_worldbank_macro.py — Kéo LỊCH SỬ vĩ mô Việt Nam từ World Bank API
(free, KHÔNG cần API key, chính chủ, ổn định) → bảng `vn_macro_history`.

Đây là NỀN lịch sử/năm đáng tin (bổ sung cho vn_macro = số mới nhất theo quý/tháng trích từ tin).
World Bank là số THEO NĂM và trễ (GDP/CPI tới năm trước, vài chỉ số trễ 2-3 năm) — dùng cho
xu hướng & số "chốt", không phải số quý mới nhất.

Chạy: python seed_worldbank_macro.py
"""
import os
import requests
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))

# code nội bộ -> (mã World Bank, tên VN, đơn vị, chia (đổi sang tỷ USD nếu cần))
INDICATORS = {
    "gdp_growth":      ("NY.GDP.MKTP.KD.ZG", "Tăng trưởng GDP",    "%",       1),
    "cpi":             ("FP.CPI.TOTL.ZG",    "Lạm phát CPI",       "%",       1),
    "gdp_usd":         ("NY.GDP.MKTP.CD",    "Quy mô GDP",         "tỷ USD",  1e9),
    "fdi":             ("BX.KLT.DINV.CD.WD", "FDI ròng",           "tỷ USD",  1e9),
    "current_account": ("BN.CAB.XOKA.CD",    "Cán cân vãng lai",   "tỷ USD",  1e9),
    "lending_rate":    ("FR.INR.LEND",       "Lãi suất cho vay",   "%",       1),
    "unemployment":    ("SL.UEM.TOTL.ZS",    "Tỷ lệ thất nghiệp",  "%",       1),
}

FROM_YEAR = datetime.now().year - 7   # ~7 năm gần nhất


def fetch_wb(wb_code: str) -> list[tuple[int, float]]:
    """Trả [(year, value)] non-null, mới→cũ. [] nếu lỗi."""
    try:
        url = (f"https://api.worldbank.org/v2/country/VNM/indicator/{wb_code}"
               f"?format=json&date={FROM_YEAR}:{datetime.now().year}&per_page=100")
        r = requests.get(url, timeout=25)
        if not r.ok:
            return []
        js = r.json()
        rows = js[1] if isinstance(js, list) and len(js) > 1 and js[1] else []
        return [(int(x["date"]), float(x["value"])) for x in rows if x.get("value") is not None]
    except Exception as e:
        print(f"  {wb_code}: ERROR {e}")
        return []


def main():
    print("=" * 55)
    print(f"🌐  World Bank — lịch sử vĩ mô VN ({datetime.now():%d/%m/%Y %H:%M})")
    print("=" * 55)
    rows, ok = [], 0
    for code, (wb, name, unit, div) in INDICATORS.items():
        series = fetch_wb(wb)
        if not series:
            print(f"  {code:16} ({wb}): không lấy được")
            continue
        for year, val in series:
            v = round(val / div, 2)
            rows.append({"code": code, "year": year, "name": name, "value": v,
                         "unit": unit, "source": "World Bank",
                         "updated_at": datetime.utcnow().isoformat()})
        ok += 1
        latest = series[0]
        print(f"  {code:16} {name:20} | mới nhất {latest[0]}: {round(latest[1]/div,2)} {unit} | {len(series)} năm")
    if rows:
        sb.table("vn_macro_history").upsert(rows, on_conflict="code,year").execute()
    print(f"\n✅ {ok}/{len(INDICATORS)} chỉ số · {len(rows)} dòng (code×năm) → vn_macro_history")


if __name__ == "__main__":
    main()

"""
macro_radar.py — RADAR TIN VĨ MÔ QUỐC TẾ → Event Graph (KG v2).
Giải lỗ hổng: hệ thống chỉ crawl Vietstock → MÙ với cú sốc vĩ mô toàn cầu
(giá dầu/Hormuz, Fed, địa chính trị, thuế quan). Radar này:
  1. web_search nguồn quốc tế/VN theo các CHỦ ĐỀ vĩ mô then chốt.
  2. Gemini xác định CHIỀU động lực (tăng/giảm) + mức trọng yếu.
  3. Sinh SỰ KIỆN macro + TÁC ĐỘNG ĐA NGÀNH (theo bản đồ truyền dẫn chuyên gia).

    python3 -m data.macro_radar
"""
import os
import json
import time
import hashlib
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client
from google import genai
from google.genai import types

load_dotenv()
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))
gem = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
MODEL = "gemini-3.1-flash-lite"

import core.agent_config as ac   # dùng lại web_search


# ── Bản đồ TRUYỀN DẪN (chuyên gia mã hóa). Mỗi chủ đề: chiều động lực → tác động ngành ──
# entity_id phải khớp entities (SEC_SECTOR_* + MAC_VNINDEX).
MACRO_TOPICS = [
    {
        "key": "oil", "event_type": "MACRO.OIL", "label": "Giá dầu / Năng lượng",
        "driver": "giá dầu thế giới",
        "queries": [("oil price Brent crude OPEC Strait of Hormuz", True),
                    ("giá dầu Brent thế giới", False)],
        "impacts": {
            "DECREASE": [("SEC_SECTOR_OIL_GAS", "NEGATIVE", "Giá dầu giảm → doanh thu/biên thượng nguồn giảm"),
                         ("SEC_SECTOR_AVIATION", "POSITIVE", "Nhiên liệu (~30-40% chi phí) rẻ hơn"),
                         ("SEC_SECTOR_PLASTIC", "POSITIVE", "Hạt nhựa gốc dầu rẻ hơn → biên tăng"),
                         ("SEC_SECTOR_FERTILIZER", "POSITIVE", "Khí/đầu vào rẻ hơn"),
                         ("SEC_SECTOR_LOGISTICS", "POSITIVE", "Chi phí nhiên liệu vận tải giảm")],
        },
    },
    {
        "key": "fed", "event_type": "MACRO.RATE", "label": "Lãi suất Fed / Mỹ",
        "driver": "lãi suất Fed",
        "queries": [("Federal Reserve interest rate decision FOMC", True)],
        "impacts": {
            "INCREASE": [("SEC_SECTOR_REALESTATE", "NEGATIVE", "Lãi suất cao → chi phí vốn tăng, cầu BĐS giảm"),
                         ("SEC_SECTOR_SECURITIES", "NEGATIVE", "Định giá & dòng tiền vào chứng khoán giảm"),
                         ("MAC_VNINDEX", "NEGATIVE", "Áp lực tỷ giá + vốn ngoại rút khỏi TT mới nổi")],
        },
    },
    {
        "key": "geo", "event_type": "MACRO.GEOPOLITICAL", "label": "Địa chính trị toàn cầu",
        "driver": "căng thẳng địa chính trị",
        "queries": [("geopolitical tension Middle East conflict markets oil", True)],
        "impacts": {
            "INCREASE": [("MAC_VNINDEX", "NEGATIVE", "Risk-off, vốn ngoại rút"),
                         ("SEC_SECTOR_OIL_GAS", "POSITIVE", "Giá dầu tăng do lo gián đoạn nguồn cung")],
            "DECREASE": [("MAC_VNINDEX", "POSITIVE", "Risk-on, giảm bất định"),
                         ("SEC_SECTOR_OIL_GAS", "NEGATIVE", "Gỡ phần bù rủi ro → giá dầu giảm")],
        },
    },
    {
        "key": "trade", "event_type": "MACRO.TRADE", "label": "Thương mại / Thuế quan",
        "driver": "rào cản thương mại với hàng Việt Nam",
        "queries": [("US tariff Vietnam trade export policy", True)],
        "impacts": {
            "INCREASE": [("SEC_SECTOR_INDUSTRIAL", "NEGATIVE", "Hàng rào thuế → xuất khẩu/KCN bất lợi"),
                         ("SEC_SECTOR_TEXTILE", "NEGATIVE", "Dệt may xuất Mỹ chịu áp lực"),
                         ("SEC_SECTOR_SEAFOOD", "NEGATIVE", "Thủy sản xuất khẩu chịu thuế")],
            "DECREASE": [("SEC_SECTOR_INDUSTRIAL", "POSITIVE", "Nới thương mại → xuất khẩu/KCN hưởng lợi"),
                         ("SEC_SECTOR_TEXTILE", "POSITIVE", "Dệt may dễ thở hơn"),
                         ("SEC_SECTOR_SEAFOOD", "POSITIVE", "Thủy sản xuất khẩu thuận lợi")],
        },
    },
]
# Một số chủ đề chỉ có 1 chiều có nghĩa (oil up cũng đảo dấu DECREASE) → tự sinh chiều đối:
for _t in MACRO_TOPICS:
    if "DECREASE" in _t["impacts"] and "INCREASE" not in _t["impacts"]:
        _t["impacts"]["INCREASE"] = [(e, "POSITIVE" if d == "NEGATIVE" else "NEGATIVE", m + " (đảo chiều)")
                                     for e, d, m in _t["impacts"]["DECREASE"]]
    if "INCREASE" in _t["impacts"] and "DECREASE" not in _t["impacts"]:
        _t["impacts"]["DECREASE"] = [(e, "POSITIVE" if d == "NEGATIVE" else "NEGATIVE", m + " (đảo chiều)")
                                     for e, d, m in _t["impacts"]["INCREASE"]]


CLASSIFY_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    required=["relevant", "driver_direction", "materiality", "market_sentiment", "title_vi", "summary"],
    properties={
        "relevant":         types.Schema(type=types.Type.BOOLEAN, description="Tin có thực sự về chủ đề & mới/quan trọng?"),
        "driver_direction": types.Schema(type=types.Type.STRING, enum=["INCREASE", "DECREASE", "NEUTRAL"],
                            description="Động lực (giá dầu/lãi suất/căng thẳng/rào cản) TĂNG hay GIẢM?"),
        "materiality":      types.Schema(type=types.Type.NUMBER, description="Mức trọng yếu với TTCK VN 0-1"),
        "market_sentiment": types.Schema(type=types.Type.STRING, enum=["POSITIVE", "NEGATIVE", "NEUTRAL"]),
        "title_vi":         types.Schema(type=types.Type.STRING, description="Tiêu đề tiếng Việt ngắn gọn"),
        "summary":          types.Schema(type=types.Type.STRING),
    },
)


def ensure_meta():
    """Upsert event_type địa chính trị/dầu + entity MAC_VNINDEX nếu chưa có."""
    sb.table("event_taxonomy").upsert([
        {"code": "MACRO.OIL", "name_vi": "Giá dầu / Năng lượng", "category": "MACRO", "parent_code": "MACRO", "default_polarity": "CONTEXT"},
        {"code": "MACRO.GEOPOLITICAL", "name_vi": "Địa chính trị toàn cầu", "category": "MACRO", "parent_code": "MACRO", "default_polarity": "CONTEXT"},
    ], on_conflict="code").execute()
    sb.table("entities").upsert(
        {"entity_id": "MAC_VNINDEX", "entity_type": "MACRO", "canonical_name": "VN-Index", "aliases": ["VN-Index", "VNINDEX"]},
        on_conflict="entity_id").execute()


def classify(topic, articles):
    items = "\n".join(f"- {a.get('title')} ({a.get('date')}): {a.get('snippet','')[:120]}" for a in articles[:4])
    prompt = (f"Chủ đề vĩ mô: {topic['label']} (động lực: {topic['driver']}). Dưới đây là các tin web mới:\n{items}\n\n"
              f"Hãy đánh giá: tin có THỰC SỰ về chủ đề này & MỚI/quan trọng không (relevant); động lực "
              f"'{topic['driver']}' đang TĂNG hay GIẢM (driver_direction); mức trọng yếu với TTCK Việt Nam; "
              f"market_sentiment với TT VN; tiêu đề tiếng Việt + tóm tắt. CHỈ dựa vào tin, không bịa.")
    try:
        r = gem.models.generate_content(model=MODEL, contents=prompt,
            config=types.GenerateContentConfig(temperature=0.1, response_mime_type="application/json",
                response_schema=CLASSIFY_SCHEMA, max_output_tokens=512))
        return json.loads(r.text)
    except Exception as e:
        print(f"   ⚠️ classify lỗi: {str(e)[:80]}")
        return None


def run():
    ensure_meta()
    seen_urls = set()
    n_ev = n_imp = 0
    for topic in MACRO_TOPICS:
        # gom bài từ các query
        arts = []
        for q, intl in topic["queries"]:
            try:
                res = ac.web_search(q, num_results=5, news=True, intl=intl)
                for it in (res.get("results") or []):
                    if it.get("link") and it["link"] not in seen_urls:
                        arts.append(it)
            except Exception:
                pass
        if not arts:
            print(f"· {topic['label']}: không có tin."); continue
        c = classify(topic, arts)
        if not c or not c.get("relevant") or c.get("driver_direction") == "NEUTRAL" or (c.get("materiality") or 0) < 0.4:
            print(f"· {topic['label']}: bỏ qua (không liên quan/không trọng yếu)."); continue

        top = arts[0]
        seen_urls.add(top.get("link"))
        direction = c["driver_direction"]
        day = datetime.now(timezone.utc).date().isoformat()
        uid = hashlib.md5(f"{topic['key']}|{direction}|{day}".encode()).hexdigest()

        # dedupe theo uid
        ex = sb.table("events").select("event_id").eq("event_uid", uid).execute().data
        if ex:
            print(f"· {topic['label']}: đã có sự kiện hôm nay (bỏ trùng)."); continue

        ev = sb.table("events").insert({
            "event_uid": uid, "event_type": topic["event_type"], "scope": "macro",
            "title": c.get("title_vi") or top.get("title"), "summary": c.get("summary"),
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "sentiment": c.get("market_sentiment"), "materiality": c.get("materiality"),
            "confidence": 0.7, "primary_source_url": top.get("link"),
            "evidence_quote": top.get("title"),
            "properties": {"topic": topic["key"], "driver": topic["driver"], "driver_direction": direction},
        }).execute()
        eid = ev.data[0]["event_id"]
        n_ev += 1
        for ent, dirn, mech in topic["impacts"].get(direction, []):
            try:
                sb.table("event_impacts").insert({"event_id": eid, "entity_id": ent, "direction": dirn,
                    "strength": round(0.4 + 0.5 * (c.get("materiality") or 0.5), 2), "horizon": "SHORT",
                    "mechanism": mech, "confidence": 0.7}).execute()
                n_imp += 1
            except Exception:
                pass
        print(f"✓ {topic['label']}: {topic['driver']} {direction} (mat {c.get('materiality')}) → {len(topic['impacts'].get(direction,[]))} ngành. {c.get('title_vi','')[:50]}")
        time.sleep(0.5)

    print(f"\n✅ Macro radar: {n_ev} sự kiện vĩ mô quốc tế · {n_imp} tác động ngành.")


if __name__ == "__main__":
    run()

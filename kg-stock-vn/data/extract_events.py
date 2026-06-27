"""
extract_events.py — PHASE 1 KG v2: trích SỰ KIỆN hạng nhất từ news_articles.

Luồng mỗi bài:
  1. Entity resolution: ticker/tên → entity_id canonical (CO_/SEC_/MAC_).
  2. LLM trích: event_type (taxonomy) + sentiment + materiality + participants + impacts.
  3. Dedupe qua event_uid = hash(event_type | thực thể chính | ngày).
  4. Ghi events / event_participants / event_impacts; link news_articles.event_id.

    python3 -m data.extract_events [--limit N] [--reset]
"""
import os
import sys
import json
import time
import hashlib
import argparse
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client
from google import genai
from google.genai import types

load_dotenv()
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))
gem = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
MODEL = "gemini-3.1-flash-lite"


# ============================================================
# ENTITY RESOLUTION
# ============================================================
def load_resolver():
    """Trả (ticker_map, alias_map, sector_name_map) để resolve tên/mã → entity_id."""
    ents = sb.table("entities").select("entity_id,entity_type,canonical_name,ticker,aliases").execute().data
    ticker_map, alias_map, sector_map = {}, {}, {}
    for e in ents:
        eid = e["entity_id"]
        if e.get("ticker"):
            ticker_map[e["ticker"].upper()] = eid
        for a in (e.get("aliases") or []) + [e.get("canonical_name")]:
            if a:
                alias_map.setdefault(a.strip().lower(), eid)
        if e["entity_type"] == "SECTOR":
            # tên ngành rút gọn: "Ngành Thép / Vật liệu" → khớp 'thép'
            sector_map[(e.get("canonical_name") or "").lower()] = eid
    return ticker_map, alias_map, sector_map


def resolve(name, ticker_map, alias_map):
    """Resolve 1 chuỗi (mã hoặc tên) → entity_id; None nếu không khớp."""
    if not name:
        return None
    s = name.strip()
    if s.upper() in ticker_map:
        return ticker_map[s.upper()]
    if s.lower() in alias_map:
        return alias_map[s.lower()]
    # khớp mềm: alias là con của tên (vd "Tập đoàn FPT" chứa "fpt")
    low = s.lower()
    for alias, eid in alias_map.items():
        if len(alias) >= 3 and (alias in low or low in alias):
            return eid
    return None


# ============================================================
# LLM EXTRACTION
# ============================================================
def build_schema(valid_codes):
    return types.Schema(
        type=types.Type.OBJECT,
        required=["event_type", "sentiment", "materiality", "summary", "impacts"],
        properties={
            "event_type":  types.Schema(type=types.Type.STRING, enum=valid_codes),
            "sentiment":   types.Schema(type=types.Type.STRING, enum=["POSITIVE", "NEGATIVE", "NEUTRAL"]),
            "materiality": types.Schema(type=types.Type.NUMBER, description="Mức trọng yếu 0.0-1.0"),
            "summary":     types.Schema(type=types.Type.STRING),
            "participants": types.Schema(type=types.Type.ARRAY, items=types.Schema(
                type=types.Type.OBJECT, properties={
                    "entity": types.Schema(type=types.Type.STRING),
                    "role":   types.Schema(type=types.Type.STRING,
                              enum=["SUBJECT", "OBJECT", "ACQUIRER", "TARGET", "ISSUER", "PARTNER", "REGULATOR", "AFFECTED"]),
                })),
            "impacts": types.Schema(type=types.Type.ARRAY, items=types.Schema(
                type=types.Type.OBJECT, properties={
                    "ticker":    types.Schema(type=types.Type.STRING, description="Mã cổ phiếu chịu tác động"),
                    "direction": types.Schema(type=types.Type.STRING, enum=["POSITIVE", "NEGATIVE"]),
                    "strength":  types.Schema(type=types.Type.NUMBER, description="Độ mạnh 0.0-1.0"),
                    "horizon":   types.Schema(type=types.Type.STRING, enum=["INTRADAY", "SHORT", "MEDIUM", "LONG"]),
                    "mechanism": types.Schema(type=types.Type.STRING),
                })),
        },
    )


PROMPT = """Bạn là chuyên gia phân tích chứng khoán VN. Trích SỰ KIỆN từ tiêu đề tin dưới đây.
Mã liên quan chính: {ticker} | Phạm vi: {scope}

- event_type: CHỌN ĐÚNG MỘT mã loại sự kiện từ danh sách cho phép (theo nghĩa tiêu đề).
- sentiment: tác động tổng thể (POSITIVE/NEGATIVE/NEUTRAL).
- materiality: mức TRỌNG YẾU với nhà đầu tư (0.0 nhỏ → 1.0 rất lớn).
- participants: các thực thể tham gia (doanh nghiệp/đối tác/cơ quan) + vai trò.
- impacts: cổ phiếu NÀO chịu tác động (mã), chiều (+/-), độ mạnh, horizon, cơ chế NGẮN.
QUY TẮC: CHỈ dựa vào tiêu đề, TUYỆT ĐỐI KHÔNG bịa số/sự kiện không có. Nếu chỉ liên quan 1 mã thì impacts gồm chính mã đó.

Tiêu đề: "{title}"
"""


def extract_event(title, ticker, scope, schema, valid_codes):
    try:
        resp = gem.models.generate_content(
            model=MODEL,
            contents=PROMPT.format(title=title, ticker=ticker or "(không rõ)", scope=scope or "company"),
            config=types.GenerateContentConfig(
                temperature=0.1, response_mime_type="application/json",
                response_schema=schema, max_output_tokens=1024),
        )
        d = json.loads(resp.text)
        if d.get("event_type") not in valid_codes:
            d["event_type"] = None
        return d
    except Exception as e:
        print(f"   ⚠️ extract lỗi: {str(e)[:90]}")
        return None


def make_uid(event_type, primary_entity, occurred_at):
    day = (occurred_at or "")[:10]
    return hashlib.md5(f"{event_type}|{primary_entity}|{day}".encode("utf-8")).hexdigest()


def get_or_create_event(uid, ext, art, primary_entity):
    """Dedupe: nếu uid đã có → append article id; ngược lại insert. Trả event_id."""
    existing = sb.table("events").select("event_id,source_article_ids").eq("event_uid", uid).execute().data
    if existing:
        ev = existing[0]
        ids = list(set((ev.get("source_article_ids") or []) + [art["id"]]))
        sb.table("events").update({"source_article_ids": ids}).eq("event_id", ev["event_id"]).execute()
        return ev["event_id"], False
    row = {
        "event_uid": uid, "event_type": ext.get("event_type"),
        "scope": art.get("scope") or "company", "title": art["title"],
        "summary": ext.get("summary"), "occurred_at": art.get("published_at"),
        "sentiment": ext.get("sentiment"), "materiality": ext.get("materiality"),
        "confidence": art.get("confidence"), "source_article_ids": [art["id"]],
        "primary_source_url": art.get("url"), "evidence_quote": art["title"],
        "properties": {"primary_entity": primary_entity},
    }
    ins = sb.table("events").insert(row).execute()
    return ins.data[0]["event_id"], True


def process(limit=None, reset=False):
    valid_codes = [r["code"] for r in sb.table("event_taxonomy").select("code").not_.is_("default_polarity", "null").execute().data]
    # bao gồm cả các code CONTEXT (default_polarity not null cho hầu hết); lấy TẤT CẢ leaf:
    all_codes = [r["code"] for r in sb.table("event_taxonomy").select("code,parent_code").not_.is_("parent_code", "null").execute().data]
    valid_codes = all_codes
    schema = build_schema(valid_codes)
    ticker_map, alias_map, sector_map = load_resolver()

    if reset:
        print("→ Reset: xóa events/participants/impacts + bỏ link...")
        sb.table("event_impacts").delete().neq("id", 0).execute()
        sb.table("event_participants").delete().neq("id", 0).execute()
        sb.table("events").delete().neq("event_id", 0).execute()
        sb.table("news_articles").update({"event_id": None}).neq("id", 0).execute()

    # scope có thể chưa tồn tại (chưa chạy migration_news_scope.sql) → select degrade an toàn
    base_cols = "id,title,ticker,sector,url,published_at,confidence"
    def _fetch(with_scope):
        cols = base_cols + (",scope" if with_scope else "")
        q = sb.table("news_articles").select(cols).is_("event_id", "null").order("published_at", desc=True)
        if limit:
            q = q.limit(int(limit))
        return q.execute().data
    try:
        arts = _fetch(True)
    except Exception:
        arts = _fetch(False)
    print(f"→ {len(arts)} bài chưa trích sự kiện. Bắt đầu...")

    n_new = n_dup = n_imp = 0
    for art in arts:
        tk = (art.get("ticker") or "").upper()
        # thực thể chính
        primary = ticker_map.get(tk) if tk else None
        if not primary and art.get("scope") in ("sector", "macro"):
            primary = sector_map.get((art.get("sector") or "").lower())
        if not primary:
            primary = f"CO_{tk}" if tk else "UNKNOWN"

        ext = extract_event(art["title"], tk, art.get("scope"), schema, valid_codes)
        if not ext:
            continue
        uid = make_uid(ext.get("event_type"), primary, art.get("published_at"))
        eid, is_new = get_or_create_event(uid, ext, art, primary)
        n_new += is_new; n_dup += (not is_new)

        # participants (chỉ ghi cái resolve được; cái không thì để trong events.properties)
        unresolved = []
        for p in (ext.get("participants") or []):
            pe = resolve(p.get("entity"), ticker_map, alias_map)
            if pe:
                try:
                    sb.table("event_participants").upsert(
                        {"event_id": eid, "entity_id": pe, "role": p.get("role") or "AFFECTED"},
                        on_conflict="event_id,entity_id,role").execute()
                except Exception:
                    pass
            else:
                unresolved.append(p.get("entity"))
        # impacts
        for im in (ext.get("impacts") or []):
            ie = ticker_map.get((im.get("ticker") or "").upper()) or (primary if primary.startswith(("CO_","SEC_","MAC_")) else None)
            if not ie:
                continue
            try:
                sb.table("event_impacts").insert({
                    "event_id": eid, "entity_id": ie, "direction": im.get("direction"),
                    "strength": im.get("strength"), "horizon": im.get("horizon"),
                    "mechanism": im.get("mechanism"), "confidence": art.get("confidence")}).execute()
                n_imp += 1
            except Exception:
                pass
        # link bài → event
        sb.table("news_articles").update({"event_id": eid, "entity_id": primary}).eq("id", art["id"]).execute()
        time.sleep(0.4)  # nhẹ nhàng với Gemini lite (15 req/phút)

    print(f"\n✅ Trích sự kiện xong: {n_new} sự kiện MỚI · {n_dup} gộp trùng · {n_imp} tác động (impacts).")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--reset", action="store_true")
    args = ap.parse_args()
    process(limit=args.limit, reset=args.reset)

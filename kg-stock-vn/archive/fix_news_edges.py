"""
fix_news_edges.py
-----------------
Sửa dữ liệu MỘT LẦN: migration_temporal_kg.sql backfill TẤT CẢ edge có
data_source=NULL thành 'expert_seed' — quét nhầm cả các cạnh NEWS→STOCK.

Script này sửa lại: mọi cạnh xuất phát từ node entity_type='NEWS' phải mang
data_source='news', kèm observed_at / source_url / evidence_quote / confidence
lấy từ properties của chính NEWS node (nguồn thật, không bịa).

An toàn chạy lại nhiều lần (idempotent).
Chạy: python3 fix_news_edges.py
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=Path(__file__).parent / ".env")
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))

SENTIMENT_CONF = {"AFFECTS_POSITIVE": 0.7, "AFFECTS_NEGATIVE": 0.7, "MENTIONS": 0.4,
                  "POSITIVE": 0.7, "NEGATIVE": 0.7, "NEUTRAL": 0.4}


def fix():
    news = sb.table("graph_nodes").select(
        "id, entity_id, properties"
    ).eq("entity_type", "NEWS").execute()
    print(f"Tìm thấy {len(news.data)} NEWS node.")

    fixed, skipped = 0, 0
    for node in news.data:
        nid = node["id"]
        p = node.get("properties") or {}

        # CHỈ xử lý node có URL THẬT (http) — bỏ qua tin không nguồn (tránh seed:// giả)
        url = p.get("url") or ""
        if not url.startswith("http"):
            skipped += 1
            continue
        quote = p.get("title") or p.get("headline") or ""
        observed = p.get("published_at")
        confidence = p.get("confidence")

        # Lấy các cạnh đi ra từ node tin này
        edges = sb.table("graph_edges").select(
            "id, relationship_type"
        ).eq("source_id", nid).execute()

        for e in edges.data:
            conf = confidence
            if conf is None:
                conf = SENTIMENT_CONF.get(e["relationship_type"], 0.5)
            patch = {
                "data_source":    "news",
                "source_url":     url,
                "evidence_quote": quote,
                "confidence":     conf,
            }
            if observed:
                patch["observed_at"] = observed
            sb.table("graph_edges").update(patch).eq("id", e["id"]).execute()
            fixed += 1

        if not edges.data:
            skipped += 1

    print(f"✅ Đã sửa {fixed} cạnh NEWS→STOCK sang data_source='news'.")
    print(f"   ({skipped} node tin không có cạnh nào.)")

    # Xác minh nhanh
    chk = sb.table("graph_edges").select(
        "id", count="exact"
    ).eq("data_source", "news").execute()
    print(f"   Tổng edges data_source='news' hiện tại: {chk.count}")


if __name__ == "__main__":
    fix()

"""
sync_top10_graph.py
-------------------
ETL Pipeline: Đọc dữ liệu phẳng (flat data) → chuyển đổi sang Graph Nodes/Edges
→ upsert vào Supabase Knowledge Graph.

Dữ liệu đầu vào giả lập (mock data) đại diện cho:
  - Dữ liệu cơ bản của 10 mã cổ phiếu (fundamentals)
  - Chỉ số vĩ mô hiện tại (macro indicators)
  - Tin tức tài chính gần đây (news events)

Chạy: python sync_top10_graph.py
"""

import os
import json
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

# Tải biến môi trường từ file .env
load_dotenv()

# ============================================================
# CẤU HÌNH KẾT NỐI SUPABASE
# ============================================================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")  # Service key để bypass RLS

if not SUPABASE_URL or not SUPABASE_KEY:
    raise EnvironmentError(
        "Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SERVICE_KEY.\n"
        "Hãy copy .env.example → .env và điền thông tin từ Supabase dashboard."
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print(f"✅ Đã kết nối Supabase: {SUPABASE_URL}")


# ============================================================
# DỮ LIỆU PHẲNG MẪU (Mock Flat Data)
# Trong hệ thống thực, phần này sẽ đọc từ API/database thực
# ============================================================

# --- Dữ liệu cơ bản cổ phiếu (fundamentals) ---
STOCK_FUNDAMENTALS = [
    {
        "ticker": "HPG",
        "name": "Tập đoàn Hòa Phát",
        "pe_ratio": 8.5,
        "pb_ratio": 1.2,
        "revenue_ttm_bn_vnd": 145000,   # doanh thu TTM, tỷ VND
        "net_profit_ttm_bn_vnd": 8500,
        "roe": 14.2,
        "debt_to_equity": 0.85,
        "price_vnd": 24500,
        "usd_debt_pct": 35,             # % nợ bằng USD
        "sector": "steel",
    },
    {
        "ticker": "VHM",
        "name": "Vinhomes",
        "pe_ratio": 12.0,
        "pb_ratio": 2.1,
        "revenue_ttm_bn_vnd": 89000,
        "net_profit_ttm_bn_vnd": 22000,
        "roe": 22.5,
        "debt_to_equity": 1.4,
        "price_vnd": 42000,
        "interest_rate_sensitive": True,
        "sector": "real_estate",
    },
    {
        "ticker": "VIC",
        "name": "Tập đoàn Vingroup",
        "pe_ratio": 35.0,
        "pb_ratio": 3.2,
        "revenue_ttm_bn_vnd": 195000,
        "net_profit_ttm_bn_vnd": 3500,
        "roe": 5.8,
        "debt_to_equity": 2.1,
        "price_vnd": 57000,
        "interest_rate_sensitive": True,
        "sector": "conglomerate",
    },
    {
        "ticker": "VCB",
        "name": "Ngân hàng Vietcombank",
        "pe_ratio": 14.5,
        "pb_ratio": 2.8,
        "revenue_ttm_bn_vnd": 62000,
        "net_profit_ttm_bn_vnd": 21000,
        "roe": 18.9,
        "nim": 3.2,                     # Net Interest Margin
        "npl_ratio": 1.1,               # Tỷ lệ nợ xấu
        "price_vnd": 89000,
        "state_owned": True,
        "sector": "banking",
    },
    {
        "ticker": "TCB",
        "name": "Ngân hàng Techcombank",
        "pe_ratio": 11.2,
        "pb_ratio": 1.9,
        "revenue_ttm_bn_vnd": 38000,
        "net_profit_ttm_bn_vnd": 14000,
        "roe": 17.5,
        "nim": 4.1,
        "npl_ratio": 1.6,
        "real_estate_loan_pct": 32,     # % cho vay BĐS trên tổng dư nợ
        "price_vnd": 28000,
        "sector": "banking",
    },
    {
        "ticker": "BID",
        "name": "Ngân hàng BIDV",
        "pe_ratio": 13.0,
        "pb_ratio": 2.3,
        "revenue_ttm_bn_vnd": 72000,
        "net_profit_ttm_bn_vnd": 19000,
        "roe": 16.2,
        "nim": 2.9,
        "npl_ratio": 1.4,
        "price_vnd": 46000,
        "state_owned": True,
        "sector": "banking",
    },
    {
        "ticker": "MSN",
        "name": "Tập đoàn Masan",
        "pe_ratio": 42.0,
        "pb_ratio": 4.5,
        "revenue_ttm_bn_vnd": 78000,
        "net_profit_ttm_bn_vnd": 2800,
        "roe": 8.1,
        "debt_to_equity": 1.8,
        "price_vnd": 65000,
        "raw_material_import_pct": 20,
        "sector": "consumer_retail",
    },
    {
        "ticker": "VNM",
        "name": "Công ty CP Sữa Việt Nam",
        "pe_ratio": 18.5,
        "pb_ratio": 3.8,
        "revenue_ttm_bn_vnd": 60000,
        "net_profit_ttm_bn_vnd": 8200,
        "roe": 24.1,
        "debt_to_equity": 0.15,
        "price_vnd": 72000,
        "import_material_pct": 30,      # % nguyên liệu nhập khẩu
        "export_revenue_pct": 15,
        "sector": "consumer_staples",
    },
    {
        "ticker": "MWG",
        "name": "Công ty CP Thế Giới Di Động",
        "pe_ratio": 22.0,
        "pb_ratio": 3.1,
        "revenue_ttm_bn_vnd": 120000,
        "net_profit_ttm_bn_vnd": 3500,
        "roe": 15.3,
        "debt_to_equity": 0.6,
        "price_vnd": 58000,
        "consumer_spending_sensitive": True,
        "sector": "retail",
    },
    {
        "ticker": "FPT",
        "name": "Công ty CP FPT",
        "pe_ratio": 25.0,
        "pb_ratio": 5.2,
        "revenue_ttm_bn_vnd": 58000,
        "net_profit_ttm_bn_vnd": 7800,
        "roe": 26.8,
        "debt_to_equity": 0.3,
        "price_vnd": 145000,
        "export_revenue_pct": 52,       # % doanh thu xuất khẩu IT
        "sector": "technology",
    },
]

# --- Dữ liệu vĩ mô hiện tại ---
MACRO_DATA = {
    "TY_GIA_USD_VND": {
        "value": 25150,
        "unit": "VND per USD",
        "change_pct_ytd": 3.2,          # % thay đổi từ đầu năm
        "trend": "UPWARD",
        "source": "SBV",
    },
    "LAI_SUAT_FED": {
        "value": 4.25,
        "unit": "percent",
        "change_bps_recent": -25,       # basis points thay đổi gần nhất
        "trend": "DOWNWARD",
        "source": "Federal Reserve",
    },
    "LAI_SUAT_VN": {
        "value": 4.5,
        "unit": "percent",
        "change_bps_recent": 0,
        "trend": "STABLE",
        "source": "SBV",
    },
    "GIA_THEP_HRC": {
        "value": 520,
        "unit": "USD per ton",
        "change_pct_mom": -2.1,         # % thay đổi tháng trước
        "trend": "DOWNWARD",
        "source": "LME/China market",
    },
    "GIA_NHIET_LIEU": {
        "value": 205,
        "unit": "USD per ton (coking coal)",
        "change_pct_mom": -1.5,
        "trend": "STABLE",
        "source": "CME",
    },
    "CPI_VN": {
        "value": 3.8,
        "unit": "percent YoY",
        "change_pct_mom": 0.2,
        "trend": "STABLE",
        "source": "GSO Vietnam",
    },
    "GDP_VN": {
        "value": 6.9,
        "unit": "percent growth YoY",
        "trend": "UPWARD",
        "source": "GSO Vietnam",
    },
    "GIA_SUA_NGUYEN_LIEU": {
        "value": 3200,
        "unit": "USD per ton (whole milk powder)",
        "change_pct_mom": -0.8,
        "trend": "DOWNWARD",
        "source": "GlobalDairyTrade",
    },
}

# --- Tin tức tài chính gần đây ---
NEWS_EVENTS = [
    {
        "news_id": "NEWS_HPG_EXPORT_2024Q4",
        "headline": "Hòa Phát đẩy mạnh xuất khẩu thép sang ASEAN Q4/2024",
        "sentiment": "POSITIVE",
        "related_tickers": ["HPG"],
        "impact_type": "AFFECTS_POSITIVE",
        "source": "VnExpress",
    },
    {
        "news_id": "NEWS_VHM_LAUNCHPAD_2025",
        "headline": "Vinhomes ra mắt loạt dự án mới vùng ven tại 5 tỉnh thành",
        "sentiment": "POSITIVE",
        "related_tickers": ["VHM"],
        "impact_type": "AFFECTS_POSITIVE",
        "source": "Cafef",
    },
    {
        "news_id": "NEWS_SBV_RATE_HOLD",
        "headline": "NHNN giữ nguyên lãi suất điều hành, hỗ trợ tăng trưởng kinh tế",
        "sentiment": "POSITIVE",
        "related_tickers": ["VHM", "VIC", "VCB", "TCB", "BID"],
        "impact_type": "AFFECTS_POSITIVE",
        "source": "Reuters Vietnam",
    },
    {
        "news_id": "NEWS_FPT_AI_CONTRACT",
        "headline": "FPT ký hợp đồng AI trị giá 50 triệu USD với đối tác Nhật Bản",
        "sentiment": "POSITIVE",
        "related_tickers": ["FPT"],
        "impact_type": "AFFECTS_POSITIVE",
        "source": "Bloomberg",
    },
    {
        "news_id": "NEWS_STEEL_CHINA_DUMP",
        "headline": "Thép Trung Quốc bán phá giá ồ ạt vào ASEAN gây áp lực lên HPG",
        "sentiment": "NEGATIVE",
        "related_tickers": ["HPG"],
        "impact_type": "AFFECTS_NEGATIVE",
        "source": "SSI Research",
    },
]


# ============================================================
# HÀM HELPER
# ============================================================

def get_timestamp() -> str:
    """Trả về timestamp hiện tại theo format ISO 8601."""
    return datetime.utcnow().isoformat() + "Z"


def upsert_node(entity_id: str, entity_type: str, name: str, properties: dict) -> dict | None:
    """
    Upsert một node vào bảng graph_nodes.
    Nếu entity_id đã tồn tại → cập nhật name và properties.
    Trả về bản ghi đã upsert hoặc None nếu lỗi.
    """
    payload = {
        "entity_id":   entity_id,
        "entity_type": entity_type,
        "name":        name,
        "properties":  properties,
    }
    try:
        result = (
            supabase.table("graph_nodes")
            .upsert(payload, on_conflict="entity_id")
            .execute()
        )
        if result.data:
            return result.data[0]
        return None
    except Exception as e:
        print(f"  ❌ Lỗi upsert node {entity_id}: {e}")
        return None


def get_node_id(entity_id: str) -> str | None:
    """Tra cứu UUID của node theo entity_id."""
    try:
        result = (
            supabase.table("graph_nodes")
            .select("id")
            .eq("entity_id", entity_id)
            .single()
            .execute()
        )
        return result.data["id"] if result.data else None
    except Exception:
        return None


def upsert_edge(
    source_entity_id: str,
    target_entity_id: str,
    relationship_type: str,
    properties: dict,
    *,
    data_source: str = "expert_seed",
    confidence: float | None = None,
    observed_at: str | None = None,
    source_url: str | None = None,
    evidence_quote: str | None = None,
) -> bool:
    """
    Upsert một cạnh vào bảng graph_edges (Temporal KG).
    Tra cứu UUID của source và target node trước khi insert.

    Các trường temporal (học từ FinDKG):
      data_source    : 'expert_seed' | 'macro_logic' | 'news'
      confidence     : độ tin cậy [0..1]; nếu None sẽ lấy từ properties['weight']
      observed_at    : thời điểm quan sát quan hệ (ISO); mặc định = now
      source_url     : link nguồn (BẮT BUỘC với data_source='news')
      evidence_quote : câu nguyên văn làm bằng chứng

    Trả về True nếu thành công.
    """
    source_uuid = get_node_id(source_entity_id)
    target_uuid = get_node_id(target_entity_id)

    if not source_uuid:
        print(f"  ⚠️  Không tìm thấy source node: {source_entity_id}")
        return False
    if not target_uuid:
        print(f"  ⚠️  Không tìm thấy target node: {target_entity_id}")
        return False

    # Quy tắc chống hallucination: cạnh từ tin tức bắt buộc có nguồn
    if data_source == "news" and not source_url:
        print(f"  ⚠️  Bỏ qua edge 'news' thiếu source_url: {source_entity_id}→{target_entity_id}")
        return False

    # confidence: ưu tiên tham số, fallback về weight trong properties
    if confidence is None:
        confidence = properties.get("weight")

    payload = {
        "source_id":         source_uuid,
        "target_id":         target_uuid,
        "relationship_type": relationship_type,
        "properties":        properties,
        "data_source":       data_source,
        "confidence":        confidence,
        "observed_at":       observed_at or get_timestamp(),
        "source_url":        source_url,
        "evidence_quote":    evidence_quote,
    }
    try:
        supabase.table("graph_edges").upsert(payload).execute()
        return True
    except Exception as e:
        print(f"  ❌ Lỗi upsert edge {source_entity_id}→{target_entity_id}: {e}")
        return False


# ============================================================
# BƯỚC 1: ĐỒNG BỘ NODES CỔ PHIẾU
# ============================================================

def sync_stock_nodes():
    """Upsert 10 nodes cổ phiếu với dữ liệu fundamentals mới nhất."""
    print("\n📦 [BƯỚC 1] Đồng bộ nodes cổ phiếu...")

    for stock in STOCK_FUNDAMENTALS:
        ticker = stock["ticker"]

        # Tách các metadata quan trọng vào properties JSONB
        props = {
            "pe_ratio":              stock.get("pe_ratio"),
            "pb_ratio":              stock.get("pb_ratio"),
            "revenue_ttm_bn_vnd":    stock.get("revenue_ttm_bn_vnd"),
            "net_profit_ttm_bn_vnd": stock.get("net_profit_ttm_bn_vnd"),
            "roe":                   stock.get("roe"),
            "price_vnd":             stock.get("price_vnd"),
            "sector":                stock.get("sector"),
            "last_synced":           get_timestamp(),
        }
        # Thêm các trường tuỳ chọn nếu có
        for optional_key in [
            "debt_to_equity", "usd_debt_pct", "interest_rate_sensitive",
            "nim", "npl_ratio", "real_estate_loan_pct", "state_owned",
            "raw_material_import_pct", "import_material_pct",
            "export_revenue_pct", "consumer_spending_sensitive",
        ]:
            if optional_key in stock:
                props[optional_key] = stock[optional_key]

        node = upsert_node(ticker, "STOCK", stock["name"], props)
        if node:
            print(f"  ✅ {ticker}: {stock['name']} (P/E={stock.get('pe_ratio')}, "
                  f"giá={stock.get('price_vnd'):,}đ)")


# ============================================================
# BƯỚC 2: ĐỒNG BỘ NODES VĨ MÔ
# ============================================================

def sync_macro_nodes():
    """Upsert các nodes chỉ số vĩ mô với giá trị hiện tại."""
    print("\n📊 [BƯỚC 2] Đồng bộ nodes vĩ mô...")

    # Map entity_id → tên đầy đủ tiếng Việt
    MACRO_NAMES = {
        "TY_GIA_USD_VND":       "Tỷ giá USD/VND",
        "LAI_SUAT_FED":         "Lãi suất FED (Mỹ)",
        "LAI_SUAT_VN":          "Lãi suất cơ bản Việt Nam",
        "GIA_THEP_HRC":         "Giá thép cuộn cán nóng (HRC)",
        "GIA_NHIET_LIEU":       "Giá than cốc / nhiên liệu",
        "CPI_VN":               "Chỉ số giá tiêu dùng Việt Nam",
        "GDP_VN":               "Tăng trưởng GDP Việt Nam",
        "GIA_SUA_NGUYEN_LIEU":  "Giá sữa nguyên liệu quốc tế",
    }

    for entity_id, data in MACRO_DATA.items():
        props = {**data, "last_synced": get_timestamp()}
        name = MACRO_NAMES.get(entity_id, entity_id)

        node = upsert_node(entity_id, "MACRO", name, props)
        if node:
            val = data.get("value", "N/A")
            unit = data.get("unit", "")
            trend = data.get("trend", "")
            print(f"  ✅ {entity_id}: {val} {unit} | trend={trend}")


# ============================================================
# BƯỚC 3: ĐỒNG BỘ NODES TIN TỨC VÀ EDGES TIN TỨC→CỔ PHIẾU
# ============================================================

def sync_news_nodes_and_edges():
    """
    Upsert nodes tin tức và các cạnh MENTIONS/AFFECTS_* từ tin tức đến cổ phiếu.
    Logic: mỗi tin tức liên quan đến cổ phiếu nào sẽ tạo cạnh tương ứng.
    """
    print("\n📰 [BƯỚC 3] Đồng bộ nodes & edges tin tức...")

    for news in NEWS_EVENTS:
        news_id = news["news_id"]
        # CHỈ nạp tin có URL THẬT (http). Tin demo không URL → BỎ (tránh seed:// giả, link gãy).
        if not (news.get("url") or "").startswith("http"):
            continue
        props = {
            "headline":   news["headline"],
            "sentiment":  news["sentiment"],
            "source":     news["source"],
            "published_at": get_timestamp(),
        }

        # Upsert node tin tức
        node = upsert_node(news_id, "NEWS", news["headline"][:80], props)
        if not node:
            continue

        print(f"  📄 {news_id}: {news['headline'][:60]}...")

        # Tạo cạnh từ tin tức đến các cổ phiếu liên quan
        # data_source='news': mỗi cạnh có nguồn + bằng chứng (chống hallucination)
        sentiment_conf = {"POSITIVE": 0.7, "NEGATIVE": 0.7, "NEUTRAL": 0.4}
        for ticker in news["related_tickers"]:
            impact = news.get("impact_type", "MENTIONS")
            edge_props = {
                "sentiment":  news["sentiment"],
                "source":     news["source"],
                "synced_at":  get_timestamp(),
            }
            success = upsert_edge(
                news_id, ticker, impact, edge_props,
                data_source="news",
                confidence=sentiment_conf.get(news["sentiment"], 0.5),
                observed_at=props["published_at"],
                source_url=news["url"],   # luôn là URL thật (đã guard ở trên)
                evidence_quote=news["headline"],
            )
            if success:
                print(f"    → {impact}: {news_id} → {ticker}")


# ============================================================
# BƯỚC 4: TẠO EDGES VĨ MÔ → CỔ PHIẾU (Logic tài chính)
# ============================================================

def sync_macro_to_stock_edges():
    """
    Tạo các cạnh quan hệ giữa chỉ số vĩ mô và cổ phiếu dựa trên logic tài chính.

    Các quan hệ nhân quả chính:
    - Tỷ giá USD/VND tăng   → HPG AFFECTS_NEGATIVE  (nợ USD tăng)
    - Tỷ giá USD/VND tăng   → FPT AFFECTS_POSITIVE   (doanh thu xuất khẩu tăng)
    - Tỷ giá USD/VND tăng   → VNM AFFECTS_NEGATIVE   (chi phí nhập khẩu tăng)
    - Lãi suất VN tăng      → VHM/VIC AFFECTS_NEGATIVE (nhu cầu vay mua nhà giảm)
    - Lãi suất VN tăng      → VCB AFFECTS_POSITIVE   (NIM tăng ngắn hạn)
    - Giá thép HRC giảm     → HPG AFFECTS_POSITIVE   (nguyên liệu rẻ hơn)
    - Giá sữa nguyên liệu   → VNM INPUT_COST_OF
    - CPI cao               → MWG AFFECTS_NEGATIVE   (sức mua giảm)
    """
    print("\n🔗 [BƯỚC 4] Đồng bộ edges vĩ mô → cổ phiếu...")

    # Lấy giá trị hiện tại để tính toán chiều hướng tác động
    ty_gia = MACRO_DATA["TY_GIA_USD_VND"]
    lai_suat_vn = MACRO_DATA["LAI_SUAT_VN"]
    gia_thep = MACRO_DATA["GIA_THEP_HRC"]
    gia_sua = MACRO_DATA["GIA_SUA_NGUYEN_LIEU"]
    cpi = MACRO_DATA["CPI_VN"]

    # Định nghĩa các cạnh vĩ mô cần đồng bộ
    # Format: (source_entity_id, target_entity_id, relationship_type, properties_dict)
    macro_edges = [
        # === TỶ GIÁ USD/VND ===
        (
            "TY_GIA_USD_VND", "HPG", "AFFECTS_NEGATIVE",
            {
                "reason": "HPG có ~35% nợ bằng USD, tỷ giá tăng làm tăng chi phí trả nợ",
                "current_rate": ty_gia["value"],
                "trend": ty_gia["trend"],
                "weight": 0.85,
                "last_updated": get_timestamp(),
            },
        ),
        (
            "TY_GIA_USD_VND", "FPT", "AFFECTS_POSITIVE",
            {
                "reason": "FPT có ~52% doanh thu từ xuất khẩu IT, tỷ giá cao tăng lợi nhuận VND",
                "current_rate": ty_gia["value"],
                "trend": ty_gia["trend"],
                "weight": 0.75,
                "last_updated": get_timestamp(),
            },
        ),
        (
            "TY_GIA_USD_VND", "VNM", "AFFECTS_NEGATIVE",
            {
                "reason": "VNM nhập khẩu ~30% nguyên liệu sữa, tỷ giá cao làm tăng chi phí",
                "current_rate": ty_gia["value"],
                "trend": ty_gia["trend"],
                "weight": 0.6,
                "last_updated": get_timestamp(),
            },
        ),

        # === LÃI SUẤT VIỆT NAM ===
        (
            "LAI_SUAT_VN", "VHM", "AFFECTS_NEGATIVE",
            {
                "reason": "Lãi suất cao làm giảm nhu cầu vay mua nhà, ảnh hưởng doanh thu VHM",
                "current_rate": lai_suat_vn["value"],
                "trend": lai_suat_vn["trend"],
                "weight": 0.9,
                "last_updated": get_timestamp(),
            },
        ),
        (
            "LAI_SUAT_VN", "VIC", "AFFECTS_NEGATIVE",
            {
                "reason": "VIC có đòn bẩy tài chính cao, lãi suất tăng làm tăng chi phí vốn",
                "current_rate": lai_suat_vn["value"],
                "trend": lai_suat_vn["trend"],
                "weight": 0.8,
                "last_updated": get_timestamp(),
            },
        ),
        (
            "LAI_SUAT_VN", "VCB", "AFFECTS_POSITIVE",
            {
                "reason": "Lãi suất cao giúp VCB tăng NIM (biên lãi ròng) trong ngắn hạn",
                "current_rate": lai_suat_vn["value"],
                "trend": lai_suat_vn["trend"],
                "weight": 0.5,
                "last_updated": get_timestamp(),
            },
        ),
        (
            "LAI_SUAT_VN", "TCB", "AFFECTS_NEGATIVE",
            {
                "reason": "TCB có 32% dư nợ BĐS, lãi suất cao làm tăng nợ xấu tiềm tàng",
                "current_rate": lai_suat_vn["value"],
                "trend": lai_suat_vn["trend"],
                "weight": 0.75,
                "last_updated": get_timestamp(),
            },
        ),
        (
            "LAI_SUAT_VN", "MWG", "AFFECTS_NEGATIVE",
            {
                "reason": "Lãi suất cao làm tăng chi phí tài chính và giảm nhu cầu mua trả góp",
                "current_rate": lai_suat_vn["value"],
                "trend": lai_suat_vn["trend"],
                "weight": 0.55,
                "last_updated": get_timestamp(),
            },
        ),

        # === GIÁ THÉP HRC ===
        (
            "GIA_THEP_HRC", "HPG", "INPUT_COST_OF",
            {
                "reason": "Giá thép HRC thế giới ảnh hưởng đến biên lợi nhuận sản phẩm thép HPG",
                "current_price_usd": gia_thep["value"],
                "trend": gia_thep["trend"],
                "weight": 0.85,
                "last_updated": get_timestamp(),
            },
        ),

        # === GIÁ SỮA NGUYÊN LIỆU ===
        (
            "GIA_SUA_NGUYEN_LIEU", "VNM", "INPUT_COST_OF",
            {
                "reason": "VNM nhập khẩu sữa bột nguyên liệu làm đầu vào sản xuất",
                "current_price_usd": gia_sua["value"],
                "trend": gia_sua["trend"],
                "weight": 0.75,
                "last_updated": get_timestamp(),
            },
        ),

        # === CPI / LẠM PHÁT ===
        (
            "CPI_VN", "MWG", "AFFECTS_NEGATIVE",
            {
                "reason": "CPI cao làm giảm sức mua thực, người tiêu dùng cắt giảm điện tử",
                "current_cpi": cpi["value"],
                "trend": cpi["trend"],
                "weight": 0.65,
                "last_updated": get_timestamp(),
            },
        ),
        (
            "CPI_VN", "MSN", "AFFECTS_POSITIVE",
            {
                "reason": "Masan bán hàng thiết yếu (thực phẩm, gia vị), CPI tăng giúp tăng doanh thu",
                "current_cpi": cpi["value"],
                "trend": cpi["trend"],
                "weight": 0.5,
                "last_updated": get_timestamp(),
            },
        ),
    ]

    synced_count = 0
    for src, tgt, rel, props in macro_edges:
        # Quan hệ vĩ mô = tri thức cấu trúc (không phụ thuộc 1 bài báo) → 'macro_logic'
        success = upsert_edge(src, tgt, rel, props, data_source="macro_logic")
        if success:
            print(f"  ✅ {src} →[{rel}]→ {tgt}")
            synced_count += 1

    print(f"  📊 Đã sync {synced_count}/{len(macro_edges)} macro edges")


# ============================================================
# BƯỚC 5: TẠO EDGES NGÂN HÀNG → BẤT ĐỘNG SẢN
# ============================================================

def sync_banking_realestate_edges():
    """
    Tạo quan hệ SUPPLIES_TO giữa ngân hàng và doanh nghiệp BĐS
    để biểu diễn mối liên kết tín dụng trong đồ thị.
    """
    print("\n🏦 [BƯỚC 5] Đồng bộ edges ngân hàng → BĐS...")

    banking_realestate = [
        (
            "TCB", "VHM", "SUPPLIES_TO",
            {
                "reason": "Techcombank là ngân hàng chủ lực tài trợ vốn cho dự án Vinhomes",
                "loan_exposure_pct": 32,
                "weight": 0.8,
                "last_updated": get_timestamp(),
            },
        ),
        (
            "BID", "VIC", "SUPPLIES_TO",
            {
                "reason": "BIDV cung cấp tín dụng cho các dự án lớn của Vingroup",
                "weight": 0.6,
                "last_updated": get_timestamp(),
            },
        ),
        (
            "VCB", "HPG", "SUPPLIES_TO",
            {
                "reason": "VCB là ngân hàng cung cấp tín dụng cho các dự án mở rộng của HPG",
                "weight": 0.55,
                "last_updated": get_timestamp(),
            },
        ),
    ]

    for src, tgt, rel, props in banking_realestate:
        # Quan hệ tín dụng ngân hàng→BĐS = tri thức chuyên gia ổn định → 'expert_seed'
        success = upsert_edge(src, tgt, rel, props, data_source="expert_seed")
        if success:
            print(f"  ✅ {src} →[{rel}]→ {tgt}")


# ============================================================
# CHẠY TOÀN BỘ ETL PIPELINE
# ============================================================

def run_full_sync():
    """Chạy toàn bộ pipeline đồng bộ Knowledge Graph."""
    start_time = datetime.utcnow()
    print("=" * 60)
    print("🚀 BẮT ĐẦU ĐỒNG BỘ KNOWLEDGE GRAPH")
    print(f"   Thời gian: {start_time.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("=" * 60)

    # Chạy từng bước theo thứ tự
    # (Nodes phải được tạo trước khi tạo edges)
    sync_stock_nodes()
    sync_macro_nodes()
    sync_news_nodes_and_edges()
    sync_macro_to_stock_edges()
    sync_banking_realestate_edges()

    # Thống kê kết quả
    end_time = datetime.utcnow()
    elapsed = (end_time - start_time).total_seconds()

    print("\n" + "=" * 60)
    print("✅ HOÀN THÀNH ĐỒNG BỘ KNOWLEDGE GRAPH")
    print(f"   Thời gian xử lý: {elapsed:.2f} giây")
    print("=" * 60)

    # Kiểm tra nhanh: đếm số nodes và edges đã có trong DB
    try:
        node_count = supabase.table("graph_nodes").select("id", count="exact").execute()
        edge_count = supabase.table("graph_edges").select("id", count="exact").execute()
        print(f"\n📈 Thống kê hiện tại:")
        print(f"   Tổng nodes: {node_count.count}")
        print(f"   Tổng edges: {edge_count.count}")
    except Exception as e:
        print(f"   (Không thể lấy thống kê: {e})")

    print("\n💡 Kiểm tra kết quả bằng cách chạy RPC trên Supabase:")
    print("   SELECT * FROM get_financial_network('HPG');")
    print("   SELECT * FROM get_financial_network('VCB');")


if __name__ == "__main__":
    run_full_sync()

"""
analysis_orchestrator.py — ORCHESTRATOR cho intent "PHÂN TÍCH SÂU / SO SÁNH".
=============================================================================
Thay vì để Gemini gọi ~16 tool TUẦN TỰ (mỗi vòng resend prompt lớn → chậm ~200s),
MÌNH tự điều phối:
  1) nhận diện intent + trích mã + chọn peer (deterministic),
  2) PRE-FETCH SONG SONG mọi dữ liệu cần (thread pool — I/O-bound), pace dưới 60 req/phút,
  3) gộp 1 VÒNG model tổng hợp (KHÔNG tool) từ bundle dữ liệu → nhanh hơn nhiều.

Giữ `tool_calls` (list {tool,ticker,result}) y như tool_tracker để Sources/timeline/sanitizer
ở app.py hoạt động không đổi. Câu KHÔNG phải deep-analysis → app vẫn dùng luồng model-driven cũ.
"""
import re
import json
import time
import concurrent.futures as _cf

# Lưu ý kiến trúc: vnstock-heavy (financials/price) chạy TUẦN TỰ ở MAIN thread (xem gather) vì vnai
# sys.exit() khi rate-limit — gọi trong thread pool sẽ giết cả process im lặng. Chỉ tool KHÔNG-vnstock
# (news=DB, KG=Supabase) chạy song song.
from core.agent_config import (
    get_financial_statements, query_stock_sector_context, get_stock_news,
    query_events, get_sector_value_chain, get_commodity_prices, get_market_price,
    get_vn_domestic_price, query_sector_impact, read_article,
    web_search, sanitize_citations, ensure_disclaimer, FINANCIAL_ANALYSIS_PLAYBOOK,
)
from core import analysis_knowledge
from markets.vn.config import VN_CONFIG as _MKT  # hồ sơ thị trường (locale keyword theo ngôn ngữ)


def _wealbee_context(query: str) -> str:
    """Tiêm dữ liệu từ Supabase WEALBEE (giá/tin đã-gán-nhãn/BCTC/hồ sơ) vào vòng tổng hợp.
    Additive + an toàn: lỗi/chưa cấu hình → trả "" (không ảnh hưởng luồng gốc)."""
    try:
        from core import wealbee_retriever as _wb
        blk = _wb.to_context_block(_wb.retrieve(query))
        if not blk:
            return ""
        return ("\n\n## DỮ LIỆU NỘI BỘ WEALBEE (nguồn nội bộ — số ghi '(nguồn Wealbee)', "
                "tin đã gán nhãn+impact; ĐỐI CHIẾU & ưu tiên cùng dữ liệu khác, KHÔNG bịa):\n" + blk)
    except Exception:
        return ""


def _synth_system(scope: str = "stock", loai_hinh: str | None = None) -> str:
    """System prompt VÒNG TỔNG HỢP (no-tool) — GHÉP THEO NGỮ CẢNH (context engineering): chỉ nạp khối
    cần cho `scope` (stock/sector/macro/report) + loại hình DN → gọn token, sắc tín hiệu (tránh "vùng ngu").
    AN TOÀN: mọi LUẬT (no-tool/no-bịa/citation/no-reco/disclaimer/bôi đậm) LUÔN có ở mọi biến thể.
    Mặc định (scope=stock, loai=None) = ĐẦY ĐỦ (tương thích hành vi cũ)."""
    from datetime import datetime, timezone, timedelta
    today = datetime.now(timezone(timedelta(hours=7))).strftime("%d/%m/%Y")
    # ── LUẬT lõi (LUÔN có) ──
    core = (
        f"HÔM NAY: {today} (giờ VN). Bạn là CHUYÊN VIÊN PHÂN TÍCH chứng khoán Việt Nam 20 năm.\n"
        "⛔ Bạn KHÔNG có công cụ/tool trong lượt này — CHỈ TỔNG HỢP từ phần 'DỮ LIỆU ĐÃ THU THẬP' (JSON) "
        "trong câu hỏi. TUYỆT ĐỐI KHÔNG gọi tool, KHÔNG in lời gọi tool/code (default_api/print/get_*), "
        "KHÔNG bịa số ngoài dữ liệu (thiếu thì ghi '(chưa có số)').\n\n"
        "TRÍCH NGUỒN: chỉ link web http bấm được → **[Nguồn · ngày](URL)**; số nội bộ (vnstock/market/KG) "
        "ghi trần '(cập nhật ...)' KHÔNG link; KHÔNG in '[Knowledge Graph]'/'Trọng số 0.x'.\n"
    )
    safety = (
        "Không khuyến nghị mua/bán; ⛔ KHÔNG đề xuất tỷ trọng/phân bổ danh mục %/DCA/'mua gom'/phân loại "
        "core-value-growth-để-mua (ngoài phạm vi); disclaimer đúng 1 lần ở cuối.\n"
        "✅ BÔI ĐẬM **con số quan trọng** trong VĂN XUÔI (tăng trưởng/biên/ROE/P-E/PEG/giá/rủi ro định lượng) "
        "bằng `**...**`; chỉ bôi đậm số then chốt, không cả câu (trong bảng không cần).\n"
    )
    # ── Khối CHỈ SỐ CHUYÊN NGÀNH (định chế tài chính) — bỏ khi mã KHÔNG phải bank/CK/BH ──
    block_fininst = (
        "⚠️ NGÂN HÀNG/CHỨNG KHOÁN/BẢO HIỂM: BẮT BUỘC nêu CHỈ SỐ CHUYÊN NGÀNH. ƯU TIÊN số ĐÃ TÍNH từ BCTC ở "
        "`ratios.chi_so_chuyen_nganh_tinh` (bank: NIM/CIR/cho-vay÷tiền-gửi[LDR THÔ, cao hơn LDR quy định]/thu-ngoài-lãi/bao-phủ-dự-phòng; CK: dư nợ margin/"
        "margin-trên-VCSH/cơ cấu môi giới-margin-tự doanh; BH: combined ratio/loss ratio/giữ lại) — ĐÁNG TIN, "
        "ghi rõ 'tính từ BCTC'. BỔ SUNG từ web (`chi_so_chuyen_nganh_*`) cái KHÔNG tính được: bank NPL/CASA/CAR, "
        "CK thị phần — kèm nguồn link+ngày; thiếu ghi '(chưa có số cập nhật)', KHÔNG bịa/dùng số >1 năm. "
        "ĐỪNG dùng biên gộp/tồn kho/CCC cho ngân hàng.\n"
    )
    # ── Khối CẤU TRÚC PHÂN TÍCH SÂU 1 MÃ (IS/BS/CF + định giá) — chỉ cho phân tích mã/ngành ──
    block_deep = (
        "CẤU TRÚC (chuyên sâu): bảng IS/BS/CF + Ratios (biên 3 tầng + GIẢI THÍCH), định giá theo PEG + "
        "`vi_the_vs_lich_su` + peer (dải P/E chỉ bối cảnh; nêu `mau_thuan_dinh_gia` nếu có), chất lượng LN/"
        "dồn tích (`co_dau_hieu_dong_tich`), CHẨN ĐOÁN `chan_doan` (DuPont nguồn ROE + ROIC tạo giá trị + "
        "trả lãi/nợ-ròng-EBITDA + CCC vốn lưu động), ĐỊNH GIÁ NỘI TẠI `dinh_gia_noi_tai` (vùng bảo thủ EPV+"
        "Graham; giá>vùng=trả cho tăng trưởng→đối chiếu PEG; 'tham khảo không khuyến nghị'), ĐỊNH GIÁ vs "
        "LỊCH SỬ chính mã `dinh_gia_vs_lich_su` (P/E-P/B vs trung vị nhiều năm của NÓ = rẻ/đắt tương đối), "
        "**TRIỂN VỌNG & ĐỒNG THUẬN** (từ data fwd_* web_search: dự phóng LNST/EPS năm tới, giá mục tiêu môi "
        "giới — TỔNG HỢP có dẫn nguồn link, ghi rõ 'đồng thuận thị trường THAM KHẢO, KHÔNG phải khuyến nghị "
        "của hệ thống'; nếu nguồn rỗng/cũ thì ghi 'chưa có dự phóng cập nhật'). "
        "so sánh peer CẠNH NHAU (mã=cột), tiềm năng & rủi ro CÓ SỐ.\n"
        "⚠️ NHÃN CỘT MỚI NHẤT: bảng CÂN ĐỐI KẾ TOÁN (stock) → 'Qx/yyyy (cuối kỳ)', KHÔNG ghi 'TTM' (không có "
        "'tổng tài sản 12 tháng'); chỉ KQKD & DÒNG TIỀN (flow) mới dùng 'TTM'. KHÔNG copy số TTM/snapshot vào "
        "cột một năm (vd CAPEX 2025 ≠ CAPEX TTM) — chỉ tiêu chỉ có kỳ mới nhất thì các cột năm để '—'.\n"
        "⚠️ DN CHU KỲ (thép/hàng hóa/BĐS): kèm cảnh báo TTM ở đỉnh chu kỳ thổi phồng LN → P/E TTM có thể 'rẻ "
        "giả tạo'; lưu ý quý đột biến (one-off), đối chiếu xuyên chu kỳ.\n"
    )
    # ── Khối MA TRẬN VĨ MÔ (LUẬT chống bịa số vĩ mô — LUÔN có khi có yếu tố vĩ mô) ──
    block_macro = (
        "**MA TRẬN VĨ MÔ (phân tầng vĩ mô→ngành→×Beta)**: BẮT BUỘC lấy SỐ vĩ mô — TRONG NƯỚC (GDP/lãi suất/"
        "tín dụng/tỷ giá/CPI) từ `macro_evidence`; QUỐC TẾ (Fed funds/DXY/US10Y) từ `macro_intl`; giá hàng hóa "
        "từ `commodity` — KÈM TRÍCH NGUỒN link+ngày. ⛔ TUYỆT ĐỐI "
        "KHÔNG nêu số vĩ mô nếu KHÔNG có trong data — thiếu thì nói ĐỊNH TÍNH, không bịa số. ⛔ ĐẶC BIỆT: "
        "GDP/CPI/lạm phát/tăng trưởng tín dụng — chỉ nêu CON SỐ khi tìm thấy trong `macro_evidence` kèm link; "
        "nếu data không có thì viết 'GDP (chưa có số cập nhật trong nguồn)' hoặc bỏ, TUYỆT ĐỐI KHÔNG ghi 'GDP 6,9%' "
        "hay bất kỳ số nào từ trí nhớ. "
        "Mỗi ô tác động phải NỐI số vĩ mô cụ thể → ngành → ×Beta của MÃ ĐÓ (vd 'tỷ giá USD/VND **26.120** "
        "[nguồn] ↑ → FPT xuất khẩu phần mềm hưởng lợi quy đổi'); CẤM câu chung chung kiểu 'Beta thấp giúp "
        "giảm biến động' mà không gắn số/cơ chế.\n"
    )
    kb = analysis_knowledge.global_knowledge_block()
    if scope == "macro":   # câu vĩ mô thuần → BỎ cấu trúc tài chính sâu + playbook + chỉ số định chế
        return core + block_macro + safety + "\n\n" + kb
    # stock / sector / report
    parts = [core]
    if loai_hinh != "san_xuat_thuong_mai_dich_vu":   # bỏ khối định chế TC khi mã rõ ràng KHÔNG phải
        parts.append(block_fininst)
    parts += [block_deep, block_macro, safety]
    return "".join(parts) + "\n\n" + FINANCIAL_ANALYSIS_PLAYBOOK + "\n\n" + kb

# Đối thủ trực tiếp mặc định (khi user không nêu) — bám peer-map đã dùng ở prompt 7c.
PEER_MAP = {
    "VCB": ["TCB", "BID"], "TCB": ["VCB", "MBB"], "BID": ["VCB", "CTG"], "CTG": ["VCB", "BID"],
    "MBB": ["TCB", "ACB"], "ACB": ["MBB", "VPB"], "VPB": ["TCB", "MBB"],
    "HPG": ["HSG", "NKG"], "HSG": ["HPG", "NKG"], "NKG": ["HPG", "HSG"],
    "FPT": ["CMG", "ELC"], "MWG": ["FRT", "DGW"], "FRT": ["MWG", "DGW"],
    "VHM": ["NLG", "KDH"], "VIC": ["VHM", "VRE"], "VRE": ["VHM", "VIC"],
    "VNM": ["MSN", "SAB"], "MSN": ["VNM", "SAB"], "SSI": ["VND", "HCM"], "VND": ["SSI", "HCM"],
    "DGC": ["DPM", "DCM"], "DPM": ["DCM", "DGC"], "DCM": ["DPM", "DGC"],
    "PNJ": ["MWG", "FRT"], "GAS": ["PVD", "PVS"], "POW": ["GAS", "PGV"],
}

# Từ khoá cho biết câu hỏi là PHÂN TÍCH SÂU (cần nhiều dữ liệu) → đáng orchestrate.
_DEPTH_MARKERS = ("chi tiết", "tài chính", "sâu", "toàn diện", "so sánh", "đối thủ", "cùng ngành",
                  "tiềm năng", "rủi ro", "vĩ mô", "triển vọng", "định giá", "sức khỏe")
# Token viết hoa 3-4 ký tự KHÔNG phải mã cổ phiếu (acronym vĩ mô/tài chính) — tránh nhận nhầm.
_NOT_TICKER = {"GDP", "CPI", "PMI", "USD", "VND", "EUR", "JPY", "FED", "ECB", "IPO", "ROE", "ROA",
               "NIM", "EPS", "CAR", "NPL", "ESG", "API", "FDI", "ETF", "VAT", "BCTC", "KQKD",
               "HOSE", "HNX", "FTSE", "MSCI", "NHNN", "SBV", "ICB", "AI", "USTR", "EU", "M&A"}


def _strip_dia(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", s or "")
                   if unicodedata.category(c) != "Mn").lower()


_COMPANY_MAP = None
_NAME_PREFIXES = _MKT.company_name_prefixes  # tiền tố tên DN (đặc ngôn ngữ) → markets/vn/config


def _company_map() -> dict:
    """Map TÊN CÔNG TY (không dấu, đã bỏ tiền tố) → MÃ, build 1 lần từ KG. Để nhận 'Hòa Phát'→HPG."""
    global _COMPANY_MAP
    if _COMPANY_MAP is None:
        _COMPANY_MAP = {}
        try:
            from core.agent_config import get_supabase
            sb = get_supabase()
            rows = (sb.table("graph_nodes").select("entity_id,name")
                    .eq("entity_type", "STOCK").execute().data) or []
            for r in rows:
                nm = _strip_dia(r.get("name") or "")
                for pre in _NAME_PREFIXES:
                    if nm.startswith(pre):
                        nm = nm[len(pre):]
                        break
                nm = nm.strip()
                if len(nm) >= 4:
                    _COMPANY_MAP[nm] = r["entity_id"]
        except Exception:
            _COMPANY_MAP = {}
    return _COMPANY_MAP


def extract_tickers(query: str) -> list[str]:
    """Trích MÃ (3-4 chữ in hoa) HOẶC TÊN CÔNG TY ('Hòa Phát'→HPG) từ câu hỏi, giữ thứ tự, bỏ trùng."""
    out, seen = [], set()
    for c in re.findall(r"\b[A-Z]{3,4}\b", query):
        if c in _NOT_TICKER or c in seen:
            continue
        seen.add(c)
        out.append(c)
    # nhận TÊN CÔNG TY (không dấu) → mã, cho câu kiểu 'tiềm năng của hoà phát' (không gõ HPG)
    if not out:
        ql = _strip_dia(query)
        for nm, tk in _company_map().items():
            if tk not in seen and re.search(rf"(?<![a-z]){re.escape(nm)}(?![a-z])", ql):
                seen.add(tk)
                out.append(tk)
    return out


_DEEP_INTENT = _MKT.deep_intent  # từ khóa ý định phân tích sâu (đặc ngôn ngữ) → markets/vn/config


def is_deep_analysis(query: str) -> bool:
    """True khi câu cần PHÂN TÍCH/ĐỊNH GIÁ SÂU (1+ mã) → orchestrate (lấy số THẬT từ tool + web, tránh
    model-driven bịa P/E). NÊU RÕ Ý ĐỊNH PHÂN TÍCH ('phân tích/đánh giá/định giá/so sánh/luận điểm/tiềm năng/
    triển vọng') + CÓ MÃ cụ thể → ĐỦ để vào deep (KHÔNG đòi thêm depth marker — 'phân tích HPG' phải là deep,
    không để rơi xuống model-driven yếu)."""
    ql = query.lower()
    has_intent = any(m in ql for m in _DEEP_INTENT)
    # câu chung 'HPG thế nào / có nên quan tâm / HPG ra sao' (có mã, ý muốn nhìn tổng quan) cũng nên deep
    overview = any(m in ql for m in _MKT.overview_markers)
    # hỏi DỮ LIỆU TÀI CHÍNH của 1 mã (BCTC/KQKD/sức khỏe tài chính) → cũng cần deep (lấy số thật)
    fin_intent = any(m in ql for m in _MKT.fin_intent)
    return (has_intent or overview or fin_intent) and bool(extract_tickers(query))


# Chỉ thêm peer khi câu hỏi THỰC SỰ muốn SO SÁNH (tránh hỏi 1 mã lại kéo cả ngành).
_COMPARE_MARKERS = _MKT.compare_markers  # ý định so sánh (đặc ngôn ngữ) → markets/vn/config


def wants_comparison(query: str) -> bool:
    return any(m in query.lower() for m in _COMPARE_MARKERS)


_SIMPLE_MARKERS = _MKT.simple_markers  # câu hỏi nhanh (giá/tin) (đặc ngôn ngữ) → markets/vn/config


def is_price_query(query: str) -> bool:
    """Câu CHỈ hỏi GIÁ 1 mã (vd 'giá HPG hôm nay') → trả lời DETERMINISTIC (1 call vnstock, KHÔNG vòng
    model) → nhanh nhất (~3s thay vì ~14s). Bảo thủ: đúng 1 mã + có marker giá + không intent khác."""
    ql = query.lower()
    if not any(m in ql for m in ("giá", "thị giá", "bao nhiêu", "đang ở mức", "chốt phiên")):
        return False
    if any(m in ql for m in ("phân tích", "so sánh", "đánh giá", "định giá", "vĩ mô", "tác động",
                             "ngành", "tin", "rủi ro", "triển vọng", "hàng hóa", "thép", "dầu", "vàng")):
        return False
    return len(extract_tickers(query)) == 1 and len(ql) <= 60


def is_simple_query(query: str) -> bool:
    """Câu ĐƠN GIẢN (giá/tin/thị trường, ngắn) → dùng lean prompt (nhanh/rẻ). KHÔNG phải deep.
    Bảo thủ: chỉ bắt khi rõ ràng đơn giản; còn lại để luồng full (an toàn)."""
    ql = query.lower()
    if is_deep_analysis(query):
        return False
    if any(m in ql for m in ("phân tích", "so sánh", "đánh giá", "định giá", "rủi ro", "tiềm năng",
                             "vĩ mô", "tác động", "triển vọng", "chuỗi", "vì sao", "tại sao")):
        return False
    return len(ql) <= 90 and any(m in ql for m in _SIMPLE_MARKERS)


# ── CÂU HỎI NGÀNH (không nêu mã cụ thể) → path DETERMINISTIC: ép định giá mã tiêu biểu ──
# Map TỪ KHÓA ngành → SECTOR_ID + nhãn search sạch: nay ở markets/vn/config.py (đặc thị-trường).
_SECTOR_ALIASES = _MKT.sector_routing_aliases
_SECTOR_LABEL = _MKT.sector_labels


def detect_sector(query: str) -> str | None:
    """Trả MÃ NGÀNH chuẩn (SECTOR_*) nếu câu nhắc tới 1 ngành; None nếu không."""
    ql = query.lower()
    for kw, code in _SECTOR_ALIASES.items():
        if kw in ql:
            return code
    return None


def is_sector_query(query: str) -> bool:
    """True khi câu hỏi VỀ MỘT NGÀNH (có ý phân tích/luận điểm/triển vọng) NHƯNG KHÔNG nêu mã cụ thể.
    → route sang sector path (ép get_financial_statements cho mã tiêu biểu → đảm bảo có ĐỊNH GIÁ)."""
    if extract_tickers(query):          # đã có mã cụ thể → đi path thường (deep theo mã)
        return False
    ql = query.lower()
    has_intent = any(m in ql for m in _DEEP_INTENT) or any(
        m in ql for m in ("luận điểm", "rủi ro", "tiềm năng", "cổ phiếu", "thông tin"))
    return bool(detect_sector(query)) and has_intent


def _sector_members(sector_code: str, limit: int = 3) -> list[str]:
    """Top mã ĐẦU NGÀNH (vốn hóa lớn nhất) trong KG → mã tiêu biểu để ĐỊNH GIÁ."""
    try:
        from core.agent_config import get_supabase
        sb = get_supabase()
        rows = (sb.table("graph_nodes").select("entity_id,properties")
                .eq("entity_type", "STOCK").execute().data) or []
        same = [(r["entity_id"], (r.get("properties") or {}).get("market_cap_trillion") or 0)
                for r in rows if (r.get("properties") or {}).get("sector") == sector_code]
        same.sort(key=lambda x: x[1], reverse=True)   # vốn hóa lớn nhất = đầu ngành
        return [t for t, _ in same[:limit]]
    except Exception:
        return []


# ── CÂU HỎI VĨ MÔ (không mã, không ngành) → path DETERMINISTIC: ÉP web_search đúng nguồn rồi tổng hợp.
# Lý do: audit cho thấy model lite hay BỎ search, bịa số vĩ mô (vd "lãi suất 4,5%") không nguồn → sai/credibility.
# Map TỪ KHÓA trong câu → key chỉ số trong agent_config._MACRO_SOURCE_MAP (đã có scope/query/nguồn).
_MACRO_KEYWORDS = {
    "đầu tư công": "đầu tư công", "giải ngân": "đầu tư công",
    "gdp": "gdp", "tăng trưởng kinh tế": "gdp",
    "cpi": "cpi", "lạm phát": "lạm phát",
    "tín dụng": "tín dụng", "tỷ giá": "tỷ giá", "ngoại hối": "tỷ giá",
    "iip": "iip", "sản xuất công nghiệp": "iip", "pmi": "pmi",
    "fed": "fed", "fed funds": "fed funds",
    "dxy": "dxy", "dollar index": "dxy", "sức mạnh đồng đô": "dxy", "chỉ số đô la": "dxy",
    "us10y": "us10y", "lợi suất trái phiếu mỹ": "us10y", "trái phiếu chính phủ mỹ": "us10y",
    "trái phiếu mỹ 10 năm": "us10y",
    "lãi suất": "lãi suất",   # để CUỐI: nếu có 'fed' thì ưu tiên fed (xử lý ở detect)
}


def detect_macro_indicators(query: str) -> list[str]:
    """Trả danh sách KEY chỉ số vĩ mô (theo _MACRO_SOURCE_MAP) câu nhắc tới, đã khử nhập nhằng lãi suất↔Fed."""
    ql = query.lower()
    hits = []
    for kw, key in _MACRO_KEYWORDS.items():
        if kw in ql and key not in hits:
            hits.append(key)
    # 'lãi suất Mỹ/Fed' → chỉ Fed (bỏ lãi suất NHNN); 'lợi suất' đã map us10y
    if any(k in hits for k in ("fed", "fed funds")) and "lãi suất" in hits:
        if any(w in ql for w in ("mỹ", "fed", "us", "hoa kỳ")):
            hits.remove("lãi suất")
    return hits


def is_macro_query(query: str) -> bool:
    """True khi câu hỏi VỀ CHỈ SỐ VĨ MÔ (không nêu mã, không phải câu PHÂN TÍCH NGÀNH) → ép gather_macro.
    Dùng is_sector_query (cần ngành + intent) chứ KHÔNG dùng detect_sector — vì 'Ngân hàng Nhà nước' /
    'chứng khoán Việt Nam' chứa chữ ngành nhưng câu thực ra hỏi vĩ mô (lãi suất NHNN, tác động tới TTCK)."""
    if extract_tickers(query):
        return False
    if is_sector_query(query):         # câu PHÂN TÍCH NGÀNH đã có gather_sector lo (kèm macro ngành)
        return False
    return bool(detect_macro_indicators(query))


# ── CÂU HỎI ĐỌC SÂU BÁO CÁO CTCK (luận điểm/khuyến nghị/key metric trong báo cáo) → path DETERMINISTIC:
# ÉP read_article báo cáo thật (PDF) → trả lời CHỈ từ số đã trích. Tránh model bịa "có vẻ có nguồn".
_REPORT_TRIGGERS = (
    "báo cáo phân tích", "báo cáo môi giới", "trong báo cáo", "từ báo cáo", "đọc báo cáo",
    "bóc tách báo cáo", "từ nguồn tham khảo", "nguồn tham khảo", "họ khuyến nghị", "khuyến nghị mua",
    "khuyến nghị bán", "khuyến nghị của", "giá mục tiêu", "key metric", "ctck", "môi giới khuyến nghị",
    "luận điểm trong báo cáo",
)
_REPORT_EXCLUDE = ("báo cáo tài chính", "bctc", "báo cáo thường niên", "báo cáo kết quả kinh doanh")


_GROUNDING_MARKERS = ("đối chiếu", "so sánh", "kiểm chứng", "so với thực tế", "so với bctc",
                      "với thực tế", "có đúng", "có chính xác", "kiểm tra lại", "khả thi",
                      "đáng tin", "thực tế thế nào", "có hợp lý", "lạc quan", "kiểm định",
                      "so với số liệu", "vs thực tế")


def wants_grounding(query: str) -> bool:
    """User CÓ muốn ĐỐI CHIẾU báo cáo với BCTC thực tế không. Nếu KHÔNG → chỉ tập trung nội dung báo cáo."""
    ql = (query or "").lower()
    return any(m in ql for m in _GROUNDING_MARKERS)


def is_report_query(query: str) -> bool:
    """True khi user muốn ĐỌC SÂU NỘI DUNG BÁO CÁO PHÂN TÍCH CTCK (không phải BCTC/phân tích chung)."""
    ql = (query or "").lower()
    if any(b in ql for b in _REPORT_EXCLUDE):
        return False
    if any(m in ql for m in _REPORT_TRIGGERS):
        return True
    # follow-up sâu: "báo cáo" + hỏi luận điểm/rủi ro/động lực/cảnh báo của báo cáo
    if "báo cáo" in ql and any(k in ql for k in
                               ("rủi ro", "luận điểm", "động lực", "catalyst", "cảnh báo",
                                "tiềm năng", "dự phóng", "thách thức", "key driver")):
        return True
    return False


def _kg_peers(main: str, limit: int = 2) -> list[str]:
    """Peer SUY TỪ KG (cùng ngành, GẦN vốn hóa nhất) → scale 100 mã không cần hardcode PEER_MAP."""
    try:
        from core.agent_config import get_supabase
        sb = get_supabase()
        rows = (sb.table("graph_nodes").select("entity_id,properties")
                .eq("entity_type", "STOCK").execute().data) or []
        prop = {r["entity_id"]: (r.get("properties") or {}) for r in rows}
        me = prop.get(main.upper())
        if not me or not me.get("sector"):
            return []
        sector, mc0 = me["sector"], (me.get("market_cap_trillion") or 0)
        same = [(t, p.get("market_cap_trillion") or 0) for t, p in prop.items()
                if t != main.upper() and p.get("sector") == sector]
        same.sort(key=lambda x: abs(x[1] - mc0))   # gần vốn hóa nhất = so sánh công bằng nhất
        return [t for t, _ in same[:limit]]
    except Exception:
        return []


def select_peers(main: str, all_tickers: list[str], want_compare: bool) -> list[str]:
    """Peer = mã user TỰ nêu thêm; nếu không nêu mà CÓ ý so sánh → map mặc định → KG cùng ngành; KHÔNG so sánh → []."""
    explicit = [t for t in all_tickers if t != main]
    if explicit:                       # user tự nêu nhiều mã → so sánh đúng mã đó
        return explicit[:2]
    if not want_compare:               # hỏi 1 mã, không so sánh → CHỈ mã đó
        return []
    if main in PEER_MAP:               # peer curated (chuẩn nhất)
        return PEER_MAP[main][:2]
    return _kg_peers(main)             # SUY TỪ NGÀNH trong KG (cho mọi mã đã seed)


def _run_parallel(tasks: dict, max_workers: int = 6) -> dict:
    """tasks = {key: (callable, ticker)} → chạy SONG SONG, trả {key: (result, ticker)}.
    Lỗi 1 task không làm hỏng cả mẻ (kết quả = {'error':...})."""
    out = {}
    with _cf.ThreadPoolExecutor(max_workers=max_workers) as ex:
        fut = {ex.submit(fn): (k, tk) for k, (fn, tk) in tasks.items()}
        for f in _cf.as_completed(fut):
            k, tk = fut[f]
            try:
                out[k] = (f.result(), tk)
            except BaseException as e:   # BaseException: vnstock raise SystemExit khi rate-limit/quota
                out[k] = ({"error": str(e)[:200], "status": "ERROR"}, tk)
    return out


def _safe(fn):
    """Gọi 1 tool, nuốt MỌI lỗi (kể cả SystemExit của vnstock) → dict error, không vỡ orchestrator."""
    try:
        return fn()
    except BaseException as e:
        return {"error": str(e)[:200], "status": "ERROR"}


def gather(main: str, peers: list[str], want_news_window: int = 0, on_progress=None,
           query: str = "") -> tuple[dict, list]:
    """PRE-FETCH song song toàn bộ dữ liệu cho phân tích sâu. Trả (bundle, tool_calls).
    tool_calls khớp định dạng tool_tracker (để Sources/timeline dùng lại).
    on_progress(call): callback gọi NGAY khi mỗi fetch xong → app cập nhật timeline LIVE."""
    tool_calls = []
    bundle = {"main": main, "peers": peers, "data": {}}

    def _rec(tool, ticker, result, ms=None):
        call = {"tool": tool, "ticker": ticker, "result": result, "ms": ms}
        tool_calls.append(call)
        if on_progress:
            try:
                on_progress(call)
            except Exception:
                pass

    # ── PHA 1: TÁCH theo nguồn để vừa NHANH vừa AN TOÀN ──
    # vnstock (financials/price) chạy TUẦN TỰ ở MAIN thread: vnai có thể sys.exit() khi rate-limit và
    # khi gọi trong THREAD POOL nó thoát cả process IM LẶNG (guard không chặn được từ worker) → ép về
    # main thread, _safe (try/except BaseException) bắt được chắc chắn → degrade, KHÔNG chết app.
    # Các tool KHÔNG-vnstock (news=DB, ctx/events=Supabase) chạy SONG SONG (an toàn) — overlap với vnstock.
    nonvn = {
        f"ctx_{main}":  (lambda: query_stock_sector_context(main), main),
        f"news_{main}": (lambda: get_stock_news(main, recent_days=want_news_window), main),
        f"ev_{main}":   (lambda: query_events(ticker=main), main),
    }
    # FORWARD: đồng thuận/dự phóng môi giới (tham khảo) — web_search song song (non-vnstock).
    # QUOTE mã + prefer_sources + recent → ép kết quả ĐÚNG MÃ từ báo cáo CTCK, tránh roundup chung chung.
    nonvn[f"fwd_{main}"] = ((lambda: web_search(
        f'"{main}" giá mục tiêu định giá dự phóng lợi nhuận báo cáo phân tích',
        num_results=5, recent=True, prefer_sources=True)), main)
    # OUTLOOK: câu hỏi TIỀM NĂNG/DỰ ÁN/KẾ HOẠCH/MỞ RỘNG → search DỰ ÁN MỚI NHẤT (recent) → tránh nguồn cũ
    if any(k in (query or "").lower() for k in
           ("tiềm năng", "triển vọng", "tương lai", "dự án", "kế hoạch", "mở rộng", "sắp tới", "động lực tăng trưởng")):
        nonvn[f"outlook_{main}"] = ((lambda: web_search(
            f'"{main}" dự án mới kế hoạch mở rộng đầu tư công suất triển vọng',
            num_results=6, recent=True, prefer_sources=True)), main)
    for pk in peers:
        nonvn[f"news_{pk}"] = ((lambda t=pk: get_stock_news(t, recent_days=want_news_window)), pk)
        # Mỗi mã (kể cả peer) có forward riêng → đủ căn cứ ĐỊNH GIÁ từng mã (không chỉ mã chính)
        nonvn[f"fwd_{pk}"] = ((lambda t=pk: web_search(
            f'"{t}" giá mục tiêu định giá báo cáo phân tích', num_results=4,
            recent=True, prefer_sources=True)), pk)
    with _cf.ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(fn): (k, tk) for k, (fn, tk) in nonvn.items()}
        # MAIN thread: vnstock tuần tự (financials mã chính + giá + peers)
        vn_seq = [(f"fin_{main}", lambda: get_financial_statements(main, "year"), main),
                  (f"price_{main}", lambda: get_market_price(main), main)]
        for pk in peers:
            vn_seq.append((f"fin_{pk}", (lambda t=pk: get_financial_statements(t, "year")), pk))
        for k, fn, tk in vn_seq:
            _t = time.time()
            res = _safe(fn)
            _ms = int((time.time() - _t) * 1000)   # latency per-tool (vnstock chậm → để P4 phân tích)
            bundle["data"][k] = res
            _rec("get_financial_statements" if k.startswith("fin_") else "get_market_price", tk, res, _ms)
        # thu kết quả pool song song
        for f in _cf.as_completed(futs):
            k, tk = futs[f]
            try:
                res = f.result()
            except BaseException as e:
                res = {"error": str(e)[:200], "status": "ERROR"}
            bundle["data"][k] = res
            _rec("query_stock_sector_context" if k.startswith("ctx_") else
                 "get_stock_news" if k.startswith("news_") else
                 "web_search" if (k.startswith("fwd_") or k.startswith("outlook_")) else "query_events", tk, res)

    # ── CHỈ SỐ CHUYÊN NGÀNH (NIM/CASA/NPL/CAR…) — KHÔNG có trong BCTC vnstock → web_search theo LOẠI HÌNH ──
    # Bank/CK/BH bắt buộc có chỉ số đặc thù; orchestrator no-tool synthesis cần được PRE-FETCH các số này.
    for _mk in [main] + peers:
        _loai = (bundle["data"].get(f"fin_{_mk}") or {}).get("loai_hinh")
        # CHỈ web_search cái KHÔNG tính được từ BCTC (NIM/CIR/LDR/cơ cấu/combined đã tính deterministic)
        _q = {"ngan_hang": f"{_mk} tỷ lệ nợ xấu NPL CASA hệ số CAR LDR quy định an toàn vốn mới nhất 2026 báo cáo phân tích",
              "chung_khoan": f"{_mk} thị phần môi giới HOSE mới nhất 2026",
              "bao_hiem": f"{_mk} hiệu suất đầu tư danh mục tăng trưởng phí bảo hiểm 2026"}.get(_loai)
        if _q:
            _sp = _safe(lambda q=_q: web_search(q, num_results=6, news=False))
            bundle["data"][f"chi_so_chuyen_nganh_{_mk}"] = _sp
            _rec("web_search", _mk, _sp)

    # ── PHA 2: phụ thuộc NGÀNH (lấy từ ctx mã chính) — value chain + giá hàng hóa input ──
    ctx = bundle["data"].get(f"ctx_{main}") or {}
    sector = ctx.get("sector") or ctx.get("sector_name")
    if sector:
        vc = _safe(lambda: get_sector_value_chain(sector))
        bundle["data"]["value_chain"] = vc
        _rec("get_sector_value_chain", sector, vc)
        keys = []
        for it in (vc.get("inputs") or []) + (vc.get("outputs") or []):
            ck = it.get("commodity_key")
            if ck:
                keys.append(ck)
        if keys:
            com = _safe(lambda: get_commodity_prices(", ".join(keys[:5])))
            bundle["data"]["commodity"] = com
            _rec("get_commodity_prices", sector, com)

    # ── PHA 3: BẰNG CHỨNG VĨ MÔ CÓ NGUỒN — để MA TRẬN VĨ MÔ dùng SỐ THẬT + link, KHÔNG bịa GDP/lãi suất ──
    # TRONG NƯỚC (GSO/SBV/MOF + báo TC, prefer_sources) + QUỐC TẾ (Fed/DXY/US10Y, intl=True → Investing/CNBC…).
    macro = _safe(lambda: web_search(
        "kinh tế vĩ mô Việt Nam GDP tăng trưởng lãi suất tín dụng tỷ giá USD/VND mới nhất",
        num_results=6, recent=True, prefer_sources=True))
    bundle["data"]["macro_evidence"] = macro
    _rec("web_search", "macro", macro)
    # QUỐC TẾ (Fed/DXY/US10Y) — CHỈ fetch khi THỰC SỰ liên quan, tránh phí token + nhiễu nguồn lạc đề:
    #   • ngành NHẠY lãi suất/dòng vốn ngoại (ngân hàng/chứng khoán/BĐS), HOẶC
    #   • câu hỏi NHẮC tới vĩ mô quốc tế (Fed/lãi suất Mỹ/tỷ giá/dòng vốn ngoại/khối ngoại…).
    # Vd "so sánh HPG ngành thép" → KHÔNG cần Fed/US10Y (driver là đầu tư công + giá thép) → bỏ qua.
    _RATE_SENSITIVE = _MKT.rate_sensitive_sectors  # ngành nhạy lãi suất → markets/vn/config
    _ql = (query or "").lower()
    _want_intl = (sector in _RATE_SENSITIVE) or any(k in _ql for k in (
        "fed", "lãi suất mỹ", "tỷ giá", "dòng vốn", "khối ngoại", "us10y", "dxy",
        "đô la mỹ", "vĩ mô quốc tế", "lợi suất trái phiếu mỹ", "dòng tiền ngoại"))
    if _want_intl:
        # KHÔNG dùng recent cho chỉ số quốc tế: Fed/DXY/US10Y là TRANG QUOTE/DATA (FRED/CNBC/Investing).
        macro_intl = _safe(lambda: web_search(
            "Fed funds rate DXY dollar index US 10 year treasury yield",
            num_results=5, intl=True))
        bundle["data"]["macro_intl"] = macro_intl
        _rec("web_search", "macro_quốc_tế", macro_intl)
    return bundle, tool_calls


def gather_sector(sector_code: str, on_progress=None) -> tuple[dict, list]:
    """PRE-FETCH cho câu hỏi NGÀNH: macro ngành + chuỗi giá trị + giá hàng hóa input + báo cáo ngành
    (nguồn primary) + ĐỊNH GIÁ 2-3 mã ĐẦU NGÀNH (deterministic — đảm bảo luôn có P/E/định giá)."""
    label = _SECTOR_LABEL.get(sector_code, sector_code)
    members = _sector_members(sector_code, limit=3)
    tool_calls = []
    bundle = {"main": sector_code, "label": label, "peers": members, "is_sector": True, "data": {}}

    def _rec(tool, key, result, ms=None):
        call = {"tool": tool, "ticker": key, "result": result, "ms": ms}
        tool_calls.append(call)
        if on_progress:
            try:
                on_progress(call)
            except Exception:
                pass

    # 1) macro ngành (drivers + giá trị hiện tại) + chuỗi giá trị + giá hàng hóa input — SONG SONG (không vnstock)
    nonvn = {
        "sector_impact": (lambda: query_sector_impact(sector_code)),
        "value_chain":   (lambda: get_sector_value_chain(sector_code)),
        "sector_report": (lambda: web_search(f'"ngành {label}" báo cáo phân tích triển vọng 2026',
                                             num_results=6, recent=True, prefer_sources=True)),
        "sector_news":   (lambda: web_search(f'"ngành {label}" kết quả kinh doanh triển vọng mới nhất',
                                             num_results=6, recent=True, prefer_sources=True)),
    }
    with _cf.ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(fn): k for k, fn in nonvn.items()}
        for f in _cf.as_completed(futs):
            k = futs[f]
            try:
                res = f.result()
            except BaseException as e:
                res = {"error": str(e)[:200], "status": "ERROR"}
            bundle["data"][k] = res
            _rec({"sector_impact": "query_sector_impact", "value_chain": "get_sector_value_chain"}
                 .get(k, "web_search"), sector_code, res)

    # giá hàng hóa input/output theo chuỗi giá trị (% thay đổi → suy biên LN).
    # TÁCH nguồn: hàng NỘI ĐỊA (thép xây dựng, xi măng… market=vietnam) → get_vn_domestic_price;
    # hàng QUỐC TẾ (quặng sắt, dầu, HRC…) → get_commodity_prices. Tránh áp giá HRC quốc tế cho BĐS.
    vc = bundle["data"].get("value_chain") or {}
    items = (vc.get("inputs") or []) + (vc.get("outputs") or [])
    intl_keys, dom_keys = [], []
    for it in items:
        mkt = it.get("market") or ""
        if it.get("vn_key") and mkt in ("vietnam", "both"):
            if it["vn_key"] not in dom_keys:
                dom_keys.append(it["vn_key"])
        if it.get("commodity_key") and mkt != "vietnam":
            if it["commodity_key"] not in intl_keys:
                intl_keys.append(it["commodity_key"])
    if intl_keys:
        com = _safe(lambda: get_commodity_prices(", ".join(intl_keys[:5])))
        bundle["data"]["commodity"] = com
        _rec("get_commodity_prices", sector_code, com)
    if dom_keys:
        comvn = _safe(lambda: get_vn_domestic_price(", ".join(dom_keys[:5])))
        bundle["data"]["commodity_vn"] = comvn
        _rec("get_vn_domestic_price", sector_code, comvn)

    # 2) ĐỊNH GIÁ mã ĐẦU NGÀNH — vnstock TUẦN TỰ ở main thread (vnai sys.exit khi rate-limit) → ép có P/E
    for mk in members:
        _t = time.time()
        fin = _safe(lambda t=mk: get_financial_statements(t, "year"))
        bundle["data"][f"fin_{mk}"] = fin
        _rec("get_financial_statements", mk, fin, int((time.time() - _t) * 1000))
    return bundle, tool_calls


def gather_macro(query: str, on_progress=None) -> tuple[dict, list]:
    """PRE-FETCH cho câu hỏi VĨ MÔ: với MỖI chỉ số câu nhắc tới → web_search ĐÚNG NGUỒN (trong nước
    prefer_sources / quốc tế intl=True) theo _MACRO_SOURCE_MAP. Đảm bảo LUÔN có dữ liệu thật + nguồn."""
    from core.agent_config import _MACRO_SOURCE_MAP
    hits = detect_macro_indicators(query)
    tool_calls = []
    bundle = {"main": "macro", "query": query, "indicators": hits, "data": {}}

    def _rec(tool, key, result):
        call = {"tool": tool, "ticker": key, "result": result}
        tool_calls.append(call)
        if on_progress:
            try:
                on_progress(call)
            except Exception:
                pass

    fetched = []
    for key in hits[:4]:                       # trần 4 chỉ số/câu → tránh quá nhiều call
        spec = _MACRO_SOURCE_MAP.get(key)
        if not spec:
            continue
        scope, q, _src = spec
        if scope == "intl":                    # Fed/DXY/US10Y/hàng hóa → nguồn quốc tế (KHÔNG recent: trang quote)
            res = _safe(lambda q=q: web_search(q, num_results=5, intl=True))
        else:                                  # GDP/CPI/tín dụng/lãi suất/tỷ giá VN → nguồn VN, tươi
            res = _safe(lambda q=q: web_search(q, num_results=6, recent=True, prefer_sources=True))
        bundle["data"][f"macro_{key}"] = res
        _rec("web_search", key, res)
        fetched.append(key)
    # Câu vĩ mô chung chung không khớp chỉ số cụ thể → 1 search VN + 1 quốc tế làm nền
    if not fetched:
        d = _safe(lambda: web_search("kinh tế vĩ mô Việt Nam GDP lãi suất tín dụng tỷ giá mới nhất",
                                     num_results=6, recent=True, prefer_sources=True))
        bundle["data"]["macro_vn"] = d; _rec("web_search", "vĩ_mô_VN", d)
        i = _safe(lambda: web_search("Fed funds rate DXY US 10 year treasury yield", num_results=5, intl=True))
        bundle["data"]["macro_intl"] = i; _rec("web_search", "vĩ_mô_quốc_tế", i)
    return bundle, tool_calls


_REC_WORDS = {"kém khả quan": "KÉM KHẢ QUAN", "khả quan": "KHẢ QUAN", "tăng tỷ trọng": "TĂNG TỶ TRỌNG",
              "nắm giữ": "NẮM GIỮ", "trung lập": "TRUNG LẬP", "mua": "MUA", "bán": "BÁN",
              "outperform": "KHẢ QUAN", "buy": "MUA", "hold": "NẮM GIỮ"}
# Tên CTCK để gán nguồn cho báo cáo (best-effort từ tiêu đề/nội dung).
_CTCK_NAMES = ("MBS", "SSI", "VCBS", "Vietcap", "VCSC", "KBSV", "VNDIRECT", "VNDirect", "BSC", "Mirae",
               "MASVN", "ACBS", "FPTS", "BVSC", "SHS", "Agriseco", "Yuanta", "DSC", "TPS", "HSC",
               "Rồng Việt", "VDSC", "PHS", "CSI", "AGR")
_TGT_RE = re.compile(r'giá mục tiêu[^.]{0,90}?(\d{1,3}(?:[.,]\d{3})+)\s*(?:đồng|đ\b|vnd|/\s*cp|/\s*cổ)', re.I)
# Token IN HOA 3-4 ký tự KHÔNG phải mã (tránh nhận nhầm khi dò 'mã sở hữu' của giá mục tiêu).
_OWNER_STOP = {"MUA", "BAN", "BÁN", "CTCP", "CTCK", "HOSE", "HNX", "VND", "LNST", "LNTT", "EPS", "ROE",
               "ROA", "NIM", "CAR", "NPL", "FOB", "CFR", "USD", "CME", "LME", "OMO", "CASA", "TTM",
               "BCTC", "KQKD", "HRC", "FVTPL", "NHNN", "SBV", "GDP", "CPI", "PMI", "ETF", "PCT"}


def _detect_ctck(title: str, blob: str) -> str:
    t = (title or "") + "  " + (blob or "")
    for c in _CTCK_NAMES:
        if re.search(rf'(?<![A-Za-z]){re.escape(c)}(?![A-Za-z])', t, re.I):
            return c.upper() if len(c) <= 6 else c
    return ""


def _extract_report_calls(reads: list, ticker: str) -> list:
    """TRÍCH (giá mục tiêu, khuyến nghị, CTCK) từ báo cáo ĐÃ xác thực đúng mã (reports_read đã lọc).
    KHÔNG đòi mã trong TỪNG câu (báo cáo về HPG không lặp 'HPG' ở câu 'giá mục tiêu 36.600đ') — chỉ LOẠI
    câu gán RÕ cho mã KHÁC ('giá mục tiêu cho VCB là …') để chống lẫn báo cáo mã khác."""
    tk = ticker.upper()
    out, seen = [], set()
    for rd in reads:
        blob = " ".join(rd.get("so_lieu") or [])
        ctck_g = _detect_ctck(rd.get("tieu_de", ""), blob)
        for s in (rd.get("so_lieu") or []):
            m = _TGT_RE.search(s)
            if not m:
                continue
            # XÁC ĐỊNH MÃ SỞ HỮU của giá mục tiêu này (chống bài roundup liệt kê nhiều mã 'FRT: KN MUA … 180,100')
            owner = None
            for pat in (r'\b([A-Z]{3,4})\s*:', r'(?:cho|của|đối với|Cho|Của)\s+([A-Z]{3,4})\b',
                        r'\b([A-Z]{3,4})\b[\s\-:]{0,3}[Kk]huyến nghị', r'\b([A-Z]{3,4})\b[^.]{0,22}?giá mục tiêu'):
                mm = re.search(pat, s)
                if mm and mm.group(1).upper() not in _NOT_TICKER and mm.group(1).upper() not in _OWNER_STOP:
                    owner = mm.group(1).upper()
                    break
            if owner and owner != tk:                # giá mục tiêu của MÃ KHÁC → bỏ
                continue
            tp = m.group(1)
            rec = next((v for k, v in _REC_WORDS.items() if k in s.lower()), "")
            # CTCK ưu tiên theo CÂU ('… Nguồn: BSC'), else global của bài
            ctck_s = next((c for c in _CTCK_NAMES
                           if re.search(rf'(?<![A-Za-z]){re.escape(c)}(?![A-Za-z])', s, re.I)), "") or ctck_g
            out.append({"gia_muc_tieu": tp, "khuyen_nghi": rec, "ctck": ctck_s, "link": rd.get("link"),
                        "ngay": rd.get("date"), "tieu_de": rd.get("tieu_de"), "cau_goc": s[:240]})
    # DEDUP theo (giá mục tiêu) — giữ bản GIÀU NHẤT (có khuyến nghị + CTCK), tránh giữ câu cụt
    best = {}
    for c in out:
        k = c["gia_muc_tieu"]
        cur = best.get(k)
        score = (1 if c["khuyen_nghi"] else 0) + (1 if c["ctck"] else 0)
        if cur is None or score > cur[0]:
            best[k] = (score, c)
    return [v[1] for v in best.values()]


def _render_report_table(calls: list, ticker: str) -> str:
    """Dựng BẢNG giá mục tiêu/khuyến nghị DETERMINISTIC từ extracted_calls (KHÔNG để model bịa)."""
    if not calls:
        return (f"_Chưa trích được giá mục tiêu/khuyến nghị định lượng cho **{ticker}** từ các báo cáo đọc được "
                f"(không kết luận giá mục tiêu để tránh sai lệch)._")
    rows = ["| Nguồn (CTCK) | Khuyến nghị | Giá mục tiêu (đồng) | Ngày báo cáo |",
            "|:---|:---|:---|:---|"]
    for c in calls:
        ng = c.get("ngay") or ""
        td = (c.get("tieu_de") or "").strip()
        if c.get("ctck"):
            ctck = c["ctck"]
        elif td and not td.isdigit():           # tiêu đề có nghĩa → dùng, else nhãn chung theo host
            ctck = td[:30]
        else:
            host = re.sub(r"^www\.|^finance\.|^m\.", "", (c.get("link") or "").split("/")[2] if "//" in (c.get("link") or "") else "")
            ctck = f"Báo cáo PT ({host.split('.')[0] or 'nguồn'})"
        rows.append(f"| [{ctck}]({c.get('link')}) | {c.get('khuyen_nghi') or '(không nêu rõ)'} "
                    f"| {c['gia_muc_tieu']} | {ng} |")
    return "\n".join(rows)


def _scrub_unsourced_targets(text: str, corpus_blob: str, verified: set) -> str:
    """XÓA hàng bảng / câu nêu 'giá mục tiêu X.XXX' mà số KHÔNG có trong nội dung báo cáo đã đọc (chống model
    bịa giá mục tiêu từ trí nhớ). Chỉ động tới context giá-mục-tiêu/khuyến-nghị, không đụng số khác."""
    def _ok(num):
        return (num in verified or num in corpus_blob
                or num.replace(".", ",") in corpus_blob or num.replace(",", ".") in corpus_blob)
    out, ctx = [], ("mục tiêu", "khuyến nghị", "target")
    for line in text.split("\n"):
        ll = line.lower()
        nums = re.findall(r'\d{1,3}(?:[.,]\d{3})+', line)
        is_row = line.strip().startswith("|") and "---" not in line
        # hàng bảng có số tiền + ngữ cảnh khuyến nghị, hoặc câu văn nêu 'giá mục tiêu X'
        if nums and (any(k in ll for k in ctx)) and (is_row or "giá mục tiêu" in ll):
            if not any(_ok(n) for n in nums):
                continue   # toàn số bịa → bỏ dòng
        out.append(line)
    return "\n".join(out)


def gather_report(ticker: str, query: str, on_progress=None) -> tuple[dict, list]:
    """PRE-FETCH cho câu ĐỌC SÂU BÁO CÁO CTCK: web_search báo cáo phân tích của MÃ → read_article (PDF-capable)
    top bài ĐỌC ĐƯỢC để lấy so_lieu THẬT → + BCTC để đối chiếu báo cáo vs thực tế. ÉP đọc, KHÔNG để model bịa."""
    tool_calls = []
    bundle = {"main": ticker, "query": query, "data": {}}

    def _rec(tool, key, result):
        call = {"tool": tool, "ticker": key, "result": result}
        tool_calls.append(call)
        if on_progress:
            try:
                on_progress(call)
            except Exception:
                pass

    # 1) Tìm báo cáo phân tích/khuyến nghị của MÃ (prefer_sources → Vietstock/SSI/Vietcap…; thường là PDF).
    # LƯU Ý: trang Vietstock có ticker ở sidebar → snippet bài LẠC ĐỀ (PHR/macro) vẫn chứa 'HPG' → KHÔNG thể
    # lọc theo snippet. Cách CHẮC: ĐỌC rồi validate nội dung; chỉ ghi NGUỒN (panel) các bài ĐÃ validate.
    sr = _safe(lambda: web_search(
        f'{ticker} báo cáo phân tích định giá giá mục tiêu khuyến nghị',
        num_results=10, recent=True, prefer_sources=True))
    bundle["data"]["search_results"] = sr

    # 2) ĐỌC THẬT — chỉ giữ bài là BÁO CÁO THỰC SỰ VỀ MÃ (loại trang hồ sơ/khóa học, loại mã khác/roundup mã khác).
    _tkl = ticker.lower()
    def _is_report_url(u):
        ul = (u or "").lower()
        if any(m in ul for m in ("downloadedoc", "/bcpt/", "bao-cao-phan-tich", "/bao-cao/",
                                  "khuyen-nghi", ".pdf", "bao-cao-cap-nhat")):
            return True
        if re.search(rf"/{re.escape(_tkl)}-[a-z]", ul) or "quote" in ul or "ho-so" in ul:
            return False
        return None
    def _is_report_content(so_lieu):
        blob = " ".join(so_lieu).lower()
        if blob.count(_tkl) < 1:                    # phải nhắc ĐÚNG mã
            return False
        if not any(k in blob for k in ("giá mục tiêu", "khuyến nghị", "khả quan", "trung lập",
                                       "dự phóng", "nắm giữ", "định giá", "tăng tỷ trọng", "target")):
            return False
        if blob.count("khóa học") >= 2:
            return False
        # LOẠI bài CHỦ YẾU về MÃ KHÁC: có giá mục tiêu nhưng KHÔNG cái nào thuộc về mã đang hỏi
        # (vd báo cáo PHR/roundup liệt kê mã khác) → reports_read sẽ bịa luận điểm sai.
        tmp = _extract_report_calls([{"so_lieu": so_lieu, "link": "", "date": "", "tieu_de": ""}], _tkl.upper())
        has_tgt = bool(_TGT_RE.search(blob))
        if has_tgt and not tmp:                     # có giá mục tiêu nhưng toàn của mã khác → loại
            return False
        return True

    reads = []
    for r in (sr.get("results") or [])[:9]:
        link = r.get("link")
        if not link or _is_report_url(link) is False:
            continue
        ra = _safe(lambda l=link: read_article(
            l, focus=f"{ticker} giá mục tiêu khuyến nghị luận điểm biên lợi nhuận tăng trưởng EPS rủi ro"))
        sl = ra.get("so_lieu") or []
        if ra.get("status") == "OK" and sl and _is_report_content(sl):
            reads.append({"link": link, "title": r.get("title"), "date": r.get("date"),
                          "tieu_de": ra.get("tieu_de"), "so_lieu": sl})
            _rec("read_article", ticker, ra)        # CHỈ ghi nguồn bài ĐÃ validate (panel sạch)
        if len(reads) >= 3:
            break
    # GHI 1 web_search với kết quả = báo cáo ĐÃ ĐỌC-VALIDATE → panel "Nguồn" chỉ hiện báo cáo đúng mã
    _clean = {"query": f"báo cáo phân tích {ticker}", "mode": "web", "status": "OK",
              "count": len(reads),
              "results": [{"title": rd.get("tieu_de") or rd.get("title"), "link": rd["link"],
                           "date": rd.get("date"), "nguon_uy_tin": True} for rd in reads]}
    _rec("web_search", ticker, _clean)
    bundle["data"]["reports_read"] = reads
    # 2b) TRÍCH (giá mục tiêu + khuyến nghị) BẰNG REGEX từ câu CÓ NHẮC ĐÚNG MÃ → bảng deterministic,
    #     KHÔNG để model bịa giá mục tiêu. (Câu báo cáo mã khác lẫn vào sẽ bị loại vì không có mã.)
    bundle["data"]["extracted_calls"] = _extract_report_calls(reads, ticker)

    # 3) BCTC để ĐỐI CHIẾU báo cáo vs thực tế — CHỈ khi user YÊU CẦU (đối chiếu/kiểm chứng). Mặc định KHÔNG
    #    (tập trung nội dung báo cáo, tránh thêm cột BCTC + tiết kiệm 1 call vnstock).
    bundle["compare"] = wants_grounding(query)
    if bundle["compare"]:
        fin = _safe(lambda: get_financial_statements(ticker, "year"))
        bundle["data"]["financials"] = fin
        _rec("get_financial_statements", ticker, fin)
    return bundle, tool_calls


def _synthesis_prompt_report(query: str, ticker: str, bundle: dict) -> str:
    """User-prompt tổng hợp câu ĐỌC SÂU BÁO CÁO (no-tool): CHỈ dùng so_lieu đã ĐỌC THẬT, cấm bịa luận điểm."""
    data_json = json.dumps(bundle["data"], ensure_ascii=False, default=str)
    n_read = len(bundle["data"].get("reports_read") or [])
    return (
        f"CÂU HỎI: {query}\nMÃ: {ticker}\n\n"
        f"DỮ LIỆU ĐÃ ĐỌC THẬT ({n_read} báo cáo đọc được — `reports_read[].so_lieu` là CÂU CHỨA SỐ trích "
        "TRỰC TIẾP từ báo cáo; `financials` = BCTC thực tế để đối chiếu). KHÔNG gọi thêm tool:\n"
        f"```json\n{data_json}\n```\n\n"
        "YÊU CẦU (đây là TỔNG HỢP quan điểm BÊN THỨ BA — môi giới, KHÔNG phải khuyến nghị của hệ thống):\n"
        "⛔ TUYỆT ĐỐI KHÔNG tự lập bảng giá mục tiêu và KHÔNG nêu BẤT KỲ con số giá mục tiêu nào (hệ thống đã CHÈN "
        "sẵn bảng giá mục tiêu trích thật ở đầu — bạn KHÔNG lặp lại). Mọi số giá mục tiêu bạn 'nhớ' = BỊA, CẤM.\n"
        "NHIỆM VỤ của bạn (mỗi ý PHẢI kèm SỐ CỤ THỂ trích từ so_lieu — KHÔNG nói chung chung):\n"
        "(1) LUẬN ĐIỂM ĐẦU TƯ — mỗi luận điểm nêu CON SỐ THẬT từ so_lieu (vd 'sản lượng mục tiêu 15 triệu tấn "
        "+40% YoY', 'LNST 2025 15.450 tỷ +29%', 'LNTT Q1 10.762 tỷ +180,3%'), kèm **[CTCK/tiêu đề · ngày](link)**. "
        "CẤM viết 'tăng trưởng tốt nhờ…' mà không có số.\n"
        + (("(2) BẢNG KEY METRIC — ĐỐI CHIẾU báo cáo vs thực tế, dạng `| Chỉ số | Báo cáo nêu | BCTC thực tế | "
            "Nhận xét |` (số báo cáo từ so_lieu, số thực tế từ `financials.ratios`): tăng trưởng LNST/doanh thu, "
            "biên, P/E, P/B. Chỉ rõ báo cáo LẠC QUAN hay SÁT thực tế.\n") if bundle.get("compare") else
           ("(2) KEY METRIC BÁO CÁO NHẤN MẠNH — liệt kê các chỉ số/dự phóng CHÍNH báo cáo đưa ra (EPS/LNST/doanh "
            "thu/biên/định giá…) lấy TỪ so_lieu, mỗi số kèm link. KHÔNG tự thêm cột 'BCTC thực tế' / KHÔNG đối chiếu "
            "(user không yêu cầu) — chỉ trình bày thông tin TỪ BÁO CÁO.\n")) +
        "(3) RỦI RO — CHỈ nêu rủi ro CÓ TRONG so_lieu (vd câu 'Rủi ro đầu tư: 1)… 2)…' của báo cáo), TRÍCH cụ thể "
        "kèm link. Nếu so_lieu KHÔNG có câu rủi ro của báo cáo → ghi '(báo cáo đã đọc không nêu rủi ro cụ thể)', "
        "KHÔNG bịa rủi ro chung chung kiểu 'doanh nghiệp chu kỳ/rủi ro thị trường'.\n"
        "KHÔNG nêu lại giá mục tiêu (đã có bảng trên). KHÔNG khuyến nghị mua/bán của hệ thống. Disclaimer 1 lần cuối."
    )


def run_report(query: str, ticker: str, gemini_client, model: str, types_mod,
               on_progress=None) -> tuple[str, list]:
    """Chạy path ĐỌC SÂU BÁO CÁO: gather_report (ép read_article) → 1 vòng synthesis grounded. Trả (answer, calls)."""
    try:
        bundle, tool_calls = gather_report(ticker, query, on_progress=on_progress)
        # KHÔNG đọc được báo cáo HỢP LỆ → TỪ CHỐI DETERMINISTIC (không gọi model → KHÔNG thể bịa bảng khuyến nghị)
        if not (bundle["data"].get("reports_read") or []):
            return (f"Hiện chưa đọc được báo cáo phân tích cập nhật có nội dung định lượng cho **{ticker}** "
                    f"(các nguồn tìm được là trang hồ sơ/không trích được số). Mình KHÔNG nêu giá mục tiêu/khuyến "
                    f"nghị suy đoán để tránh sai lệch. Bạn có thể hỏi định giá {ticker} theo dữ liệu BCTC thực tế, "
                    f"hoặc nêu 1 link báo cáo cụ thể để mình đọc.\n\n"
                    f"⚠️ Thông tin chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.", tool_calls)
        prompt = _synthesis_prompt_report(query, ticker, bundle)
        resp = gemini_client.models.generate_content(
            model=model, contents=prompt,
            config=types_mod.GenerateContentConfig(
                system_instruction=_synth_system(), temperature=0.2, max_output_tokens=14336),
        )
        try:
            text = resp.text or ""
        except Exception:
            text = ""
            for c in (getattr(resp, "candidates", None) or []):
                for p in (getattr(getattr(c, "content", None), "parts", None) or []):
                    text += getattr(p, "text", "") or ""
        # CHỐNG BỊA: scrub mọi giá mục tiêu model tự thêm KHÔNG có trong báo cáo đã đọc, rồi CHÈN bảng
        # giá mục tiêu DETERMINISTIC (chỉ từ extracted_calls). Lite model hay phớt prompt → ép ở code.
        calls = bundle["data"].get("extracted_calls") or []
        corpus_blob = " ".join(s for rd in (bundle["data"].get("reports_read") or [])
                               for s in (rd.get("so_lieu") or []))
        verified = {c["gia_muc_tieu"] for c in calls}
        text = _scrub_unsourced_targets(text, corpus_blob, verified)
        table = _render_report_table(calls, ticker)
        text = (f"**Giá mục tiêu & khuyến nghị (trích trực tiếp từ báo cáo đã đọc — quan điểm bên thứ ba, "
                f"KHÔNG phải khuyến nghị của hệ thống):**\n\n{table}\n\n---\n\n" + text)
        import core.verifier as _vf
        text, _ = _vf.enforce(ensure_disclaimer(sanitize_citations(text)))
        return text, tool_calls
    except BaseException as e:
        return (f"⚠️ Chưa đọc được báo cáo phân tích ({str(e)[:100]}). Thử lại sau ít giây.", [])


def _synthesis_prompt_macro(query: str, bundle: dict) -> str:
    """User-prompt tổng hợp câu VĨ MÔ (no-tool): trả lời ĐÚNG câu hỏi, mọi số kèm nguồn, KHÔNG bịa."""
    data_json = json.dumps(bundle["data"], ensure_ascii=False, default=str)
    return (
        f"CÂU HỎI: {query}\n\n"
        "DỮ LIỆU ĐÃ THU THẬP SẴN (kết quả web_search ĐÚNG NGUỒN cho từng chỉ số — KHÔNG gọi thêm tool):\n"
        f"```json\n{data_json}\n```\n\n"
        "YÊU CẦU: trả lời TRỰC TIẾP câu hỏi như chuyên viên vĩ mô. ⛔ MỌI con số (lãi suất/GDP/CPI/tỷ giá/"
        "Fed/DXY/US10Y…) PHẢI lấy TỪ dữ liệu trên và KÈM **[Nguồn · ngày](link)** bấm được; tuyệt đối KHÔNG "
        "nêu số từ trí nhớ — nếu dữ liệu không có con số thì nói rõ '(chưa lấy được số cập nhật)', KHÔNG bịa. "
        "Nêu Ý NGHĨA & cơ chế tác động tới TTCK/ngành VN (định tính được, nhưng SỐ phải có nguồn). "
        "Trình bày tiếng Việt gọn, có thể dùng bảng. KHÔNG khuyến nghị mua/bán. Disclaimer 1 lần ở cuối."
    )


def _synthesis_prompt_sector(query: str, bundle: dict, lessons: list = None) -> str:
    """User-prompt tổng hợp cho câu NGÀNH (no-tool) — bắt buộc định lượng macro + định giá mã tiêu biểu."""
    data_json = json.dumps(bundle["data"], ensure_ascii=False, default=str)
    members = ", ".join(bundle["peers"]) or "(không có)"
    lesson_block = ""
    if lessons:
        lesson_block = ("\n⚠️ BÀI HỌC LẦN TRƯỚC (cân nhắc, vẫn ưu tiên dữ liệu hiện tại):\n"
                        + "\n".join(f"  • {l}" for l in lessons) + "\n")
    return (
        f"CÂU HỎI: {query}\n\n"
        f"NGÀNH: {bundle['label']} · Mã tiêu biểu (đã lấy BCTC để định giá): {members}\n"
        f"{lesson_block}\n"
        "DỮ LIỆU ĐÃ THU THẬP SẴN (KHÔNG gọi thêm tool — chỉ dùng dữ liệu này; thiếu số nào ghi "
        "'(chưa có số)', TUYỆT ĐỐI KHÔNG bịa):\n"
        f"```json\n{data_json}\n```\n\n"
        "YÊU CẦU TRÌNH BÀY như CHUYÊN VIÊN PHÂN TÍCH NGÀNH (cấp analyst):\n"
        "1) TỔNG QUAN NGÀNH: định lượng động lực vĩ mô — đầu tư công (SỐ + % so cùng kỳ/đầu năm + NGUỒN báo), "
        "giá đầu vào/đầu ra (% thay đổi từ `commodity` → suy hướng biên LN), sản lượng/giá bán (từ báo cáo ngành).\n"
        "2) LUẬN ĐIỂM ĐẦU TƯ — TIỀM NĂNG & RỦI RO: mỗi ý kèm SỐ và NGUỒN (link báo cáo ngành trong dữ liệu).\n"
        "3) CỔ PHIẾU TIÊU BIỂU — BẮT BUỘC ĐỊNH GIÁ: với MỖI mã ở trên, nêu P/E hiện tại/PEG/vùng định giá nội tại "
        "(từ `fin_*`: ratios, dinh_gia_noi_tai, dinh_gia_vs_lich_su, chi_so_chuyen_nganh_tinh) + biên LN + luận điểm "
        "& rủi ro RIÊNG (kèm số). KHÔNG chỉ liệt kê tên/Beta.\n"
        "Trích nguồn theo mục 3A (CHỈ link web http bấm được; số nội bộ ghi '(cập nhật ...)' không link; KHÔNG in "
        "[Knowledge Graph]/'Trọng số'/lời gọi tool). KHÔNG khuyến nghị mua/bán/tỷ trọng. Kết bằng disclaimer 1 lần."
    )


def _render_financial_tables(fin: dict) -> str:
    """Dựng BẢNG IS/BS/CF/RATIO DETERMINISTIC từ by_period + quy_moi_nhat (số CHUẨN, không để model bịa/miscopy).
    Cột = CÁC NĂM (cũ→mới) + QUÝ MỚI NHẤT (KHÔNG phải TTM)."""
    bp = fin.get("by_period") or []
    r = fin.get("ratios") or {}
    diag = r.get("chan_doan") or {}
    q = r.get("quy_moi_nhat") or {}
    if not bp:
        return ""
    pmap = {p.get("period"): p for p in bp}
    years = sorted(pmap.keys())                          # cũ→mới
    qky = q.get("ky") or "Quý mới nhất"

    def f0(v):  return f"{v:,.0f}".replace(",", ".") if isinstance(v, (int, float)) else "—"
    def f1(v):  return f"{v:.1f}" if isinstance(v, (int, float)) else "—"

    def yr_row(label, field, fmt, qval="__skip__"):
        cells = " | ".join(fmt(pmap[y].get(field)) for y in years)
        qc = (fmt(qval) if qval != "__skip__" else "—")
        return f"| {label} | {cells} | {qc} |"

    hdr = " | ".join(years)
    sep = "|:---|" + "---:|" * (len(years) + 1)
    out = [f"**Bảng 1 — Kết quả kinh doanh (IS), tỷ VND** (cột cuối = **{qky}**, không phải TTM):",
           f"| Chỉ tiêu (IS) | {hdr} | {qky} |", sep,
           yr_row("Doanh thu thuần", "doanh_thu_thuan_ty", f0, q.get("doanh_thu_ty")),
           yr_row("LN gộp", "loi_nhuan_gop_ty", f0),
           yr_row("LNST", "lnst_ty", f0, q.get("lnst_ty")),
           yr_row("Biên gộp (%)", "bien_gop_pct", f1, q.get("bien_gop_pct")),
           yr_row("Biên HĐKD/EBIT (%)", "bien_ebit_pct", f1),
           yr_row("Biên LNST (%)", "bien_lnst_pct", f1, q.get("bien_lnst_pct"))]
    out.append(f"_Tăng trưởng quý {qky}: doanh thu **{f1(q.get('doanh_thu_yoy_pct'))}% YoY** "
               f"({f1(q.get('doanh_thu_qoq_pct'))}% QoQ), LNST **{f1(q.get('lnst_yoy_pct'))}% YoY**; "
               f"biên gộp đổi **{f1(q.get('bien_gop_thay_doi_diem_pct'))} điểm %** so cùng kỳ._")

    sep2 = "|:---|" + "---:|" * len(years)
    out += ["", f"**Bảng 2 — Cân đối kế toán (BS) cuối kỳ, tỷ VND:**",
            f"| Chỉ tiêu (BS) | {hdr} |", sep2,
            "| Tổng tài sản | " + " | ".join(f0(pmap[y].get("tong_tai_san_ty")) for y in years) + " |",
            "| Vốn chủ sở hữu | " + " | ".join(f0(pmap[y].get("von_chu_so_huu_ty")) for y in years) + " |",
            "| Nợ phải trả | " + " | ".join(f0(pmap[y].get("no_phai_tra_ty")) for y in years) + " |",
            "| Nợ/VCSH (lần) | " + " | ".join(f1(pmap[y].get("no_tren_vcsh")) for y in years) + " |"]

    out += ["", f"**Bảng 3 — Dòng tiền & Hiệu quả vốn (CF/ROE/ROA):**",
            f"| Chỉ tiêu | {hdr} |", sep2,
            "| CFO (tỷ) | " + " | ".join(f0(pmap[y].get("luu_chuyen_tien_hdkd_ty")) for y in years) + " |",
            "| ROE (%) | " + " | ".join(f1(pmap[y].get("roe_pct")) for y in years) + " |",
            "| ROA (%) | " + " | ".join(f1(pmap[y].get("roa_pct")) for y in years) + " |"]

    # Bảng 4 — chỉ số TTM/định giá hiện tại (1 cột)
    rows4 = [("Biên gộp / LNST TTM (%)", f"{f1(r.get('bien_gop_ttm_pct'))} / {f1(r.get('bien_lnst_ttm_pct'))}"),
             ("ROE / ROA TTM (%)", f"{f1(r.get('roe_ttm_pct'))} / {f1(r.get('roa_ttm_pct'))}"),
             ("ROIC (%)", f1(diag.get("roic_pct"))),
             ("Chu kỳ tiền mặt CCC (ngày)", f0(diag.get("chu_ky_tien_mat_ngay"))),
             ("Nợ ròng/EBITDA (lần)", f1(diag.get("no_rong_tren_ebitda"))),
             ("Khả năng trả lãi (lần)", f1(diag.get("kha_nang_tra_lai_vay"))),
             ("CFO/LNST (chất lượng LN)", f1(r.get("cfo_tren_lnst"))),
             ("P/E", f1(r.get("pe"))), ("PEG", f"{f1(r.get('peg'))} ({r.get('peg_danh_gia') or ''})"),
             ("P/B", f1(r.get("pb"))), ("EV/EBITDA", f1(r.get("ev_tren_ebitda"))),
             ("Trạng thái tiền mặt", r.get("trang_thai_tien_mat") or "—")]
    out += ["", f"**Bảng 4 — Chỉ số {r.get('ky_chi_so','TTM')} & Định giá hiện tại:**",
            "| Chỉ số | Giá trị |", "|:---|:---|"]
    out += [f"| {k} | {v} |" for k, v in rows4 if v not in ("—", "— / —")]
    return "\n".join(out)


_CSN_LABELS = {  # nhãn chỉ số CHUYÊN NGÀNH (bank/CK/BH) cho section Hiệu quả
    "NIM_pct": "NIM (%)", "CIR_pct": "CIR (%)",
    "cho_vay_tren_tien_gui_KH_pct": "Cho vay/Tiền gửi KH — LDR thô (%)",
    "thu_ngoai_lai_tren_TOI_pct": "Thu ngoài lãi/TOI (%)",
    "bao_phu_du_phong_tren_du_no_pct": "Bao phủ dự phòng/dư nợ (%)",
    "du_no_margin_ty": "Dư nợ margin (tỷ)", "margin_tren_vcsh": "Dư nợ margin/VCSH (lần)",
    "mix3mang_moi_gioi_pct": "Cơ cấu LN: Môi giới (%)", "mix3mang_margin_pct": "Cơ cấu LN: Margin (%)",
    "mix3mang_tu_doanh_rong_pct": "Cơ cấu LN: Tự doanh ròng (%)",
    "loss_ratio_pct": "Loss ratio (%)", "combined_ratio_pct": "Combined ratio (%)",
    "ty_le_giu_lai_pct": "Tỷ lệ giữ lại (%)",
}


def _financial_sections(fin: dict) -> list:
    """Trả các SECTION (key, tiêu đề, bảng markdown) — THEO LOẠI HÌNH DN (bank/CK/BH/sản xuất).
    Mỗi section: bảng số (deterministic) + (nhận xét do model ghép sau)."""
    bp = fin.get("by_period") or []
    r = fin.get("ratios") or {}; diag = r.get("chan_doan") or {}; q = r.get("quy_moi_nhat") or {}
    loai = fin.get("loai_hinh") or ""
    if not bp:
        return []
    pmap = {p.get("period"): p for p in bp}; years = sorted(pmap.keys())
    qky = q.get("ky") or "Quý mới nhất"
    fin_sector = loai in ("ngan_hang", "bao_hiem")          # bank/BH: KHÔNG có LN gộp/biên gộp
    def f0(v): return f"{v:,.0f}".replace(",", ".") if isinstance(v, (int, float)) else "—"
    def f1(v): return f"{v:.1f}" if isinstance(v, (int, float)) else "—"
    hdr = " | ".join(years); sepQ = "|:---|" + "---:|" * (len(years) + 1); sepN = "|:---|" + "---:|" * len(years)
    def yq(lbl, fld, fmt, qv="__"):
        return f"| {lbl} | " + " | ".join(fmt(pmap[y].get(fld)) for y in years) + f" | {fmt(qv) if qv != '__' else '—'} |"
    def yn(lbl, fld, fmt):
        return f"| {lbl} | " + " | ".join(fmt(pmap[y].get(fld)) for y in years) + " |"

    # ── 1) IS — bank/BH dùng TOI, bỏ LN gộp; còn lại có LN gộp/biên gộp ──
    rev_lbl = "Tổng thu nhập HĐ (TOI)" if fin_sector else "Doanh thu thuần"
    is_rows = [yq(rev_lbl, "doanh_thu_thuan_ty", f0, q.get("doanh_thu_ty"))]
    if not fin_sector:
        is_rows += [yq("LN gộp", "loi_nhuan_gop_ty", f0)]
    is_rows += [yq("LNST", "lnst_ty", f0, q.get("lnst_ty"))]
    if not fin_sector:
        is_rows += [yq("Biên gộp (%)", "bien_gop_pct", f1, q.get("bien_gop_pct")),
                    yq("Biên HĐKD/EBIT (%)", "bien_ebit_pct", f1)]
    is_rows += [yq("Biên LNST (%)", "bien_lnst_pct", f1, q.get("bien_lnst_pct"))]
    is_t = "\n".join([f"| Chỉ tiêu (IS, tỷ VND) | {hdr} | **{qky}** |", sepQ] + is_rows)
    _bg = (f"; biên gộp đổi **{f1(q.get('bien_gop_thay_doi_diem_pct'))} điểm %** so cùng kỳ" if not fin_sector else "")
    is_t += (f"\n\n> Quý **{qky}**: doanh thu/TOI **{f1(q.get('doanh_thu_yoy_pct'))}% YoY**, "
             f"LNST **{f1(q.get('lnst_yoy_pct'))}% YoY**{_bg}.")

    # ── 2) Dòng tiền & ROE/ROA ──
    cf_t = "\n".join([f"| Chỉ tiêu | {hdr} |", sepN, yn("CFO (tỷ)", "luu_chuyen_tien_hdkd_ty", f0),
                      yn("ROE (%)", "roe_pct", f1), yn("ROA (%)", "roa_pct", f1)])
    cf_t += (f"\n\n> CFO/LNST (chất lượng LN): **{f1(r.get('cfo_tren_lnst'))}** · "
             f"Trạng thái tiền mặt: **{r.get('trang_thai_tien_mat') or '—'}**")

    # ── 3) BS ──
    bs_t = "\n".join([f"| Chỉ tiêu (BS, tỷ VND) | {hdr} |", sepN,
                      yn("Tổng tài sản", "tong_tai_san_ty", f0), yn("Vốn chủ sở hữu", "von_chu_so_huu_ty", f0),
                      yn("Nợ phải trả", "no_phai_tra_ty", f0), yn("Nợ/VCSH (lần)", "no_tren_vcsh", f1)])
    bs_t += (f"\n\n> Nợ ròng/EBITDA: **{f1(diag.get('no_rong_tren_ebitda'))} lần** · "
             f"Khả năng trả lãi: **{f1(diag.get('kha_nang_tra_lai_vay'))} lần**")

    # ── 4) HIỆU QUẢ — chỉ số CHUYÊN NGÀNH nếu có (bank/CK/BH), else vốn lưu động (CCC/ROIC) ──
    csn = r.get("chi_so_chuyen_nganh_tinh") or {}
    if csn:
        rows = []
        for k, v in csn.items():
            if k == "luu_y" or v is None:
                continue
            val = f"{v:,.0f}".replace(",", ".") if (isinstance(v, (int, float)) and abs(v) >= 1000) else (f1(v) if isinstance(v, float) else str(v))
            rows.append(f"| {_CSN_LABELS.get(k, k)} | {val} |")
        hq_t = "| Chỉ số chuyên ngành (tính từ BCTC) | Giá trị |\n|:---|---:|\n" + "\n".join(rows)
        if csn.get("luu_y"):
            hq_t += f"\n\n> _{csn['luu_y']}_"
        hq_title = {"ngan_hang": "Chỉ số đặc thù NGÂN HÀNG (NIM/CIR/LDR/bao phủ nợ xấu)",
                    "chung_khoan": "Chỉ số đặc thù CHỨNG KHOÁN (margin/cơ cấu doanh thu)",
                    "bao_hiem": "Chỉ số đặc thù BẢO HIỂM (combined/loss/giữ lại)"}.get(loai, "Hiệu quả vận hành")
    else:
        hq_t = ("| Chỉ số | Giá trị |\n|:---|---:|\n"
                f"| Chu kỳ tiền mặt CCC (ngày) | {f0(diag.get('chu_ky_tien_mat_ngay'))} |\n"
                f"| ROIC (%) | {f1(diag.get('roic_pct'))} |\n"
                f"| ROE / ROA TTM (%) | {f1(r.get('roe_ttm_pct'))} / {f1(r.get('roa_ttm_pct'))} |")
        hq_title = "Hiệu quả vận hành"

    # ── 5) ĐỊNH GIÁ + so sánh TRUNG VỊ LỊCH SỬ (nhiều năm) ──
    dg_t = ("| Chỉ số | Giá trị |\n|:---|---:|\n"
            f"| P/E | {f1(r.get('pe'))} |\n| PEG | {f1(r.get('peg'))} ({r.get('peg_danh_gia') or ''}) |\n"
            f"| P/B | {f1(r.get('pb'))} |\n| EV/EBITDA | {f1(r.get('ev_tren_ebitda'))} |")
    dgl = r.get("dinh_gia_vs_lich_su") or {}
    if dgl.get("pe") or dgl.get("pb"):
        dg_t += ("\n\n**So với lịch sử nhiều năm của chính mã:**\n"
                 "| Chỉ số | Hiện tại | Trung vị | Min–Max | Vị thế |\n|:---|---:|---:|:---:|:---|")
        for key, lbl in (("pe", "P/E"), ("pb", "P/B")):
            h = dgl.get(key)
            if h:
                dg_t += (f"\n| {lbl} | {f1(h.get('hien_tai'))} | {f1(h.get('trung_vi'))} | "
                         f"{f1(h.get('min'))}–{f1(h.get('max'))} | {h.get('vi_the', '')} |")
    return [("SINH_LOI", "Khả năng sinh lời (Profitability)", is_t),
            ("DONG_TIEN", "Thanh khoản & Dòng tiền", cf_t),
            ("DON_BAY", "Đòn bẩy & An toàn tài chính", bs_t),
            ("HIEU_QUA", hq_title, hq_t),
            ("DINH_GIA", "Định giá", dg_t)]


def run_full_financials(query, main, bundle, gemini_client, model, types_mod):
    """Phân tích tài chính SÂU 1 mã — báo cáo CO-LOCATED: mỗi nhóm = BẢNG (code, số chuẩn) + NHẬN XÉT (model)
    ngay dưới; rồi bảng Tổng quan chấm sao + Rủi ro. Trả text (hoặc None nếu thiếu dữ liệu → fallback)."""
    fin = bundle["data"].get(f"fin_{main}") or {}
    secs = _financial_sections(fin)
    if not secs:
        return None
    _drv = {k: v for k in (f"news_{main}", f"outlook_{main}", f"fwd_{main}", "commodity", f"ev_{main}")
            if (v := bundle["data"].get(k))}
    secs_for_prompt = "\n\n".join(f"[{k}] {h}:\n{t}" for k, h, t in secs)
    prompt = (
        f"CÂU HỎI: {query}\nMÃ: {main}\n\n"
        f"CÁC BẢNG SỐ ĐÃ CHUẨN (KHÔNG gõ lại số):\n{secs_for_prompt}\n\n"
        f"DỮ LIỆU DRIVER (tin/sự kiện/giá hàng hóa để GIẢI THÍCH lý do):\n```json\n"
        f"{json.dumps(_drv, ensure_ascii=False, default=str)[:6000]}\n```\n\n"
        "Viết NHẬN XÉT cho TỪNG NHÓM (1-3 câu, BÁM số trong bảng, có đối chiếu QUÝ MỚI NHẤT vs cùng kỳ + GIẢI "
        "THÍCH lý do tăng/giảm từ driver). TRẢ ĐÚNG ĐỊNH DẠNG (mỗi mốc 1 đoạn, KHÔNG kèm bảng):\n"
        "[[SINH_LOI]] <nhận xét sinh lời>\n[[DONG_TIEN]] <…>\n[[DON_BAY]] <…>\n[[HIEU_QUA]] <…>\n[[DINH_GIA]] "
        "<rẻ/đắt vs lịch sử>\n"
        "[[TONG_QUAN]] <BẢNG markdown: `| Nhóm chỉ tiêu | Đánh giá | Xu hướng |` cho 6 nhóm (Sinh lời/Thanh khoản/"
        "Đòn bẩy/Hiệu quả vận hành/Dòng tiền/Định giá), mỗi nhóm số sao ★(1-5)+nhãn + mũi tên ↑/→/↓, dựa SỐ trong bảng>\n"
        "[[RUI_RO]] <2-3 gạch đầu dòng rủi ro CÓ SỐ>\n"
        "KHÔNG khuyến nghị mua/bán. KHÔNG nêu giá mục tiêu bịa.")
    resp = gemini_client.models.generate_content(
        model=model, contents=prompt,
        config=types_mod.GenerateContentConfig(system_instruction=_synth_system(loai_hinh=fin.get("loai_hinh")),
                                               temperature=0.2, max_output_tokens=8192))
    try:
        raw = resp.text or ""
    except Exception:
        raw = ""
        for c in (getattr(resp, "candidates", None) or []):
            for p in (getattr(getattr(c, "content", None), "parts", None) or []):
                raw += getattr(p, "text", "") or ""
    # parse theo mốc [[KEY]]
    parts = {}
    for m in re.finditer(r"\[\[([A-Z_]+)\]\]\s*(.*?)(?=\[\[[A-Z_]+\]\]|\Z)", raw, re.S):
        parts[m.group(1)] = m.group(2).strip()
    # GHÉP: mỗi nhóm = bảng + nhận xét ngay dưới
    out = [f"## Phân tích tài chính chuyên sâu — {main}",
           f"_Số liệu từ BCTC, cập nhật tới {(fin.get('ratios') or {}).get('quy_moi_nhat',{}).get('ky','quý gần nhất')}._"]
    for i, (k, h, t) in enumerate(secs, 1):
        block = f"### {i}. {h}\n\n{t}"
        if parts.get(k):
            block += f"\n\n{parts[k]}"
        out.append(block)
    if parts.get("TONG_QUAN"):
        out.append(f"### Tổng quan\n\n{parts['TONG_QUAN']}")
    if parts.get("RUI_RO"):
        out.append(f"### Rủi ro cần theo dõi\n\n{parts['RUI_RO']}")
    return "\n\n".join(out)


def _want_full_financials(query: str) -> bool:
    """User CÓ muốn BẢNG TÀI CHÍNH ĐẦY ĐỦ (IS/BS/CF + ratio theo năm & quý) không.
    SO KHỚP KHÔNG DẤU (chống lỗi gõ thiếu dấu, vd 'phân tích sâu'→'phan tich sau')."""
    ql = _strip_dia(query or "")   # bỏ dấu: 'phân tích sâu tình hình tài chính' → 'phan tich sau tinh hinh tai chinh'
    if any(k in ql for k in ("chi tiet", "day du", "3 nam", "5 nam", "nhieu nam", "qua cac nam",
                             "giai doan", "lich su", "theo nam", "tung nam")):
        return True
    if any(k in ql for k in ("chi so tai chinh", "bao cao tai chinh", "bctc", "is bs cf", "bang tai chinh",
                             "can doi ke toan", "luu chuyen tien", "ket qua kinh doanh", "suc khoe tai chinh",
                             "tinh hinh tai chinh", "boc tach tai chinh", "phan tich tai chinh")):
        return True
    # 'phân tích sâu/kỹ/chi tiết' (không dấu: phan tich sau/ky/chi tiet) + (tài chính/chỉ số/dòng tiền…)
    if any(d in ql for d in ("phan tich sau", "phan tich ky", "phan tich chi tiet", "dao sau")) and \
       any(f in ql for f in ("tai chinh", "chi so", "dong tien", "loi nhuan", "doanh thu", "bien")):
        return True
    return False


def _synthesis_prompt(query: str, bundle: dict, lessons: list = None) -> str:
    """Gộp dữ liệu đã thu thập thành 1 user-prompt cho model TỔNG HỢP (không gọi tool)."""
    data_json = json.dumps(bundle["data"], ensure_ascii=False, default=str)
    peers = ", ".join(bundle["peers"]) or "(không có)"
    lesson_block = ""
    if lessons:
        lesson_block = (
            "\n⚠️ BÀI HỌC TỪ KẾT QUẢ THỰC TẾ LẦN TRƯỚC (rút từ nhận định đã được chấm đúng/sai sau N "
            "ngày — CÂN NHẮC để không lặp sai lầm; đây là gợi ý, vẫn ưu tiên DỮ LIỆU hiện tại):\n"
            + "\n".join(f"  • {l}" for l in lessons) + "\n")
    return (
        f"CÂU HỎI: {query}\n\n"
        f"Mã chính: {bundle['main']} · Đối thủ so sánh: {peers}\n"
        f"{lesson_block}\n"
        "DỮ LIỆU ĐÃ THU THẬP SẴN (KHÔNG cần gọi thêm tool — chỉ dùng dữ liệu này; nếu một chỉ số "
        "không có trong đây thì ghi '(chưa có số)', TUYỆT ĐỐI KHÔNG bịa):\n"
        f"```json\n{data_json}\n```\n\n"
        "YÊU CẦU TRÌNH BÀY:\n"
        "⭐ TRƯỚC TIÊN trả lời ĐÚNG TRỌNG TÂM câu hỏi của user. Nếu user hỏi về DỰ ÁN/KẾ HOẠCH/TIỀM NĂNG/"
        "TƯƠNG LAI/ĐỘNG LỰC ('có những dự án gì', 'kế hoạch ra sao'…) → LIỆT KÊ các dự án/kế hoạch/động lực CỤ THỂ "
        "lấy từ `outlook_*`/`news_*`/`ev_*`/`fwd_*` (mỗi cái kèm SỐ nếu có + **[nguồn · NGÀY](link)** — ưu tiên tin "
        "MỚI NHẤT, KHÔNG dùng tin >1 năm). Đây là phần CHÍNH, không sa đà vào bảng tài chính nếu user không hỏi.\n"
        "SAU ĐÓ bổ sung (NẾU liên quan/hữu ích): vài chỉ số tài chính chốt + rủi ro CÓ SỐ.\n\n"
        "📅 MỐC THỜI GIAN & QUÝ MỚI NHẤT (BẮT BUỘC khi nêu số tài chính):\n"
        "• LUÔN ghi RÕ mốc trên tiêu đề/bảng — lấy kỳ từ `ratios.ky_chi_so` (vd 'TTM tới 2026-Q1') và "
        "`ratios.quy_moi_nhat.ky` (vd 'Quý 2026-Q1'). Cột/bảng 'TTM' BẮT BUỘC kèm mốc, KHÔNG để trống.\n"
        + (("• User MUỐN PHÂN TÍCH TÀI CHÍNH ĐẦY ĐỦ. ⛔ HỆ THỐNG ĐÃ CHÈN SẴN 4 BẢNG SỐ CHUẨN ở ĐẦU (IS theo năm + "
            "cột QUÝ MỚI NHẤT / BS / CF / ratio+định giá). TUYỆT ĐỐI KHÔNG lập lại bảng số / KHÔNG gõ lại con số "
            "(tránh sai lệch). Bạn VIẾT PHÂN TÍCH theo ĐÚNG CẤU TRÚC sau:\n"
            "  **Phân tích theo NHÓM** — mỗi nhóm 1 mục `### <tên nhóm>` + 1-3 câu nhận xét (BÁM số trong bảng, có "
            "đối chiếu QUÝ MỚI NHẤT vs cùng kỳ): (1) Khả năng sinh lời (biên/ROE/ROIC, xu hướng nhiều năm + quý mới); "
            "(2) Thanh khoản & Dòng tiền (CFO, CFO/LNST chất lượng LN, tiền mặt ròng); (3) Đòn bẩy & An toàn (nợ/VCSH, "
            "nợ ròng/EBITDA, trả lãi); (4) Hiệu quả vận hành (CCC/DIO/DSO/DPO, vòng quay); (5) Định giá (P/E·PEG·P/B·"
            "EV/EBITDA rẻ/đắt vs lịch sử `dinh_gia_vs_lich_su` + nội tại `dinh_gia_noi_tai`). Mỗi thay đổi quan trọng "
            "phải GIẢI THÍCH LÝ DO (biên đổi mấy điểm %, driver từ news/commodity/báo cáo).\n"
            "  **### Tổng quan** (BẮT BUỘC, cuối) — BẢNG chấm điểm: `| Nhóm chỉ tiêu | Đánh giá | Xu hướng |`, mỗi "
            "nhóm (Sinh lời / Thanh khoản / Đòn bẩy / Hiệu quả vận hành / Dòng tiền / Định giá) cho **số sao ★** (1-5) "
            "+ nhãn ngắn (Xuất sắc/Tốt/Trung bình…) + mũi tên xu hướng (↑/→/↓). Sao dựa trên SỐ trong bảng, nhất quán.\n"
            "  **Rủi ro cần theo dõi** — 2-3 gạch đầu dòng CÓ SỐ (vd dồn tích phải thu +x% YoY, nợ ròng, thuế suất…). "
            "KHÔNG khuyến nghị mua/bán.\n")
           if _want_full_financials(query) else
           ("• MẶC ĐỊNH (user hỏi tổng quan, KHÔNG yêu cầu chi tiết tài chính/nhiều năm): CHỈ tập trung QUÝ MỚI "
            "NHẤT (`ratios.quy_moi_nhat`) + **SO CÙNG KỲ (YoY)** (`*_yoy_pct`, `bien_gop_thay_doi_diem_pct`; KHÔNG "
            "dùng QoQ làm chính, KHÔNG đổ bảng 3-5 năm) + định giá hiện tại (P/E/PEG/`dinh_gia_vs_lich_su`).\n"
            "• ⭐ GIẢI THÍCH LÝ DO tăng/giảm YoY: biên gộp đổi mấy điểm %, driver (sản lượng/giá/nguyên liệu từ "
            "`commodity`/`news_*`/`outlook_*`). KHÔNG nêu số mà không nói TẠI SAO.\n")) +
        "Trích nguồn theo mục 3A (chỉ link web http bấm được; số nội bộ ghi '(cập nhật ...)' không link; KHÔNG in "
        "[Knowledge Graph]/'Trọng số'/lời gọi tool). Kết bằng disclaimer 1 lần."
    )


def run(query: str, gemini_client, model: str, types_mod, on_progress=None) -> tuple[str, list]:
    """Chạy orchestrator: gather song song → 1 vòng model synthesis (no-tool). Trả (answer, tool_calls).
    on_progress(call): callback cập nhật timeline LIVE từng bước gather.
    Bọc BaseException top-level: vnai có thể sys.exit() khi rate-limit/quota → KHÔNG được để chết app."""
    try:
        text, calls = _run(query, gemini_client, model, types_mod, on_progress)
        import core.verifier as _vf                     # hậu kiểm: chặn lời khuyến nghị hệ thống + disclaimer
        text, _ = _vf.enforce(text)
        return text, calls
    except BaseException as e:
        return (f"⚠️ Chưa hoàn tất phân tích sâu (lỗi nguồn dữ liệu: {str(e)[:120]}). "
                f"Vui lòng thử lại sau ít giây — có thể đang giới hạn truy cập dữ liệu tạm thời.", [])


def _run(query: str, gemini_client, model: str, types_mod, on_progress=None) -> tuple[str, list]:
    # ── NHÁNH VĨ MÔ (không mã, không ngành) → gather_macro (ÉP search đúng nguồn → luôn có số+nguồn) ──
    if is_macro_query(query):
        bundle, tool_calls = gather_macro(query, on_progress=on_progress)
        prompt = _synthesis_prompt_macro(query, bundle) + _wealbee_context(query)
        resp = gemini_client.models.generate_content(
            model=model, contents=prompt,
            config=types_mod.GenerateContentConfig(
                system_instruction=_synth_system(scope="macro"), temperature=0.2, max_output_tokens=12288),
        )
        try:
            text = resp.text or ""
        except Exception:
            text = ""
            for c in (getattr(resp, "candidates", None) or []):
                for p in (getattr(getattr(c, "content", None), "parts", None) or []):
                    text += getattr(p, "text", "") or ""
        return ensure_disclaimer(sanitize_citations(text)), tool_calls

    # ── NHÁNH NGÀNH (không nêu mã) → gather_sector (ép định giá mã đầu ngành) ──
    if not extract_tickers(query) and is_sector_query(query):
        sector_code = detect_sector(query)
        bundle, tool_calls = gather_sector(sector_code, on_progress=on_progress)
        lessons = []
        try:
            import core.agent_learning as _al
            for mk in bundle["peers"]:
                lessons += _al.retrieve_lessons(mk, limit=2)
        except Exception:
            lessons = []
        prompt = _synthesis_prompt_sector(query, bundle, lessons) + _wealbee_context(query)
        resp = gemini_client.models.generate_content(
            model=model, contents=prompt,
            config=types_mod.GenerateContentConfig(
                system_instruction=_synth_system(), temperature=0.2, max_output_tokens=16384),
        )
        try:
            text = resp.text or ""
        except Exception:
            text = ""
            for c in (getattr(resp, "candidates", None) or []):
                for p in (getattr(getattr(c, "content", None), "parts", None) or []):
                    text += getattr(p, "text", "") or ""
        return ensure_disclaimer(sanitize_citations(text)), tool_calls

    tickers = extract_tickers(query)
    main = tickers[0]
    peers = select_peers(main, tickers, wants_comparison(query))
    # cửa sổ tin theo mốc hỏi
    ql = query.lower()
    win = 1 if ("hôm nay" in ql or "mới nhất" in ql) else 7 if "tuần" in ql else 30 if "tháng" in ql else 0
    bundle, tool_calls = gather(main, peers, want_news_window=win, on_progress=on_progress, query=query)
    # HỌC LẠI: tiêm bài học từ kết quả thực tế lần trước (cùng mã + peer) vào synthesis
    lessons = []
    try:
        import core.agent_learning as _al
        lessons = _al.retrieve_lessons(main)
        for pk in peers:
            lessons += _al.retrieve_lessons(pk, limit=2)
    except Exception:
        lessons = []
    # PHÂN TÍCH TÀI CHÍNH SÂU 1 MÃ → báo cáo CO-LOCATED (mỗi nhóm: BẢNG số chuẩn + NHẬN XÉT ngay dưới + Tổng quan sao)
    if _want_full_financials(query) and not peers:
        _full = run_full_financials(query, main, bundle, gemini_client, model, types_mod)
        if _full:
            return ensure_disclaimer(sanitize_citations(_full)), tool_calls

    prompt = _synthesis_prompt(query, bundle, lessons) + _wealbee_context(query)
    resp = gemini_client.models.generate_content(
        model=model,
        contents=prompt,
        config=types_mod.GenerateContentConfig(
            system_instruction=_synth_system(loai_hinh=(bundle["data"].get(f"fin_{main}") or {}).get("loai_hinh")),
            temperature=0.2,
            max_output_tokens=16384,
        ),
    )
    try:
        text = resp.text or ""
    except Exception:
        # fallback: nhặt text từ candidates nếu .text raise (finish_reason lạ)
        text = ""
        for c in (getattr(resp, "candidates", None) or []):
            for p in (getattr(getattr(c, "content", None), "parts", None) or []):
                text += getattr(p, "text", "") or ""
    # FULL FINANCIALS đa-mã → vẫn chèn bảng deterministic mã chính ở đầu (1 mã đã xử lý co-located ở trên).
    if _want_full_financials(query) and peers:
        _tbl = _render_financial_tables(bundle["data"].get(f"fin_{main}") or {})
        if _tbl:
            text = (f"## Bảng dữ liệu tài chính {main} (số chuẩn từ BCTC)\n\n{_tbl}\n\n---\n\n" + text)
    return ensure_disclaimer(sanitize_citations(text)), tool_calls

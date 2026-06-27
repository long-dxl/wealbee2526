"""markets/vn/config.py — HỒ SƠ THỊ TRƯỜNG VIỆT NAM (mọi hằng số đặc-VN gom 1 chỗ).

Đây là "dữ liệu nội địa" của VN. Sang nước khác: copy file này, thay nguồn báo / taxonomy
ngành / tham số định giá / ngôn ngữ. Lõi (Brain + orchestrator) không cần sửa.

File này là LEAF (chỉ phụ thuộc stdlib + markets.base) để các module cũ re-export từ đây mà
không tạo vòng import. Giá trị giữ NGUYÊN VẸN với code cũ → no behavior change.
"""
from __future__ import annotations

from markets.base import MarketConfig

# ── Rổ ƯU TIÊN (tiering): sync tin/BCTC THƯỜNG XUYÊN. KHÔNG phải giới hạn vũ trụ — phân tích
#    on-demand chạy cho MỌI mã (xem _resolve_sector_for_ticker). Universe đầy đủ = DB listing. ──
PRIORITY_TICKERS = ("HPG", "VHM", "VIC", "VCB", "TCB", "BID", "MSN", "VNM", "MWG", "FPT")
TOP_10_TICKERS = set(PRIORITY_TICKERS)   # giữ tên cũ (facade) cho code đang dùng tập hợp

# ── Nguồn primary nội địa (báo tài chính VN uy tín) ──
PRIMARY_SOURCES = {
    "vneconomy.vn", "tinnhanhchungkhoan.vn", "baodautu.vn", "thoibaotaichinhvietnam.vn",
    "thoibaonganhang.vn", "thesaigontimes.vn", "vietnamfinance.vn", "markettimes.vn",
    "nangluongvietnam.vn", "chinhphu.vn", "mekongasean.vn", "diendandoanhnghiep.vn",
    "vnexpress.net", "kinhtechungkhoan.vn", "vietstock.vn", "nguoiquansat.vn", "cafef.vn",
    "fili.vn", "ndh.vn", "gso.gov.vn", "sbv.gov.vn", "mof.gov.vn",
}
# Nguồn quốc tế uy tín — re-rank cho web_search(intl=True) (vĩ mô/hàng hóa toàn cầu).
INTL_SOURCES = {
    "investing.com", "tradingview.com", "tradingeconomics.com", "cnbc.com", "reuters.com",
    "bloomberg.com", "marketwatch.com", "ft.com", "wsj.com", "federalreserve.gov",
    "fred.stlouisfed.org", "lme.com", "spglobal.com", "imf.org", "worldbank.org",
}
# Gợi ý nguồn TỐT NHẤT theo chủ đề (cho prompt định hướng query site-targeted).
SECTOR_SOURCE_HINT = {
    "ngân hàng": "thoibaonganhang.vn, tinnhanhchungkhoan.vn, vietstock.vn",
    "thép": "tinnhanhchungkhoan.vn, vietstock.vn, baodautu.vn, cafef.vn",
    "năng lượng": "nangluongvietnam.vn (điện/dầu khí: POW/GAS/PVT)",
    "bất động sản": "baodautu.vn, vneconomy.vn, cafef.vn",
    "vĩ mô": "vneconomy.vn, gso.gov.vn (GSO), chinhphu.vn, thoibaotaichinhvietnam.vn",
    "chính sách": "chinhphu.vn, thoibaotaichinhvietnam.vn (thuế/ngân sách)",
    "xuất nhập khẩu": "mekongasean.vn, thesaigontimes.vn",
}
# ĐIỂM MẠNH TỪNG BÁO → site: filter theo CHỦ ĐỀ. (keyword trong query) → domain mạnh nhất.
TOPIC_SOURCES = [
    (("thuế", "hải quan", "trái phiếu", "ngân sách", "kho bạc"), "thoibaotaichinhvietnam.vn"),
    (("lãi suất", "tỷ giá", "tín dụng", "tiền tệ", "ngoại hối", "điều hành"), "thoibaonganhang.vn"),
    (("điện", "dầu khí", "năng lượng", "nhiệt điện", "lng", "điện gió", "than", "tái tạo"), "nangluongvietnam.vn"),
    (("fdi", "đầu tư công", "hạ tầng", "giải ngân", "vốn ngoại"), "baodautu.vn"),
    (("m&a", "thương vụ", "sáp nhập", "quản trị doanh nghiệp", "tài chính doanh nghiệp"), "vietnamfinance.vn"),
    (("logistics", "xuất nhập khẩu", "xuất khẩu", "nhập khẩu", "cảng", "container", "vận tải biển"), "thesaigontimes.vn"),
    (("giao thương", "asean", "thương mại khu vực"), "mekongasean.vn"),
    (("chính sách", "nghị định", "thông tư", "luật", "quy định", "dự thảo"), "chinhphu.vn"),
    (("gdp", "lạm phát", "cpi", "kinh tế số", "vĩ mô", "dự báo kinh tế"), "vneconomy.vn"),
    (("đại hội", "đhcđ", "cổ tức", "phát hành", "khuyến nghị", "giá mục tiêu", "niêm yết"), "tinnhanhchungkhoan.vn"),
    (("pci", "hiệp hội", "cộng đồng doanh nghiệp", "kiến nghị"), "diendandoanhnghiep.vn"),
    (("tiêu dùng", "bán lẻ"), "markettimes.vn"),
]
# MAP CHỈ SỐ VĨ MÔ → (phạm vi, từ khóa search, nguồn primary).
MACRO_SOURCE_MAP = {
    # ── Trong nước (GSO/SBV/MOF + báo TC) ──
    "gdp":        ("domestic", "GDP Việt Nam tăng trưởng quý mới nhất", "gso.gov.vn (Tổng cục Thống kê)"),
    "đầu tư công": ("domestic", "giải ngân đầu tư công kế hoạch lũy kế", "mof.gov.vn, baodautu.vn, chinhphu.vn"),
    "cpi":        ("domestic", "CPI lạm phát Việt Nam mới nhất", "gso.gov.vn"),
    "lạm phát":   ("domestic", "lạm phát lõi CPI Việt Nam", "gso.gov.vn"),
    "tín dụng":   ("domestic", "tăng trưởng tín dụng toàn hệ thống mới nhất", "sbv.gov.vn, tinnhanhchungkhoan.vn"),
    "lãi suất":   ("domestic", "lãi suất điều hành tái cấp vốn tái chiết khấu NHNN mới nhất", "sbv.gov.vn, thoibaonganhang.vn"),
    "tỷ giá":     ("domestic", "tỷ giá USD/VND trung tâm dự trữ ngoại hối", "sbv.gov.vn, vietcombank (tỷ giá)"),
    "iip":        ("domestic", "chỉ số sản xuất công nghiệp IIP Việt Nam", "gso.gov.vn"),
    "pmi":        ("domestic", "PMI sản xuất Việt Nam S&P Global", "spglobal.com, vneconomy.vn"),
    # ── Quốc tế (intl=True) ──
    "fed":        ("intl", "Fed funds rate decision latest", "federalreserve.gov, investing.com, cnbc.com"),
    "fed funds":  ("intl", "Fed funds rate latest meeting", "federalreserve.gov, cnbc.com"),
    "dxy":        ("intl", "DXY US dollar index level today", "tradingview.com, investing.com"),
    "us10y":      ("intl", "US 10 year treasury yield today", "cnbc.com, tradingview.com"),
    "lợi suất":   ("intl", "US 10 year treasury yield", "cnbc.com, tradingeconomics.com"),
    "dầu brent":  ("intl", "Brent crude oil price today", "tradingeconomics.com, investing.com"),
    "vàng":       ("intl", "gold price today XAU", "tradingeconomics.com, investing.com"),
    "thép hrc":   ("intl", "HRC steel price today", "tradingeconomics.com, lme.com"),
}

# ── Taxonomy NGÀNH (sector-centric KG) ──
SECTOR_IDS = {
    "SECTOR_BANKING", "SECTOR_REALESTATE", "SECTOR_SECURITIES", "SECTOR_STEEL",
    "SECTOR_CONSUMER", "SECTOR_TECH", "SECTOR_OIL_GAS", "SECTOR_UTILITIES",
    "SECTOR_INDUSTRIAL", "SECTOR_SEAFOOD", "SECTOR_CONSTRUCTION",
    "SECTOR_AVIATION", "SECTOR_INSURANCE", "SECTOR_LOGISTICS",
    "SECTOR_FERTILIZER", "SECTOR_PLASTIC", "SECTOR_TEXTILE", "SECTOR_TIRE", "SECTOR_LIVESTOCK",
}
SECTOR_ALIASES = {
    "ngân hàng": "SECTOR_BANKING", "bank": "SECTOR_BANKING",
    "bất động sản": "SECTOR_REALESTATE", "bđs": "SECTOR_REALESTATE", "real estate": "SECTOR_REALESTATE",
    "chứng khoán": "SECTOR_SECURITIES", "securities": "SECTOR_SECURITIES",
    "thép": "SECTOR_STEEL", "vật liệu": "SECTOR_STEEL", "steel": "SECTOR_STEEL",
    "tiêu dùng": "SECTOR_CONSUMER", "bán lẻ": "SECTOR_CONSUMER", "retail": "SECTOR_CONSUMER",
    "công nghệ": "SECTOR_TECH", "tech": "SECTOR_TECH",
    "dầu khí": "SECTOR_OIL_GAS", "oil": "SECTOR_OIL_GAS",
    "điện": "SECTOR_UTILITIES", "tiện ích": "SECTOR_UTILITIES", "utilities": "SECTOR_UTILITIES",
    "kcn": "SECTOR_INDUSTRIAL", "khu công nghiệp": "SECTOR_INDUSTRIAL", "xuất khẩu": "SECTOR_INDUSTRIAL",
    "thủy sản": "SECTOR_SEAFOOD", "nông nghiệp": "SECTOR_SEAFOOD",
    "xây dựng": "SECTOR_CONSTRUCTION", "hạ tầng": "SECTOR_CONSTRUCTION",
    "hàng không": "SECTOR_AVIATION", "aviation": "SECTOR_AVIATION",
    "bảo hiểm": "SECTOR_INSURANCE", "insurance": "SECTOR_INSURANCE",
    "vận tải biển": "SECTOR_LOGISTICS", "vận tải": "SECTOR_LOGISTICS",
    "logistics": "SECTOR_LOGISTICS", "cảng": "SECTOR_LOGISTICS",
    "cảng biển": "SECTOR_LOGISTICS", "shipping": "SECTOR_LOGISTICS",
    "phân bón": "SECTOR_FERTILIZER", "phân đạm": "SECTOR_FERTILIZER", "urea": "SECTOR_FERTILIZER",
    "hóa chất": "SECTOR_FERTILIZER", "fertilizer": "SECTOR_FERTILIZER",
    "nhựa": "SECTOR_PLASTIC", "plastic": "SECTOR_PLASTIC", "ống nhựa": "SECTOR_PLASTIC",
    "dệt may": "SECTOR_TEXTILE", "may mặc": "SECTOR_TEXTILE", "textile": "SECTOR_TEXTILE",
    "săm lốp": "SECTOR_TIRE", "lốp": "SECTOR_TIRE", "tire": "SECTOR_TIRE",
    "chăn nuôi": "SECTOR_LIVESTOCK", "nông nghiệp": "SECTOR_LIVESTOCK",
    "heo": "SECTOR_LIVESTOCK", "lợn": "SECTOR_LIVESTOCK", "livestock": "SECTOR_LIVESTOCK",
}
# ── Taxonomy VĨ MÔ ──
MACRO_IDS = {
    "LAI_SUAT_VN", "TANG_TRUONG_TIN_DUNG", "CPI_VN", "GDP_VN", "TY_GIA_USD_VND",
    "DAU_TU_CONG", "CHINH_SACH_FTSE", "LUAT_DAT_DAI", "QH_DIEN_8",
    "LAI_SUAT_FED", "DXY_USD_INDEX", "GIA_DAU_BRENT", "GIA_THEP_HRC",
    "GIA_NHIET_LIEU", "GIA_QUANG_SAT", "THUE_QUAN_MY_VN", "KINH_TE_TQ", "KHAU_VI_RUI_RO",
    "GIA_CUOC_VAN_TAI",
}
MACRO_ALIASES = {
    "lãi suất fed": "LAI_SUAT_FED", "fed": "LAI_SUAT_FED",
    "lãi suất điều hành": "LAI_SUAT_VN", "lãi suất nhnn": "LAI_SUAT_VN",
    "lãi suất": "LAI_SUAT_VN", "nhnn": "LAI_SUAT_VN",
    "tín dụng": "TANG_TRUONG_TIN_DUNG", "tăng trưởng tín dụng": "TANG_TRUONG_TIN_DUNG",
    "cpi": "CPI_VN", "lạm phát": "CPI_VN",
    "gdp": "GDP_VN", "tăng trưởng": "GDP_VN",
    "tỷ giá": "TY_GIA_USD_VND", "usd/vnd": "TY_GIA_USD_VND", "usd": "TY_GIA_USD_VND",
    "đầu tư công": "DAU_TU_CONG",
    "ftse": "CHINH_SACH_FTSE", "nâng hạng": "CHINH_SACH_FTSE",
    "đất đai": "LUAT_DAT_DAI", "pháp lý": "LUAT_DAT_DAI",
    "điện 8": "QH_DIEN_8", "quy hoạch điện": "QH_DIEN_8",
    "dxy": "DXY_USD_INDEX", "sức mạnh usd": "DXY_USD_INDEX",
    "dầu": "GIA_DAU_BRENT", "brent": "GIA_DAU_BRENT",
    "thép hrc": "GIA_THEP_HRC", "hrc": "GIA_THEP_HRC", "giá thép": "GIA_THEP_HRC",
    "than": "GIA_NHIET_LIEU", "than cốc": "GIA_NHIET_LIEU",
    "quặng": "GIA_QUANG_SAT", "quặng sắt": "GIA_QUANG_SAT",
    "thuế quan": "THUE_QUAN_MY_VN", "thuế mỹ": "THUE_QUAN_MY_VN", "tariff": "THUE_QUAN_MY_VN",
    "trung quốc": "KINH_TE_TQ", "china": "KINH_TE_TQ",
    "khẩu vị rủi ro": "KHAU_VI_RUI_RO", "risk": "KHAU_VI_RUI_RO",
    "giá cước": "GIA_CUOC_VAN_TAI", "cước vận tải": "GIA_CUOC_VAN_TAI",
    "freight": "GIA_CUOC_VAN_TAI", "cước biển": "GIA_CUOC_VAN_TAI",
}
RATE_SENSITIVE_SECTORS = {"SECTOR_BANKING", "SECTOR_SECURITIES", "SECTOR_REALESTATE"}

# ── Map NGÀNH ICB (vnstock, tiếng Anh) → SECTOR_ID: suy ngành ON-DEMAND cho MỌI mã (mở cả thị trường,
#    không giới hạn rổ seed). Mã chưa map ngành → fallback web_search cho ngành. ──
ICB_SECTOR_MAP = {
    "Banks": "SECTOR_BANKING",
    "Financial Services": "SECTOR_SECURITIES",
    "Insurance": "SECTOR_INSURANCE",
    "Real Estate": "SECTOR_REALESTATE",
    "Basic Resources": "SECTOR_STEEL",
    "Construction & Materials": "SECTOR_CONSTRUCTION",
    "Food & Beverage": "SECTOR_CONSUMER",
    "Personal & Household Goods": "SECTOR_CONSUMER",
    "Retail": "SECTOR_CONSUMER",
    "Technology": "SECTOR_TECH",
    "Telecommunications": "SECTOR_TECH",
    "Oil & Gas": "SECTOR_OIL_GAS",
    "Utilities": "SECTOR_UTILITIES",
    "Industrial Goods & Services": "SECTOR_INDUSTRIAL",
    "Chemicals": "SECTOR_FERTILIZER",
    "Travel & Leisure": "SECTOR_AVIATION",
    "Automobiles & Parts": "SECTOR_TIRE",
}

# ── ROUTING NGÀNH (câu hỏi ngành không nêu mã) → SECTOR_ID + nhãn search sạch ──
# Tách riêng khỏi SECTOR_ALIASES (cái kia để _resolve): bản này gọn + có nhãn ghép đôi để search.
SECTOR_ROUTING_ALIASES = {
    "thép": "SECTOR_STEEL", "ngân hàng": "SECTOR_BANKING", "nhà băng": "SECTOR_BANKING",
    "chứng khoán": "SECTOR_SECURITIES", "bất động sản": "SECTOR_REALESTATE", "bđs": "SECTOR_REALESTATE",
    "xây dựng": "SECTOR_CONSTRUCTION", "dầu khí": "SECTOR_OIL_GAS", "phân bón": "SECTOR_FERTILIZER",
    "bán lẻ": "SECTOR_CONSUMER", "tiêu dùng": "SECTOR_CONSUMER", "logistics": "SECTOR_LOGISTICS",
    "cảng": "SECTOR_LOGISTICS", "hàng không": "SECTOR_AVIATION", "dệt may": "SECTOR_TEXTILE",
    "chăn nuôi": "SECTOR_LIVESTOCK", "nhựa": "SECTOR_PLASTIC", "điện": "SECTOR_UTILITIES",
    "tiện ích": "SECTOR_UTILITIES", "săm lốp": "SECTOR_TIRE", "công nghệ": "SECTOR_TECH",
    "bảo hiểm": "SECTOR_INSURANCE", "khu công nghiệp": "SECTOR_INDUSTRIAL",
}
SECTOR_LABELS = {
    "SECTOR_STEEL": "thép", "SECTOR_BANKING": "ngân hàng", "SECTOR_SECURITIES": "chứng khoán",
    "SECTOR_REALESTATE": "bất động sản", "SECTOR_CONSTRUCTION": "xây dựng", "SECTOR_OIL_GAS": "dầu khí",
    "SECTOR_FERTILIZER": "phân bón", "SECTOR_CONSUMER": "bán lẻ", "SECTOR_LOGISTICS": "cảng biển",
    "SECTOR_AVIATION": "hàng không", "SECTOR_TEXTILE": "dệt may", "SECTOR_LIVESTOCK": "chăn nuôi",
    "SECTOR_PLASTIC": "nhựa", "SECTOR_UTILITIES": "điện", "SECTOR_TIRE": "săm lốp",
    "SECTOR_TECH": "công nghệ", "SECTOR_INSURANCE": "bảo hiểm", "SECTOR_INDUSTRIAL": "khu công nghiệp",
}

# ── Locale routing keyword (đặc NGÔN NGỮ — dịch khi sang nước khác) ──
DEEP_INTENT = ("phân tích", "so sánh", "đánh giá", "định giá", "luận điểm", "tiềm năng", "triển vọng")
OVERVIEW_MARKERS = ("thế nào", "ra sao", "có nên", "đáng đầu tư", "đáng mua",
                    "nhìn nhận", "nhận định về", "review")
FIN_INTENT = ("báo cáo tài chính", "bctc", "kết quả kinh doanh", "kqkd",
              "sức khỏe tài chính", "tình hình tài chính", "dòng tiền")
SIMPLE_MARKERS = ("giá", "thị giá", "bao nhiêu", "tin tức", "tin mới", "tin gì", "vn-index",
                  "vnindex", "thị trường", "top 10", "khớp lệnh", "vốn hóa")
COMPARE_MARKERS = ("so sánh", "đối thủ", "cùng ngành", "peer", "đối chiếu", " vs ", "với các",
                   "các mã khác", "cạnh tranh")
COMPANY_NAME_PREFIXES = ("tap doan ", "cong ty co phan ", "cong ty cp ", "ctcp ", "tong cong ty ",
                         "ngan hang tmcp ", "ngan hang ", "ngan hang thuong mai co phan ")


# ============================================================
# Hồ sơ thị trường VN (đối tượng cấu hình duy nhất)
# ============================================================
VN_CONFIG = MarketConfig(
    code="vn",
    name="Việt Nam",
    language="vi",
    timezone_offset_hours=7,
    currency="VND",
    currency_unit_label="tỷ VND (trừ EPS=VND/cp, % và lần)",
    thousands_sep=".",
    search_hl="vi",
    search_gl="vn",
    search_google_domain="google.com.vn",
    primary_sources=PRIMARY_SOURCES,
    intl_sources=INTL_SOURCES,
    sector_source_hint=SECTOR_SOURCE_HINT,
    topic_sources=TOPIC_SOURCES,
    macro_source_map=MACRO_SOURCE_MAP,
    sector_ids=SECTOR_IDS,
    sector_aliases=SECTOR_ALIASES,
    sector_routing_aliases=SECTOR_ROUTING_ALIASES,
    sector_labels=SECTOR_LABELS,
    icb_sector_map=ICB_SECTOR_MAP,
    macro_ids=MACRO_IDS,
    macro_aliases=MACRO_ALIASES,
    rate_sensitive_sectors=RATE_SENSITIVE_SECTORS,
    watchlist=TOP_10_TICKERS,
    priority_tickers=PRIORITY_TICKERS,
    risk_free_rate=0.045,        # VN 10Y govt bond ~4.5% (06/2026)
    equity_risk_premium=0.075,   # ERP ~7.5%
    blume_slope=0.67,
    blume_intercept=0.33,
    graham_const=22.5,
    deep_intent=DEEP_INTENT,
    overview_markers=OVERVIEW_MARKERS,
    fin_intent=FIN_INTENT,
    simple_markers=SIMPLE_MARKERS,
    compare_markers=COMPARE_MARKERS,
    company_name_prefixes=COMPANY_NAME_PREFIXES,
)

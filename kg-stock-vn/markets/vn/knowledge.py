"""markets/vn/knowledge.py — TRI THỨC CHUYÊN GIA thị trường VN (đồ thị nhân-quả).

ĐÂY là nơi DUY NHẤT cập nhật tri thức khi chuyên gia cố vấn có insight mới: sửa literal bên
dưới → git commit + PR → eval gác cổng → merge. KHÔNG đẩy vào DB nhiều bảng.

Phạm vi: NGÀNH · VĨ MÔ · CHÍNH SÁCH · chuỗi giá HÀNG HÓA · quan hệ NHÂN-QUẢ (dấu/trọng số/độ
trễ/cơ chế) · chuỗi LAN TRUYỀN. Mở rộng dần: SỰ KIỆN→tác động, CỔ ĐÔNG LỚN→mã.

NGUỒN GỐC: export 1 lần từ Supabase KG (trạng thái mới nhất — đã gồm các tinh chỉnh chuyên gia
thêm trực tiếp vào DB mà seed_sector_graph.py cũ KHÔNG có). Từ nay code là CANONICAL.
TẦNG DỮ LIỆU (mã/Beta/giá trị vĩ mô hiện tại/tin) KHÔNG ở đây — vẫn lấy từ DB.
"""
from __future__ import annotations

from markets.graph import MarketGraph

# ============================================================
# 1) NODE VĨ MÔ + CHÍNH SÁCH + GIÁ HÀNG HÓA  (eid: (name, scope, props tham chiếu))
# ============================================================

MACRO_NODES = {
    'CHINH_SACH_FTSE': ('Nâng hạng FTSE (9/2026)', 'domestic', {'effective': '2026-09-21', 'inflow_usd_bn': '1.5-2'}),
    'CPI_VN': ('Lạm phát CPI Việt Nam', 'domestic', {'unit': 'percent YoY', 'target_pct': 4.5, 'value_2026_pct': 3.51}),
    'DAU_TU_CONG': ('Đầu tư công', 'domestic', {'role': 'động lực tăng trưởng'}),
    'DXY_USD_INDEX': ('Chỉ số sức mạnh USD (DXY)', 'global', {}),
    'GDP_VN': ('Tăng trưởng GDP Việt Nam', 'domestic', {'unit': 'percent growth YoY', 'target_pct': 10, 'q1_2026_pct': 7.83}),
    'GIA_BONG': ('Giá bông', 'commodity', {'unit': 'US cent/lb', 'market': 'international', 'commodity_key': 'bông', 'primary_source': 'ICE Cotton (yfinance CT=F)'}),
    'GIA_CAO_SU': ('Giá cao su tự nhiên', 'commodity', {'unit': 'USD/kg', 'market': 'both', 'vn_key': 'cao su', 'commodity_key': 'cao su', 'primary_source': 'SICOM/TOCOM/Trading Economics'}),
    'GIA_CUOC_VAN_TAI': ('Giá cước vận tải biển', 'commodity', {'note': 'Drewry/SCFI, biến động theo cầu & gián đoạn tuyến', 'market': 'international', 'commodity_key': 'cước vận tải', 'primary_source': 'Drewry WCI / SCFI'}),
    'GIA_DAU_BRENT': ('Giá dầu Brent', 'commodity', {'unit': 'USD/thùng', 'market': 'international', 'commodity_key': 'dầu brent', 'primary_source': 'ICE (yfinance BZ=F)'}),
    'GIA_DIEN': ('Giá điện EVN', 'commodity', {'unit': 'đồng/kWh', 'market': 'vietnam', 'vn_key': 'điện', 'commodity_key': 'điện', 'primary_source': 'EVN/ERAV'}),
    'GIA_DIESEL_JET': ('Giá nhiên liệu bay (proxy)', 'commodity', {'unit': 'USD/gallon', 'market': 'international', 'commodity_key': 'nhiên liệu bay', 'primary_source': 'NYMEX Heating Oil (HO=F)'}),
    'GIA_DUONG': ('Giá đường thô', 'commodity', {'unit': 'US cent/lb', 'market': 'both', 'vn_key': 'đường', 'commodity_key': 'đường', 'primary_source': 'ICE Sugar #11 (yfinance SB=F)'}),
    'GIA_HEO_HOI': ('Giá heo hơi', 'commodity', {'unit': 'US cent/lb', 'market': 'vietnam', 'vn_key': 'heo hơi', 'commodity_key': 'heo hơi', 'primary_source': 'CME Lean Hogs (proxy) + giá heo VN'}),
    'GIA_KHI_GAS': ('Giá khí tự nhiên', 'commodity', {'unit': 'USD/MMBtu', 'market': 'international', 'commodity_key': 'khí', 'primary_source': 'NYMEX (yfinance NG=F)'}),
    'GIA_KHO_DAU': ('Giá khô đậu tương (TĂCN)', 'commodity', {'unit': 'USD/tấn ngắn', 'market': 'international', 'commodity_key': 'khô đậu', 'primary_source': 'CBOT (yfinance ZM=F)'}),
    'GIA_NGO': ('Giá ngô', 'commodity', {'unit': 'US cent/giạ', 'market': 'international', 'commodity_key': 'ngô', 'primary_source': 'CBOT (yfinance ZC=F)'}),
    'GIA_NHIET_LIEU': ('Giá than cốc', 'commodity', {'unit': 'USD/tấn', 'market': 'international', 'commodity_key': 'than cốc', 'primary_source': 'Trading Economics (FOB Australia)'}),
    'GIA_QUANG_SAT': ('Giá quặng sắt 62% Fe', 'commodity', {'unit': 'USD/tấn', 'market': 'international', 'commodity_key': 'quặng sắt', 'primary_source': 'Trading Economics (CFR China)'}),
    'GIA_SUA_NGUYEN_LIEU': ('Giá sữa bột nguyên liệu', 'commodity', {'unit': 'USD/tấn', 'market': 'international', 'commodity_key': 'sữa bột', 'primary_source': 'GlobalDairyTrade/Trading Economics'}),
    'GIA_THEP_HRC': ('Giá thép HRC', 'commodity', {'unit': 'USD/tấn ngắn', 'market': 'both', 'vn_key': 'thép xây dựng', 'commodity_key': 'thép hrc', 'primary_source': 'CME (yfinance HRC=F)'}),
    'GIA_THEP_XAY_DUNG': ('Giá thép xây dựng (nội địa)', 'commodity', {'unit': 'đồng/kg', 'market': 'vietnam', 'vn_key': 'thép xây dựng', 'commodity_key': 'thép xây dựng', 'primary_source': 'SteelOnline/VSA (giá thép xây dựng VN)'}),
    'GIA_URE': ('Giá phân urea', 'commodity', {'unit': 'USD/tấn', 'market': 'both', 'vn_key': 'urea', 'commodity_key': 'urea', 'primary_source': 'Trading Economics'}),
    'GIA_XI_MANG': ('Giá xi măng', 'commodity', {'unit': 'đồng/bao', 'market': 'vietnam', 'vn_key': 'xi măng', 'commodity_key': 'xi măng', 'primary_source': 'Báo chuyên ngành VN'}),
    'KHAU_VI_RUI_RO': ('Khẩu vị rủi ro toàn cầu', 'global', {}),
    'KINH_TE_TQ': ('Kinh tế / xuất khẩu Trung Quốc', 'global', {}),
    'LAI_SUAT_FED': ('Lãi suất FED (Mỹ)', None, {'note': 'Federal Funds Rate — manual update. Check federalreserve.gov', 'unit': 'percent', 'impact': 'global'}),
    'LAI_SUAT_VN': ('Lãi suất điều hành NHNN', None, {'note': 'Manual — check sbv.gov.vn for latest', 'unit': 'percent', 'set_by': 'SBV', 'base_rate_pct': 4.5, 'refi_rate_pct': 4.5, 'discount_rate_pct': 3.0}),
    'LUAT_DAT_DAI': ('Pháp lý đất đai / BĐS', 'domestic', {'role': 'tháo gỡ dự án'}),
    'QH_DIEN_8': ('Quy hoạch điện 8', 'domestic', {'role': 'đầu tư nguồn điện'}),
    'TANG_TRUONG_TIN_DUNG': ('Tăng trưởng tín dụng', 'domestic', {'target_2026_pct': 15}),
    'THUE_QUAN_MY_VN': ('Thuế quan Mỹ với VN', 'global', {'from_pct': 46, 'rate_2026_pct': 20}),
    'TY_GIA_USD_VND': ('Tỷ giá USD/VND', None, {'unit': 'VND per USD'}),
}

# ============================================================
# 2) NODE NGÀNH
# ============================================================
SECTOR_NODES = {
    'SECTOR_AVIATION': 'Ngành Hàng không',
    'SECTOR_BANKING': 'Ngành Ngân hàng',
    'SECTOR_CONSTRUCTION': 'Ngành Xây dựng - Hạ tầng',
    'SECTOR_CONSUMER': 'Ngành Bán lẻ - Tiêu dùng',
    'SECTOR_FERTILIZER': 'Ngành Phân bón - Hóa chất',
    'SECTOR_INDUSTRIAL': 'Ngành KCN - Xuất khẩu',
    'SECTOR_INSURANCE': 'Ngành Bảo hiểm',
    'SECTOR_LIVESTOCK': 'Ngành Nông nghiệp - Chăn nuôi',
    'SECTOR_LOGISTICS': 'Ngành Vận tải - Cảng biển - Logistics',
    'SECTOR_OIL_GAS': 'Ngành Dầu khí',
    'SECTOR_PLASTIC': 'Ngành Nhựa',
    'SECTOR_REALESTATE': 'Ngành Bất động sản',
    'SECTOR_SEAFOOD': 'Ngành Thủy sản - Nông nghiệp',
    'SECTOR_SECURITIES': 'Ngành Chứng khoán',
    'SECTOR_STEEL': 'Ngành Thép / Vật liệu',
    'SECTOR_TECH': 'Ngành Công nghệ',
    'SECTOR_TEXTILE': 'Ngành Dệt may',
    'SECTOR_TIRE': 'Ngành Săm lốp - Cao su CN',
    'SECTOR_UTILITIES': 'Ngành Điện - Tiện ích',
}

# ============================================================
# 3) BẢN ĐỒ NHÂN QUẢ NGÀNH × VĨ MÔ
#    (macro_id, sector_id, relationship, sign, weight, lag, mechanism)
# ============================================================
SECTOR_EDGES = [
    # ===== SECTOR_AVIATION =====
    ('GIA_DIESEL_JET', 'SECTOR_AVIATION', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('GIA_DAU_BRENT', 'SECTOR_AVIATION', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('TY_GIA_USD_VND', 'SECTOR_AVIATION', 'AFFECTS_NEGATIVE', '-', 0.6, 'đồng thời', 'Nợ/thuê tàu bay bằng USD'),
    ('GDP_VN', 'SECTOR_AVIATION', 'AFFECTS_POSITIVE', '+', 0.5, 'đồng thời', 'Phục hồi du lịch & đi lại'),
    # ===== SECTOR_BANKING =====
    ('TANG_TRUONG_TIN_DUNG', 'SECTOR_BANKING', 'AFFECTS_POSITIVE', '+', 0.9, 'đồng thời', 'Tín dụng tăng → quy mô cho vay & thu nhập lãi tăng'),
    ('CHINH_SACH_FTSE', 'SECTOR_BANKING', 'AFFECTS_POSITIVE', '+', 0.6, 'trước 9/2026', 'Large-cap NH hút vốn ngoại khi nâng hạng'),
    ('LAI_SUAT_VN', 'SECTOR_BANKING', 'AFFECTS_POSITIVE', '+', 0.5, '1-2 quý', 'Lãi suất nhích → NIM cải thiện ngắn hạn'),
    ('LUAT_DAT_DAI', 'SECTOR_BANKING', 'AFFECTS_POSITIVE', '+', 0.5, 'nhiều quý', 'Gỡ pháp lý BĐS → giảm rủi ro nợ xấu cho NH'),
    # ===== SECTOR_CONSTRUCTION =====
    ('DAU_TU_CONG', 'SECTOR_CONSTRUCTION', 'DRIVES_DEMAND_OF', '+', 0.9, 'nhiều quý', 'Giải ngân đầu tư công là động lực chính'),
    ('GIA_THEP_XAY_DUNG', 'SECTOR_CONSTRUCTION', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('GIA_XI_MANG', 'SECTOR_CONSTRUCTION', 'IS_INPUT_COST_OF', '-', 0.6, None, 'Xi măng là vật liệu đầu vào xây dựng'),
    ('LAI_SUAT_VN', 'SECTOR_CONSTRUCTION', 'AFFECTS_NEGATIVE', '-', 0.45, '1-2 quý', 'Chi phí vốn dự án'),
    # ===== SECTOR_CONSUMER =====
    ('GIA_SUA_NGUYEN_LIEU', 'SECTOR_CONSUMER', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('GIA_DUONG', 'SECTOR_CONSUMER', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('CPI_VN', 'SECTOR_CONSUMER', 'AFFECTS_NEGATIVE', '-', 0.6, 'đồng thời', 'Lạm phát cao → sức mua giảm (hàng không thiết yếu)'),
    ('GDP_VN', 'SECTOR_CONSUMER', 'AFFECTS_POSITIVE', '+', 0.6, 'nhiều quý', 'Thu nhập tăng → tiêu dùng tăng'),
    ('LAI_SUAT_VN', 'SECTOR_CONSUMER', 'AFFECTS_NEGATIVE', '-', 0.45, '1-2 quý', 'Lãi suất cao → giảm mua trả góp'),
    ('TY_GIA_USD_VND', 'SECTOR_CONSUMER', 'AFFECTS_NEGATIVE', '-', 0.4, 'đồng thời', 'Nhập nguyên liệu → giá vốn tăng khi tỷ giá tăng'),
    # ===== SECTOR_FERTILIZER =====
    ('GIA_KHI_GAS', 'SECTOR_FERTILIZER', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('GIA_URE', 'SECTOR_FERTILIZER', 'AFFECTS_POSITIVE', '+', 0.7, None, 'Sản phẩm đầu ra → giá bán tăng làm tăng doanh thu/lợi nhuận'),
    ('GDP_VN', 'SECTOR_FERTILIZER', 'DRIVES_DEMAND_OF', '+', 0.5, None, 'Sản xuất nông nghiệp kéo cầu phân bón'),
    # ===== SECTOR_INDUSTRIAL =====
    ('GIA_CAO_SU', 'SECTOR_INDUSTRIAL', 'AFFECTS_POSITIVE', '+', 0.7, None, 'Sản phẩm đầu ra → giá bán tăng làm tăng doanh thu/lợi nhuận'),
    ('THUE_QUAN_MY_VN', 'SECTOR_INDUSTRIAL', 'AFFECTS_NEGATIVE', '-', 0.7, 'nhiều quý', 'Thuế Mỹ cao → giảm đơn hàng xuất khẩu'),
    ('KINH_TE_TQ', 'SECTOR_INDUSTRIAL', 'AFFECTS_POSITIVE', '+', 0.6, 'nhiều quý', 'Dịch chuyển chuỗi cung ứng China+1 vào VN'),
    ('TY_GIA_USD_VND', 'SECTOR_INDUSTRIAL', 'AFFECTS_POSITIVE', '+', 0.5, 'đồng thời', 'Tỷ giá tăng hỗ trợ doanh thu xuất khẩu'),
    # ===== SECTOR_INSURANCE =====
    ('LAI_SUAT_VN', 'SECTOR_INSURANCE', 'AFFECTS_POSITIVE', '+', 0.6, '1-2 quý', 'Lãi suất cao → lợi suất danh mục đầu tư tăng'),
    ('CHINH_SACH_FTSE', 'SECTOR_INSURANCE', 'AFFECTS_POSITIVE', '+', 0.4, 'trước 9/2026', 'Hưởng lợi dòng vốn large-cap'),
    # ===== SECTOR_LIVESTOCK =====
    ('GIA_HEO_HOI', 'SECTOR_LIVESTOCK', 'AFFECTS_POSITIVE', '+', 0.7, None, 'Sản phẩm đầu ra → giá bán tăng làm tăng doanh thu/lợi nhuận'),
    ('GIA_KHO_DAU', 'SECTOR_LIVESTOCK', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('GIA_NGO', 'SECTOR_LIVESTOCK', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('CPI_VN', 'SECTOR_LIVESTOCK', 'AFFECTS_POSITIVE', '+', 0.5, None, 'Giá thực phẩm trong CPI hỗ trợ doanh thu'),
    # ===== SECTOR_LOGISTICS =====
    ('GIA_CUOC_VAN_TAI', 'SECTOR_LOGISTICS', 'AFFECTS_POSITIVE', '+', 0.85, 'đồng thời', 'Giá cước tăng → doanh thu hãng tàu/cảng tăng mạnh'),
    ('KINH_TE_TQ', 'SECTOR_LOGISTICS', 'AFFECTS_POSITIVE', '+', 0.65, 'nhiều quý', 'Thương mại TQ kéo sản lượng hàng qua cảng/tuyến biển'),
    ('GIA_DAU_BRENT', 'SECTOR_LOGISTICS', 'IS_INPUT_COST_OF', '-', 0.6, 'đồng thời', 'Nhiên liệu (bunker) là chi phí vận hành tàu lớn'),
    ('THUE_QUAN_MY_VN', 'SECTOR_LOGISTICS', 'AFFECTS_NEGATIVE', '-', 0.55, 'nhiều quý', 'Thuế cao → giảm xuất khẩu → giảm sản lượng vận tải'),
    ('GDP_VN', 'SECTOR_LOGISTICS', 'DRIVES_DEMAND_OF', '+', 0.55, 'đồng thời', 'Tăng trưởng & XNK kéo nhu cầu logistics nội địa'),
    # ===== SECTOR_OIL_GAS =====
    ('GIA_DAU_BRENT', 'SECTOR_OIL_GAS', 'AFFECTS_POSITIVE', '+', 0.7, None, 'Sản phẩm đầu ra → giá bán tăng làm tăng doanh thu/lợi nhuận'),
    ('QH_DIEN_8', 'SECTOR_OIL_GAS', 'AFFECTS_POSITIVE', '+', 0.5, 'nhiều quý', 'Điện khí LNG theo QH8 → cầu khí'),
    # ===== SECTOR_PLASTIC =====
    ('GIA_DAU_BRENT', 'SECTOR_PLASTIC', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('DAU_TU_CONG', 'SECTOR_PLASTIC', 'DRIVES_DEMAND_OF', '+', 0.5, None, 'Hạ tầng/BĐS kéo cầu ống nhựa'),
    ('LAI_SUAT_VN', 'SECTOR_PLASTIC', 'AFFECTS_NEGATIVE', '-', 0.4, None, 'Cầu BĐS nhạy lãi suất'),
    # ===== SECTOR_REALESTATE =====
    ('LAI_SUAT_VN', 'SECTOR_REALESTATE', 'AFFECTS_NEGATIVE', '-', 0.9, '1-2 quý', 'Lãi suất cao → giảm nhu cầu vay mua nhà & chi phí vốn cao'),
    ('LUAT_DAT_DAI', 'SECTOR_REALESTATE', 'AFFECTS_POSITIVE', '+', 0.85, 'nhiều quý', 'Pháp lý thông thoáng → tái khởi động dự án'),
    ('TANG_TRUONG_TIN_DUNG', 'SECTOR_REALESTATE', 'DRIVES_DEMAND_OF', '+', 0.7, 'đồng thời', 'Tín dụng BĐS nới → thanh khoản dự án'),
    ('GIA_THEP_XAY_DUNG', 'SECTOR_REALESTATE', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('LAI_SUAT_FED', 'SECTOR_REALESTATE', 'AFFECTS_NEGATIVE', '-', 0.5, '1-2 quý', 'Fed cao → dòng vốn rút, áp lực tỷ giá lên DN nợ USD'),
    ('DAU_TU_CONG', 'SECTOR_REALESTATE', 'AFFECTS_POSITIVE', '+', 0.5, 'nhiều quý', 'Hạ tầng tăng giá trị quỹ đất vùng ven'),
    # ===== SECTOR_SEAFOOD =====
    ('GIA_KHO_DAU', 'SECTOR_SEAFOOD', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('THUE_QUAN_MY_VN', 'SECTOR_SEAFOOD', 'AFFECTS_NEGATIVE', '-', 0.65, 'nhiều quý', 'Thuế/rào cản Mỹ-EU ảnh hưởng xuất khẩu'),
    ('TY_GIA_USD_VND', 'SECTOR_SEAFOOD', 'AFFECTS_POSITIVE', '+', 0.6, 'đồng thời', 'Doanh thu xuất khẩu quy đổi VND tăng'),
    # ===== SECTOR_SECURITIES =====
    ('CHINH_SACH_FTSE', 'SECTOR_SECURITIES', 'AFFECTS_POSITIVE', '+', 0.95, 'quanh 9/2026', 'Nâng hạng → vốn ngoại, thanh khoản, IPO, môi giới bùng nổ'),
    ('LAI_SUAT_VN', 'SECTOR_SECURITIES', 'AFFECTS_NEGATIVE', '-', 0.7, 'đồng thời', 'Lãi suất thấp → dòng tiền rẻ chảy vào chứng khoán'),
    ('KHAU_VI_RUI_RO', 'SECTOR_SECURITIES', 'AFFECTS_POSITIVE', '+', 0.7, 'đồng thời', 'Khẩu vị rủi ro cao → thanh khoản & dư nợ margin tăng'),
    # ===== SECTOR_STEEL =====
    ('GIA_THEP_HRC', 'SECTOR_STEEL', 'IS_INPUT_COST_OF', '-', 0.8, 'đồng thời', 'Giá HRC ảnh hưởng giá bán & biên lợi nhuận'),
    ('GIA_NHIET_LIEU', 'SECTOR_STEEL', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('DAU_TU_CONG', 'SECTOR_STEEL', 'DRIVES_DEMAND_OF', '+', 0.7, 'nhiều quý', 'Hạ tầng & xây dựng kéo cầu thép'),
    ('KINH_TE_TQ', 'SECTOR_STEEL', 'AFFECTS_NEGATIVE', '-', 0.7, 'đồng thời', 'Thép TQ dư cung/phá giá ép giá thép VN'),
    ('GIA_QUANG_SAT', 'SECTOR_STEEL', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('GIA_THEP_HRC', 'SECTOR_STEEL', 'AFFECTS_POSITIVE', '+', 0.7, None, 'Sản phẩm đầu ra → giá bán tăng làm tăng doanh thu/lợi nhuận'),
    ('TY_GIA_USD_VND', 'SECTOR_STEEL', 'AFFECTS_NEGATIVE', '-', 0.5, 'đồng thời', 'Nợ USD & nhập nguyên liệu → chi phí tăng khi tỷ giá tăng'),
    # ===== SECTOR_TECH =====
    ('TY_GIA_USD_VND', 'SECTOR_TECH', 'AFFECTS_POSITIVE', '+', 0.7, 'đồng thời', 'Doanh thu xuất khẩu IT quy đổi VND tăng khi tỷ giá tăng'),
    ('GDP_VN', 'SECTOR_TECH', 'AFFECTS_POSITIVE', '+', 0.5, 'nhiều quý', 'Chuyển đổi số & chi tiêu IT nội địa'),
    # ===== SECTOR_TEXTILE =====
    ('THUE_QUAN_MY_VN', 'SECTOR_TEXTILE', 'AFFECTS_NEGATIVE', '-', 0.8, None, 'Dệt may xuất khẩu chịu thuế Mỹ'),
    ('GIA_BONG', 'SECTOR_TEXTILE', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('TY_GIA_USD_VND', 'SECTOR_TEXTILE', 'AFFECTS_POSITIVE', '+', 0.55, None, 'Doanh thu xuất khẩu quy đổi VND tăng'),
    # ===== SECTOR_TIRE =====
    ('GIA_CAO_SU', 'SECTOR_TIRE', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('GDP_VN', 'SECTOR_TIRE', 'DRIVES_DEMAND_OF', '+', 0.5, None, 'Vận tải/ô tô kéo cầu lốp'),
    # ===== SECTOR_UTILITIES =====
    ('GIA_NHIET_LIEU', 'SECTOR_UTILITIES', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('QH_DIEN_8', 'SECTOR_UTILITIES', 'AFFECTS_POSITIVE', '+', 0.7, 'nhiều quý', 'Mở rộng công suất nguồn điện'),
    ('GIA_KHI_GAS', 'SECTOR_UTILITIES', 'IS_INPUT_COST_OF', '-', 0.7, None, 'Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN'),
    ('GIA_DIEN', 'SECTOR_UTILITIES', 'AFFECTS_POSITIVE', '+', 0.7, None, 'Giá bán điện là đầu ra doanh thu điện'),
    ('GDP_VN', 'SECTOR_UTILITIES', 'DRIVES_DEMAND_OF', '+', 0.5, 'đồng thời', 'Tăng trưởng kéo nhu cầu điện'),
]

# ============================================================
# 4) CHUỖI LAN TRUYỀN VĨ MÔ (TRANSMITS_TO): (from, to, sign, mechanism)
# ============================================================
TRANSMIT_EDGES = [
    ('CHINH_SACH_FTSE', 'KHAU_VI_RUI_RO', '+', 'Nâng hạng cải thiện tâm lý & dòng vốn vào VN'),
    ('CPI_VN', 'LAI_SUAT_VN', '+', 'Lạm phát cao → SBV thắt chặt, tăng lãi suất'),
    ('DAU_TU_CONG', 'GDP_VN', '+', 'Đầu tư công kích thích tăng trưởng'),
    ('DXY_USD_INDEX', 'TY_GIA_USD_VND', '+', 'USD mạnh → áp lực tỷ giá USD/VND tăng'),
    ('GIA_DAU_BRENT', 'CPI_VN', '+', 'Giá dầu cao → chi phí vận tải/năng lượng → lạm phát'),
    ('GIA_DAU_BRENT', 'GIA_CUOC_VAN_TAI', '+', 'Giá dầu cao → phụ phí nhiên liệu đẩy giá cước'),
    ('KINH_TE_TQ', 'GIA_CUOC_VAN_TAI', '+', 'Thương mại/sản xuất TQ tăng → cầu vận tải → giá cước tăng'),
    ('KINH_TE_TQ', 'GIA_QUANG_SAT', '+', 'Sản xuất thép TQ kéo cầu quặng sắt'),
    ('KINH_TE_TQ', 'GIA_THEP_HRC', '+', 'Cầu thép TQ dẫn dắt giá HRC toàn cầu'),
    ('LAI_SUAT_FED', 'DXY_USD_INDEX', '+', 'Fed tăng → USD mạnh lên'),
    ('LAI_SUAT_FED', 'KHAU_VI_RUI_RO', '-', 'Fed cao → dòng vốn rút khỏi thị trường mới nổi'),
    ('LAI_SUAT_FED', 'TY_GIA_USD_VND', '+', 'Chênh lệch lãi suất → áp lực tỷ giá'),
]

# ── Đồ thị tri thức VN (in-memory, dựng 1 lần) ──
VN_GRAPH = MarketGraph(
    macro_nodes=MACRO_NODES,
    sector_nodes=SECTOR_NODES,
    sector_edges=SECTOR_EDGES,
    transmit_edges=TRANSMIT_EDGES,
    transmit_confidence=0.7,
)

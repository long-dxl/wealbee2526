"""
ETL dữ liệu BCTC theo QUÝ (IS/BS/CF đầy đủ + ratio margin/growth) từ Excel Vietcap
vào financial_statements + financial_ratios (period_type='QUARTER').

Chỉ giữ 5 quý gần nhất mỗi mã (rolling theo dữ liệu thật có, không hardcode ngày) —
đúng phạm vi "Năm + 5 Quý gần nhất" cho tool báo cáo tài chính Analyst Agent.

Nguồn: ~/bctc_vietcap/{HOSE,HNX}/*.xlsx (403 mã HOSE + 299 mã HNX, 4 sheet mỗi file:
Balance Sheet/Income Statement/Cash Flow/Note). Row header quý dạng "Q1 2018".."Q1 2026"
nằm cùng row với header năm. (Thư mục VN30/ là tập con trùng với HOSE/, không cần đọc riêng.)

item_code/công thức derived lấy từ item_label_vi đã lưu trong DB (period_type=FY) —
đã verify khớp CHÍNH XÁC bằng số liệu thật HPG FY2025:
  BS_EQUITY            = BS_TOTAL_ASSETS - BS_TOTAL_DEBT
  CF_FCF               = CF_OPERATING + CF_CAPEX
  IS_OPERATING_PROFIT  = IS_PRETAX - (IS_OTHER_INCOME + IS_OTHER_EXPENSE)

Chạy:
    python etl_bctc_quarterly.py --symbols HPG,VCB,VND,BVH --dry-run   # xem trước
    python etl_bctc_quarterly.py --symbols HPG,VCB,VND,BVH             # ghi DB (test)
    python etl_bctc_quarterly.py --all                                  # toàn bộ 403 mã
"""

import argparse
import glob
import os
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import openpyxl
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from supabase_writer import get_client, upsert_batch

EXCEL_DIRS = [os.path.expanduser("~/bctc_vietcap/HOSE"), os.path.expanduser("~/bctc_vietcap/HNX")]
N_QUARTERS = 5
SHEET_NAMES = {"IS": "Income Statement", "BS": "Balance Sheet", "CF": "Cash Flow"}

# ── Nhãn VN gốc (cột A trong Excel) → item_code chuẩn, theo company_type ────────
# Lấy trực tiếp từ item_label_vi đã lưu trong financial_statements (period_type=FY)
# cho 1 mã đại diện mỗi loại hình (HPG=normal, VCB=bank, VND=securities, BVH=insurance).

LABEL_MAPS = {
    ("normal", "IS"): {
        "Doanh thu thuần": "IS_REVENUE",
        "Giá vốn hàng bán": "IS_COGS",
        "Lợi nhuận gộp": "IS_GROSS_PROFIT",
        "Doanh thu hoạt động tài chính": "IS_FIN_INCOME",
        "Chi phí tài chính": "IS_FIN_EXPENSE",
        "Chi phí lãi vay": "IS_INTEREST_EXPENSE",
        "Chi phí bán hàng": "IS_SELLING_EXP",
        "Chi phí quản lý doanh nghiệp": "IS_ADMIN_EXP",
        "Thu nhập khác": "IS_OTHER_INCOME",
        "Chi phí khác": "IS_OTHER_EXPENSE",
        "Lãi/(lỗ) trước thuế": "IS_PRETAX",
        "Chi phí thuế thu nhập doanh nghiệp": "IS_TAX",
        "Lãi/(lỗ) thuần sau thuế": "IS_NET_PROFIT",
        "Lợi nhuận của Cổ đông của Công ty mẹ": "IS_NET_PROFIT_PARENT",
        "Lãi cơ bản trên cổ phiếu (VND)": "IS_EPS",
        "Lãi trên cổ phiếu pha loãng (VND)": "IS_EPS_DILUTED",
    },
    ("normal", "BS"): {
        "TÀI SẢN NGẮN HẠN": "BS_CURRENT_ASSETS",
        "TÀI SẢN DÀI HẠN": "BS_LONG_ASSETS",
        "Tiền và tương đương tiền": "BS_CASH",
        "Các khoản phải thu": "BS_RECEIVABLES",
        "Hàng tồn kho": "BS_INVENTORY",
        "TỔNG CỘNG TÀI SẢN": "BS_TOTAL_ASSETS",
        "Nợ ngắn hạn": "BS_CURRENT_LIAB",
        "NỢ PHẢI TRẢ": "BS_TOTAL_DEBT",
        # Chỉ map nhãn hiện hành (Circular 200/2014+) — nhãn cũ "...cổ đông thiểu số" đôi khi
        # tồn tại song song = 0 (dead label, verify VHM) nên KHÔNG map để tránh ghi đè sai.
        "Lợi ích cổ đông không kiểm soát": "BS_NCI",
    },
    ("normal", "CF"): {
        "Lưu chuyển tiền tệ ròng từ các hoạt động sản xuất kinh doanh": "CF_OPERATING",
        "Khấu hao TSCĐ và BĐSĐT": "CF_DEPRECIATION",
        "Tiền chi để mua sắm, xây dựng TSCĐ và các tài sản dài hạn khác": "CF_CAPEX",
        "Lưu chuyển tiền thuần từ hoạt động đầu tư": "CF_INVESTING",
        "Lưu chuyển tiền thuần từ hoạt động tài chính": "CF_FINANCING",
        "Lưu chuyển tiền thuần trong kỳ": "CF_NET",
    },
    ("bank", "IS"): {
        "Thu nhập lãi và các khoản thu nhập tương tự": "BANK_INT_INCOME",
        "Chi phí lãi và các chi phí tương tự": "BANK_INT_EXPENSE",
        "Thu nhập lãi thuần": "BANK_NII",
        "Thu nhập từ dịch vụ": "BANK_FEE_INCOME",
        "Lãi/Lỗ thuần từ hoạt động dịch vụ": "BANK_NET_FEE",
        "Tổng thu nhập hoạt động": "BANK_TOI",
        "Chi phí quản lý doanh nghiệp": "BANK_OPEX",
        "Lợi nhuận thuần hoạt động trước khi trích lập dự phòng tổn thất tín dụng": "BANK_PREPROVISION",
        "Trích lập dự phòng tổn thất tín dụng": "BANK_PROVISION",
        "Tổng lợi nhuận/lỗ trước thuế": "IS_PRETAX",
        "Chi phí thuế thu nhập doanh nghiệp": "IS_TAX",
        "Lợi nhuận sau thuế": "IS_NET_PROFIT",
        "Cổ đông của Công ty mẹ": "IS_NET_PROFIT_PARENT",
        "Lãi cơ bản trên cổ phiếu (VND)": "IS_EPS",
        "Lãi trên cổ phiếu pha loãng (VND)": "IS_EPS_DILUTED",
    },
    ("bank", "BS"): {
        "TỔNG TÀI SẢN": "BS_TOTAL_ASSETS",
        "TỔNG NỢ PHẢI TRẢ": "BS_TOTAL_DEBT",
        "Tiền gửi tại Ngân hàng nhà nước Việt Nam": "BANK_DEPOSIT_NHNN",
        "Tiền gửi tại các TCTD khác và cho vay các TCTD khác": "BANK_DEPOSIT_TCTD",
        "Chứng khoán kinh doanh": "BANK_SEC_TRADING",
        "Chứng khoán đầu tư": "BANK_SEC_INVEST",
        "Cho vay khách hàng": "BANK_LOANS",
        "Dự phòng rủi ro cho vay khách hàng": "BANK_LOAN_RESERVE",
        "Các khoản nợ chính phủ và NHNN Việt Nam": "BANK_GOV_DEBT",
        "Tiền gửi và vay các Tổ chức tín dụng khác": "BANK_BORROW_TCTD",
        "Tiền gửi của khách hàng": "BANK_DEPOSITS",
        "Phát hành giấy tờ có giá": "BANK_PAPER",
        # Bank dùng nhãn CŨ "Lợi ích của cổ đông thiểu số" — verify TCB/VPB/VCB, nhãn "không
        # kiểm soát" KHÔNG tồn tại trong template ngân hàng (khác normal/securities).
        "Lợi ích của cổ đông thiểu số": "BS_NCI",
    },
    ("bank", "CF"): {
        "Lưu chuyển tiền thuần từ các hoạt động sản xuất kinh doanh": "CF_OPERATING",
        "Mua sắm TSCĐ": "CF_CAPEX",
        "Lưu chuyển tiền thuần từ hoạt động đầu tư": "CF_INVESTING",
        "Lưu chuyển tiền thuần từ hoạt động tài chính": "CF_FINANCING",
        "Lưu chuyển tiền thuần trong kỳ": "CF_NET",
    },
    ("securities", "IS"): {
        "Doanh thu thuần về hoạt động kinh doanh": "IS_REVENUE",
        "LỢI NHUẬN GỘP": "IS_GROSS_PROFIT",
        "Chi phí lãi vay": "IS_INTEREST_EXPENSE",
        "CHI PHÍ TÀI CHÍNH": "IS_FIN_EXPENSE",
        "Doanh thu nghiệp vụ môi giới chứng khoán": "SEC_BROKERAGE",
        "Lãi từ các khoản cho vay và phải thu": "SEC_MARGIN_INCOME",
        "KẾT QUẢ HOẠT ĐỘNG": "IS_OPERATING_DIRECT",
        "TỔNG LỢI NHUẬN KẾ TOÁN TRƯỚC THUẾ": "IS_PRETAX",
        # KHÔNG map "CHI PHÍ THUẾ THU NHẬP DOANH NGHIỆP" — cell lỗi merge trong template
        # Vietcap securities, giá trị trùng IS_PRETAX (xem etl_financials.py).
        "LỢI NHUẬN KẾ TOÁN SAU THUẾ": "IS_NET_PROFIT",
        "Lợi nhuận sau thuế phân bổ cho chủ sở hữu": "IS_NET_PROFIT_PARENT",
        "Lãi cơ bản trên cổ phiếu (VND)": "IS_EPS",
        "Lãi trên cổ phiếu pha loãng (VND)": "IS_EPS_DILUTED",
    },
    ("securities", "BS"): {
        "TÀI SẢN NGẮN HẠN": "BS_CURRENT_ASSETS",
        "TÀI SẢN DÀI HẠN": "BS_LONG_ASSETS",
        "TỔNG CỘNG TÀI SẢN": "BS_TOTAL_ASSETS",
        "Nợ phải trả ngắn hạn": "BS_CURRENT_LIAB",
        "NỢ PHẢI TRẢ": "BS_TOTAL_DEBT",
        "Các khoản cho vay": "SEC_MARGIN_LOANS",
        "Lợi ích cổ đông không kiểm soát": "BS_NCI",
    },
    ("securities", "CF"): {
        "Lưu chuyển thuần từ hoạt động kinh doanh": "CF_OPERATING",
        "Tiền chi để mua sắm, xây dựng TSCĐ, BĐSĐT và các tài sản dài hạn khác": "CF_CAPEX",
        "Lưu chuyển tiền thuần từ hoạt động đầu tư": "CF_INVESTING",
        "Lưu chuyển thuần từ hoạt động tài chính": "CF_FINANCING",
        "LƯU CHUYỂN TIỀN THUẦN TRONG KỲ": "CF_NET",
    },
    ("insurance", "IS"): {
        "Doanh thu thuần từ hoạt động kinh doanh bảo hiểm": "IS_REVENUE",
        "Lợi nhuận gộp hoạt động kinh doanh bảo hiểm": "IS_GROSS_PROFIT",
        "Doanh thu phí bảo hiểm thuần": "INS_PREMIUM_NET",
        "Tổng chi trực tiếp hoạt động kinh doanh bảo hiểm": "INS_CLAIM",
        "Lợi nhuận thuần hoạt động kinh doanh bảo hiểm": "INS_UNDERWRITING",
        "Lợi nhuận hoạt động tài chính": "INS_FIN_RESULT",
        "Chi phí hoạt động tài chính": "IS_FIN_EXPENSE",
        "Thu nhập khác": "IS_OTHER_INCOME",
        "Chi phí khác": "IS_OTHER_EXPENSE",
        "Tổng lợi nhuận kế toán trước thuế": "IS_PRETAX",
        "Chi phí thuế thu nhập doanh nghiệp trong năm": "IS_TAX",
        "Lợi nhuận sau thuế thu nhập doanh nghiệp": "IS_NET_PROFIT",
        "Lợi nhuận sau thuế của chủ sở hữu, tập đoàn": "IS_NET_PROFIT_PARENT",
        "Lãi cơ bản trên cổ phiếu (VND)": "IS_EPS",
        "Lãi trên cổ phiếu pha loãng (VND)": "IS_EPS_DILUTED",
    },
    ("insurance", "BS"): {
        "TÀI SẢN NGẮN HẠN": "BS_CURRENT_ASSETS",
        "TÀI SẢN DÀI HẠN": "BS_LONG_ASSETS",
        "Tiền và các khoản tương đương tiền": "BS_CASH",
        "TỔNG CỘNG TÀI SẢN": "BS_TOTAL_ASSETS",
        "Nợ ngắn hạn": "BS_CURRENT_LIAB",
        "NỢ PHẢI TRẢ": "BS_TOTAL_DEBT",
        # Insurance dùng nhãn RIÊNG "Lợi ích cổ đông thiểu số" (không "của") — verify BVH/BMI/
        # BIC/MIG/PVI, khác cả normal/securities ("không kiểm soát") lẫn bank ("của...thiểu số").
        "Lợi ích cổ đông thiểu số": "BS_NCI",
    },
    ("insurance", "CF"): {
        "Lưu chuyển tiền thuần từ hoạt động kinh doanh": "CF_OPERATING",
        "Tiền chi mua sắm, xây dựng TSCĐ và các tài sản dài hạn khác": "CF_CAPEX",
        "Lưu chuyển tiền thuần từ hoạt động đầu tư": "CF_INVESTING",
        "Lưu chuyển tiền thuần từ hoạt động tài chính": "CF_FINANCING",
        "Lưu chuyển tiền thuần trong kỳ": "CF_NET",
    },
}

# ratio_code tính được thuần từ IS-quý hoặc BS cuối kỳ (point-in-time, không cần số
# bình quân) — khớp RATIO_SET trong _shared/financial-report.ts. ROE/ROA/PE/PB/PS quý
# không tính theo quyết định "không phức tạp hoá" (annualize/TTM cần method riêng, xem plan);
# DEBT_TO_EQUITY/CURRENT_RATIO thì thuần point-in-time (BS cuối quý / BS cuối quý) nên
# không có vấn đề đó, đã verify khớp công thức FY (HPG 2025: D/E 0.97x, CR 1.10x).
QUARTER_RATIOS = {
    "normal":     ["GROSS_MARGIN", "OPERATING_MARGIN", "NET_MARGIN", "REVENUE_GROWTH", "NET_PROFIT_GROWTH", "DEBT_TO_EQUITY", "CURRENT_RATIO"],
    "bank":       ["REVENUE_GROWTH", "NET_PROFIT_GROWTH"],
    "securities": ["GROSS_MARGIN", "OPERATING_MARGIN", "NET_MARGIN", "REVENUE_GROWTH", "NET_PROFIT_GROWTH", "DEBT_TO_EQUITY"],
    "insurance":  ["NET_MARGIN", "OPERATING_MARGIN", "REVENUE_GROWTH", "NET_PROFIT_GROWTH"],
}
REVENUE_CODE = {"normal": "IS_REVENUE", "securities": "IS_REVENUE", "insurance": "IS_REVENUE", "bank": "BANK_TOI"}

QUARTER_RE = re.compile(r"^Q([1-4])\s(\d{4})$")
PERIOD_RE = re.compile(r"^Q([1-4])/(\d{4})$")


def quarter_sort_key(period: str) -> int:
    m = PERIOD_RE.match(period)
    n, y = int(m.group(1)), int(m.group(2))
    return y * 4 + n


def find_quarter_header(ws):
    """Tìm row header quý ('Q1 2018'...) → (row_idx, {col_idx: "Q{n}/{yyyy}"}). Dùng
    enumerate cho column index (1-based) vì cell.column/cell.row không tồn tại trên
    EmptyCell (ô rỗng cuối dòng ở read_only mode)."""
    for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=15), start=1):
        col_to_period = {}
        for col_idx, cell in enumerate(row, start=1):
            v = cell.value
            if isinstance(v, str):
                m = QUARTER_RE.match(v.strip())
                if m:
                    col_to_period[col_idx] = f"Q{m.group(1)}/{m.group(2)}"
        if col_to_period:
            return row_idx, col_to_period
    return None, {}


def read_sheet_quarters(ws, label_map, header_row, col_to_period):
    """Đọc mọi dòng dữ liệu sau header_row → {item_code: {period: value}}."""
    out: dict[str, dict[str, float]] = {}
    for row in ws.iter_rows(min_row=header_row + 1):
        label_cell = row[0]
        label = str(label_cell.value).strip() if label_cell.value else ""
        if not label or label not in label_map:
            continue
        code = label_map[label]
        for col_idx, cell in enumerate(row, start=1):
            period = col_to_period.get(col_idx)
            if not period or cell.value is None:
                continue
            try:
                val = float(cell.value)
            except (TypeError, ValueError):
                continue
            out.setdefault(code, {})[period] = val
    return out


def add_derived(values: dict[str, dict[str, float]], periods: list[str]) -> None:
    for p in periods:
        ta, td = values.get("BS_TOTAL_ASSETS", {}).get(p), values.get("BS_TOTAL_DEBT", {}).get(p)
        if ta is not None and td is not None:
            eq_tot = ta - td
            values.setdefault("BS_EQUITY", {})[p] = eq_tot
            # VCSH cổ đông MẸ (loại NCI) — dùng cho BVPS/PB quý mới nhất, khớp chuẩn CFA/IFRS
            # (NCI không thuộc cổ đông công ty mẹ). Verify VHM Q1/2026: BVPS=63.864đ vs
            # Simplize=63.850đ (lệch 0.02%) khi dùng VCSH mẹ quý mới nhất thay vì FY cũ.
            nci = values.get("BS_NCI", {}).get(p) or 0
            values.setdefault("BS_EQUITY_PARENT", {})[p] = eq_tot - nci
        ocf, capex = values.get("CF_OPERATING", {}).get(p), values.get("CF_CAPEX", {}).get(p)
        if ocf is not None and capex is not None:
            values.setdefault("CF_FCF", {})[p] = ocf + capex
        pretax = values.get("IS_PRETAX", {}).get(p)
        oi, oe = values.get("IS_OTHER_INCOME", {}).get(p), values.get("IS_OTHER_EXPENSE", {}).get(p)
        if pretax is not None and oi is not None and oe is not None:
            values.setdefault("IS_OPERATING_PROFIT", {})[p] = pretax - (oi + oe)


def compute_ratios(values: dict[str, dict[str, float]], window: list[str], ctype: str) -> dict[str, dict[str, float]]:
    """Margin (trong window) + growth YoY (chỉ tính được nếu có dữ liệu cùng kỳ năm trước
    trong `values`, có thể nằm ngoài window vì đọc toàn bộ lịch sử Excel trước khi cắt)."""
    ratios: dict[str, dict[str, float]] = {}
    reasons: dict[str, dict[str, str]] = {}   # code -> {period: na_reason} (mẫu số ≤0)
    allowed = set(QUARTER_RATIOS.get(ctype, []))
    rev_code = REVENUE_CODE[ctype]
    def flag(code, p, reason):
        """Gắn cờ ratio KHÔNG XÁC ĐỊNH: ghi value=None + lý do (để ghi đè số rác đã lưu)."""
        if code in allowed:
            ratios.setdefault(code, {})[p] = None
            reasons.setdefault(code, {})[p] = reason
    # LƯU Ý: dùng IS_NET_PROFIT_PARENT (LNST cổ đông công ty mẹ), KHÔNG dùng IS_NET_PROFIT
    # (LNST tổng, gồm cả lợi ích cổ đông không kiểm soát/NCI) — đã verify bằng số liệu thật:
    # NET_MARGIN đã lưu ở tầng FY (vd GEX 2025 = 3.74%) chỉ khớp khi tính từ NET_PROFIT_PARENT
    # (1.477.891.529.178 / 39.512.528.150.953), KHÔNG khớp nếu dùng NET_PROFIT tổng (sẽ ra 7.48%,
    # gấp đôi). Với ~19% số mã (96/503 mẫu) có NCI lệch >5%, dùng sai sẽ sai margin/growth quý
    # rất nhiều so với FY (có mã lệch tới 2x như GEX, TSC, DL1, ASM, CII).
    for p in window:
        rev = values.get(rev_code, {}).get(p)
        gp, op, npf = (values.get("IS_GROSS_PROFIT", {}).get(p),
                       values.get("IS_OPERATING_PROFIT", {}).get(p),
                       values.get("IS_NET_PROFIT_PARENT", {}).get(p))
        if rev is not None and rev > 0:   # biên LN chỉ có nghĩa khi DT DƯƠNG
            if gp is not None and "GROSS_MARGIN" in allowed:
                ratios.setdefault("GROSS_MARGIN", {})[p] = gp / rev
            if op is not None and "OPERATING_MARGIN" in allowed:
                ratios.setdefault("OPERATING_MARGIN", {})[p] = op / rev
            if npf is not None and "NET_MARGIN" in allowed:
                ratios.setdefault("NET_MARGIN", {})[p] = npf / rev
        elif rev is not None:   # DT ≤0 → biên LN không xác định
            for c in ("GROSS_MARGIN", "OPERATING_MARGIN", "NET_MARGIN"):
                flag(c, p, "non_positive_revenue")
        # Cap biên LN "không đại diện" (holdco: DT nhỏ, LN chủ yếu từ tài chính) + LN gộp > DT
        for c in ("NET_MARGIN", "OPERATING_MARGIN"):
            v = ratios.get(c, {}).get(p)
            if v is not None and abs(v) > 2:
                flag(c, p, "revenue_not_representative")
        gv = ratios.get("GROSS_MARGIN", {}).get(p)
        if gv is not None and (gv > 1.05 or gv < -1):
            flag("GROSS_MARGIN", p, "data_anomaly")

        # Point-in-time (BS cuối quý / BS cuối quý) — không cần bình quân, không có vấn
        # đề phương pháp luận annualize như ROE/ROA.
        td, eq = values.get("BS_TOTAL_DEBT", {}).get(p), values.get("BS_EQUITY", {}).get(p)
        if td is not None and eq and "DEBT_TO_EQUITY" in allowed:
            ratios.setdefault("DEBT_TO_EQUITY", {})[p] = td / eq
        ca, cl = values.get("BS_CURRENT_ASSETS", {}).get(p), values.get("BS_CURRENT_LIAB", {}).get(p)
        if ca is not None and cl and "CURRENT_RATIO" in allowed:
            ratios.setdefault("CURRENT_RATIO", {})[p] = ca / cl

        m = PERIOD_RE.match(p)
        prev_p = f"Q{m.group(1)}/{int(m.group(2)) - 1}"
        # Tăng trưởng YoY chỉ có nghĩa khi gốc DƯƠNG; gốc ≤0 → NULL+lý do (không chia abs → đảo dấu)
        rev_prev = values.get(rev_code, {}).get(prev_p)
        if rev is not None and rev_prev is not None:
            if rev_prev > 0 and "REVENUE_GROWTH" in allowed:
                ratios.setdefault("REVENUE_GROWTH", {})[p] = (rev - rev_prev) / rev_prev
            elif rev_prev <= 0:
                flag("REVENUE_GROWTH", p, "negative_base")
        npf_prev = values.get("IS_NET_PROFIT_PARENT", {}).get(prev_p)
        if npf is not None and npf_prev is not None:
            if npf_prev > 0 and "NET_PROFIT_GROWTH" in allowed:
                ratios.setdefault("NET_PROFIT_GROWTH", {})[p] = (npf - npf_prev) / npf_prev
            elif npf_prev <= 0:
                flag("NET_PROFIT_GROWTH", p, "negative_base")
    return ratios, reasons


def process_symbol(path: str, sym: str, ctype: str, dry_run: bool):
    """Trả về (fs_rows, ratio_rows, window) cho 1 mã."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    values: dict[str, dict[str, float]] = {}  # item_code -> {period: value}, toàn bộ lịch sử đọc được

    for stmt, sheet_name in SHEET_NAMES.items():
        if sheet_name not in wb.sheetnames:
            continue
        ws = wb[sheet_name]
        label_map = LABEL_MAPS.get((ctype, stmt), {})
        if not label_map:
            continue
        header_row, col_to_period = find_quarter_header(ws)
        if header_row is None:
            continue
        sheet_values = read_sheet_quarters(ws, label_map, header_row, col_to_period)
        for code, per_period in sheet_values.items():
            values.setdefault(code, {}).update(per_period)

    wb.close()

    rev_code = REVENUE_CODE[ctype]
    all_periods = sorted(values.get(rev_code, {}).keys(), key=quarter_sort_key, reverse=True)
    window = sorted(all_periods[:N_QUARTERS], key=quarter_sort_key)
    if not window:
        return [], [], []

    add_derived(values, window)
    ratios, reasons = compute_ratios(values, window, ctype)

    # Map lại item_code -> (statement, nhãn VN gốc); dựng từ LABEL_MAPS + derived cố định.
    # Nhãn derived khớp đúng chữ đã lưu ở tầng FY (buildStatementTable() bóc tiền tố "(derived)").
    DERIVED_LABELS = {
        "BS_EQUITY": ("BS", "(derived) TTS - Nợ PT"),
        "BS_EQUITY_PARENT": ("BS", "(derived) VCSH cổ đông mẹ"),
        "CF_FCF": ("CF", "(derived) OCF + capex"),
        "IS_OPERATING_PROFIT": ("IS", "(derived) LNTT - LN khác"),
    }
    code_to_info: dict[str, tuple[str, str]] = {c: (s, s) for c, s in DERIVED_LABELS.items()}
    for c, (s, lbl) in DERIVED_LABELS.items():
        code_to_info[c] = (s, lbl)
    for stmt, sheet_name in SHEET_NAMES.items():
        for label, code in LABEL_MAPS.get((ctype, stmt), {}).items():
            code_to_info[code] = (stmt, label)

    def _qend(p):   # "Q4/2025" -> ngày cuối quý (cột period_end sort đúng ở DB)
        m = PERIOD_RE.match(p)
        return f"{m.group(2)}-{ {'1':'03-31','2':'06-30','3':'09-30','4':'12-31'}[m.group(1)] }"

    fs_rows = []
    for code, per_period in values.items():
        info = code_to_info.get(code)
        if not info:
            continue
        stmt, label = info
        for p in window:
            if p in per_period:
                fs_rows.append({
                    "symbol": sym, "company_type": ctype, "statement": stmt,
                    "period": p, "period_type": "QUARTER", "item_code": code,
                    "item_label_vi": label, "value": per_period[p],
                    "is_derived": code in DERIVED_LABELS, "period_end": _qend(p),
                })

    UNIT_X = {"DEBT_TO_EQUITY", "CURRENT_RATIO"}  # còn lại (margin/growth) là pct

    ratio_rows = []
    for code, per_period in ratios.items():
        for p, v in per_period.items():
            unit = "x" if code in UNIT_X else "pct"
            # na_reason luôn có mặt (None nếu bình thường) — batch PostgREST đòi mọi row cùng key.
            ratio_rows.append({
                "symbol": sym, "company_type": ctype, "period": p, "period_type": "QUARTER",
                "ratio_code": code, "value": v, "unit": unit, "formula_version": "v1",
                "na_reason": reasons.get(code, {}).get(p), "period_end": _qend(p),
            })

    return fs_rows, ratio_rows, window


def prune_stale_quarters(sb, sym: str, window: list[str]) -> None:
    """Xoá dữ liệu QUARTER của `sym` nằm NGOÀI rolling window hiện tại (quý đã bị
    "rớt" ra khỏi 5-quý-gần-nhất qua các lần chạy trước). Query period thực có trong
    DB rồi mới xoá đúng phần chênh lệch — an toàn hơn xoá theo NOT IN trực tiếp
    (period có ký tự "/" dễ vỡ cú pháp filter PostgREST)."""
    for table in ("financial_statements", "financial_ratios"):
        existing = sb.table(table).select("period").eq("symbol", sym).eq("period_type", "QUARTER").execute().data
        stale = sorted({r["period"] for r in existing} - set(window))
        if stale:
            sb.table(table).delete().eq("symbol", sym).eq("period_type", "QUARTER").in_("period", stale).execute()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", type=str, help="Danh sách mã, phân cách dấu phẩy (test)")
    ap.add_argument("--all", action="store_true", help="Chạy toàn bộ 403 file trong EXCEL_DIR")
    ap.add_argument("--dry-run", action="store_true", help="Không ghi DB, chỉ in ra")
    args = ap.parse_args()

    sb = get_client()

    ticker_rows = sb.table("tickers").select("symbol,company_type").execute().data
    ctype_map = {r["symbol"]: r["company_type"] for r in ticker_rows if r.get("company_type")}

    all_files = [f for d in EXCEL_DIRS for f in glob.glob(os.path.join(d, "*.xlsx"))]
    if args.symbols:
        wanted = set(s.strip().upper() for s in args.symbols.split(","))
        files = [f for f in all_files if os.path.basename(f).split("_BCTC_")[0].upper() in wanted]
    elif args.all:
        files = sorted(all_files)
    else:
        print("Cần chỉ định --symbols A,B,C hoặc --all")
        return

    total_fs = total_ratio = 0
    skipped = []
    for i, path in enumerate(files, 1):
        sym = os.path.basename(path).split("_BCTC_")[0].upper()
        ctype = ctype_map.get(sym)
        if not ctype:
            skipped.append(sym)
            continue
        try:
            fs_rows, ratio_rows, window = process_symbol(path, sym, ctype, args.dry_run)
        except Exception as e:
            print(f"[{i}/{len(files)}] {sym}: LỖI — {e}")
            skipped.append(sym)
            continue

        if not window:
            print(f"[{i}/{len(files)}] {sym} ({ctype}): không tìm thấy quý nào có dữ liệu")
            continue

        print(f"[{i}/{len(files)}] {sym} ({ctype}): window={window}, {len(fs_rows)} fs rows, {len(ratio_rows)} ratio rows")

        if not args.dry_run:
            if fs_rows:
                upsert_batch(sb, "financial_statements", fs_rows, on_conflict="symbol,statement,period,item_code")
            if ratio_rows:
                upsert_batch(sb, "financial_ratios", ratio_rows, on_conflict="symbol,period,ratio_code")
            # Dọn quý rơi ra ngoài rolling window (script chỉ upsert window hiện tại,
            # KHÔNG tự xoá — nếu không dọn, dữ liệu QUARTER tích luỹ vô hạn theo thời
            # gian và tầng đọc (financial-report.ts, không .limit()) sẽ tải cả lịch sử
            # thừa mỗi lần gọi Agent).
            prune_stale_quarters(sb, sym, window)

        total_fs += len(fs_rows)
        total_ratio += len(ratio_rows)

    print("=" * 55)
    print(f"HOÀN THÀNH — financial_statements: {total_fs} rows, financial_ratios: {total_ratio} rows")
    if skipped:
        print(f"Bỏ qua ({len(skipped)}): {', '.join(skipped)}")


if __name__ == "__main__":
    main()

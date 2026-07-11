#!/usr/bin/env python3
"""ETL BCTC Vietcap -> financial_statements (line-items chuẩn hóa) + financial_ratios.
Phase 1 (classify) + 2 (ingest) + 4 (ratios). Đa loại hình, long-form.

Dùng:
  etl_financials.py FPT MBB SSI BVH         # dry-run 4 mã (mỗi loại 1)
  etl_financials.py --all                   # dry-run full 401
  etl_financials.py FPT MBB SSI BVH --write # ghi DB (cần đã apply migration)
"""
import os, sys, glob, json, urllib.request, urllib.parse
import openpyxl

URL = "https://fkwsvyzguehtsjpwmttb.supabase.co"
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
WRITE = "--write" in sys.argv
ALL   = "--all" in sys.argv
# Sàn: --exchange HOSE|HNX|UPCOM (mặc định HOSE). Quyết định folder xlsx + giá trị tickers.exchange.
def _argval(flag, default):
    for i, a in enumerate(sys.argv):
        if a == flag and i + 1 < len(sys.argv): return sys.argv[i + 1]
        if a.startswith(flag + "="): return a.split("=", 1)[1]
    return default
EXCHANGE = _argval("--exchange", "HOSE").upper()
DIR = _argval("--dir", f"/Users/daoxuanlong/bctc_vietcap/{EXCHANGE}")
def _positional():
    out, skip = [], False
    for i, a in enumerate(sys.argv[1:], 1):
        if skip:                       # giá trị của flag --exchange/--dir trước đó
            skip = False; continue
        if a in ("--exchange", "--dir"):
            skip = True; continue
        if a.startswith("-"):          # cờ (--write/--all/--exchange=.../--dir=...)
            continue
        out.append(a)
    return out
ONLY = _positional()
YEARS_SHOW = {2024, 2025}   # in dry-run cho gọn

def period_end(period, period_type):
    """Ngày kết thúc kỳ (để cột period_end sort/range đúng ở DB). FY→31/12, QUÝ→cuối quý."""
    if period_type == "FY":
        return f"{period}-12-31"
    if period_type == "QUARTER":
        q, y = period[1], period.split("/")[1]
        return f"{y}-{ {'1':'03-31','2':'06-30','3':'09-30','4':'12-31'}[q] }"
    return period  # CURRENT/TTM: period đã là ngày

def find_file(sym):
    """Tên file có kèm ngày xuất (HOSE _27_06_2026, HNX _04_07_2026...) -> glob theo mã."""
    fs = glob.glob(os.path.join(DIR, f"{sym}_*.xlsx"))
    if not fs:
        raise FileNotFoundError(f"{sym}: không thấy xlsx trong {DIR}")
    return sorted(fs)[-1]   # bản mới nhất nếu có nhiều

# ─────────────────────────────────────────────────────────────────────────────
# MAP: company_type -> statement -> item_code -> [nhãn ứng viên] (exact, ưu tiên)
# ─────────────────────────────────────────────────────────────────────────────
MAP = {
 "normal": {
  "IS": {
   "IS_REVENUE":          ["Doanh thu thuần"],
   "IS_COGS":             ["Giá vốn hàng bán"],
   "IS_GROSS_PROFIT":     ["Lợi nhuận gộp"],
   "IS_FIN_INCOME":       ["Doanh thu hoạt động tài chính"],
   "IS_INTEREST_EXPENSE": ["Chi phí lãi vay"],
   "IS_SELLING_EXP":      ["Chi phí bán hàng"],
   "IS_ADMIN_EXP":        ["Chi phí quản lý doanh nghiệp"],
   "IS_OTHER_INCOME":     ["Thu nhập khác"],
   "IS_OTHER_EXPENSE":    ["Chi phí khác"],
   "IS_PRETAX":           ["Lãi/(lỗ) trước thuế"],
   "IS_NET_PROFIT":       ["Lãi/(lỗ) thuần sau thuế"],
   "IS_NET_PROFIT_PARENT":["Lợi nhuận của Cổ đông của Công ty mẹ"],
   "IS_EPS":              ["Lãi cơ bản trên cổ phiếu (VND)"],
   "IS_EPS_DILUTED":      ["Lãi trên cổ phiếu pha loãng (VND)"],
  },
  "BS": {
   "BS_CASH":           ["Tiền và tương đương tiền"],
   "BS_RECEIVABLES":    ["Các khoản phải thu"],
   "BS_INVENTORY":      ["Hàng tồn kho"],
   "BS_CURRENT_ASSETS": ["TÀI SẢN NGẮN HẠN"],
   "BS_TOTAL_ASSETS":   ["TỔNG CỘNG TÀI SẢN"],
   "BS_CURRENT_LIAB":   ["Nợ ngắn hạn"],
   "BS_TOTAL_DEBT":     ["NỢ PHẢI TRẢ"],
   "BS_NCI":            ["Lợi ích cổ đông không kiểm soát","Lợi ích của cổ đông thiểu số"],  # để tách VCSH mẹ
   "BS_BORROW_ST":      ["Vay và nợ thuê tài chính ngắn hạn","Vay ngắn hạn"],                # nợ vay CÓ LÃI (D/E chuẩn)
   "BS_BORROW_LT":      ["Vay và nợ thuê tài chính dài hạn","Vay dài hạn"],
  },
  "CF": {
   "CF_OPERATING":    ["Lưu chuyển tiền tệ ròng từ các hoạt động sản xuất kinh doanh"],
   "CF_CAPEX":        ["Tiền chi để mua sắm, xây dựng TSCĐ và các tài sản dài hạn khác"],
   "CF_DEPRECIATION": ["Khấu hao TSCĐ và BĐSĐT", "Khấu hao TSCĐ"],
   "CF_INVESTING":    ["Lưu chuyển tiền thuần từ hoạt động đầu tư"],
   "CF_FINANCING":    ["Lưu chuyển tiền thuần từ hoạt động tài chính"],
   "CF_NET":          ["Lưu chuyển tiền thuần trong kỳ"],
  },
 },
 "bank": {
  "IS": {
   "BANK_NII":            ["Thu nhập lãi thuần"],
   "BANK_INT_INCOME":     ["Thu nhập lãi và các khoản thu nhập tương tự"],
   "BANK_INT_EXPENSE":    ["Chi phí lãi và các chi phí tương tự"],
   "BANK_NET_FEE":        ["Lãi/Lỗ thuần từ hoạt động dịch vụ", "Lãi/(lỗ) thuần từ hoạt động dịch vụ"],
   "BANK_FEE_INCOME":     ["Thu nhập từ dịch vụ"],
   "BANK_TOI":            ["Tổng thu nhập hoạt động"],
   "BANK_OPEX":           ["Chi phí quản lý doanh nghiệp", "Chi phí hoạt động"],
   "BANK_PREPROVISION":   ["Lợi nhuận thuần hoạt động trước khi trích lập dự phòng",
                           "Lợi nhuận thuần hoạt động trước khi trích lập dự phòng tổn thất tín dụng"],
   "BANK_PROVISION":      ["Trích lập dự phòng tổn thất tín dụng", "Chi phí dự phòng rủi ro tín dụng"],
   "IS_PRETAX":           ["Tổng lợi nhuận/lỗ trước thuế", "Tổng lợi nhuận trước thuế"],
   "IS_NET_PROFIT":       ["Lợi nhuận sau thuế"],
   "IS_NET_PROFIT_PARENT":["Cổ đông của Công ty mẹ"],
   "IS_EPS":              ["Lãi cơ bản trên cổ phiếu (VND)"],
   "IS_EPS_DILUTED":      ["Lãi trên cổ phiếu pha loãng (VND)"],
  },
  "BS": {
   "BS_TOTAL_ASSETS":  ["TỔNG TÀI SẢN"],
   "BANK_LOANS":       ["Cho vay khách hàng"],
   "BANK_LOAN_RESERVE":["Dự phòng rủi ro cho vay khách hàng"],
   "BANK_DEPOSITS":    ["Tiền gửi của khách hàng"],
   "BANK_DEPOSIT_NHNN":["Tiền gửi tại Ngân hàng nhà nước Việt Nam"],
   "BANK_DEPOSIT_TCTD":["Tiền gửi tại các TCTD khác và cho vay các TCTD khác"],
   "BANK_SEC_TRADING": ["Chứng khoán kinh doanh"],
   "BANK_SEC_INVEST":  ["Chứng khoán đầu tư"],
   "BANK_BORROW_TCTD": ["Tiền gửi và vay các Tổ chức tín dụng khác"],
   "BANK_PAPER":       ["Phát hành giấy tờ có giá"],
   "BANK_GOV_DEBT":    ["Các khoản nợ chính phủ và NHNN Việt Nam"],
   "BS_TOTAL_DEBT":    ["TỔNG NỢ PHẢI TRẢ"],
   "BS_NCI":           ["Lợi ích cổ đông không kiểm soát","Lợi ích của cổ đông thiểu số"],
  },
  "CF": {
   "CF_OPERATING": ["Lưu chuyển tiền thuần từ các hoạt động sản xuất kinh doanh"],
   "CF_CAPEX":     ["Mua sắm TSCĐ"],
   "CF_INVESTING": ["Lưu chuyển tiền thuần từ hoạt động đầu tư"],
   "CF_FINANCING": ["Lưu chuyển tiền thuần từ hoạt động tài chính"],
   "CF_NET":       ["Lưu chuyển tiền thuần trong kỳ"],
  },
  "NOTE": {
   "NOTE_LOAN_G1": ["Nợ đủ tiêu chuẩn"],
   "NOTE_LOAN_G2": ["Nợ cần chú ý"],
   "NOTE_LOAN_G3": ["Nợ dưới tiêu chuẩn"],
   "NOTE_LOAN_G4": ["Nợ nghi ngờ"],
   "NOTE_LOAN_G5": ["Nợ xấu có khả năng mất vốn"],
   "NOTE_CASA":              ["Tiền gửi không kỳ hạn"],
   "NOTE_DEPOSIT_CLASSIFIED":["Các khoản tiền gửi phân theo nhóm khách hàng"],
  },
 },
 "securities": {
  "IS": {
   "IS_REVENUE":          ["Doanh thu thuần về hoạt động kinh doanh", "DOANH THU HOẠT ĐỘNG"],
   "IS_GROSS_PROFIT":     ["LỢI NHUẬN GỘP"],
   "SEC_BROKERAGE":       ["Doanh thu nghiệp vụ môi giới chứng khoán"],
   "SEC_MARGIN_INCOME":   ["Lãi từ các khoản cho vay và phải thu"],
   "IS_INTEREST_EXPENSE": ["Chi phí lãi vay"],
   "IS_OPERATING_DIRECT": ["KẾT QUẢ HOẠT ĐỘNG"],
   "IS_PRETAX":           ["TỔNG LỢI NHUẬN KẾ TOÁN TRƯỚC THUẾ"],
   "IS_NET_PROFIT":       ["LỢI NHUẬN KẾ TOÁN SAU THUẾ"],
   "IS_NET_PROFIT_PARENT":["Lợi nhuận sau thuế phân bổ cho chủ sở hữu"],
   "IS_EPS":              ["Lãi cơ bản trên cổ phiếu (VND)"],
   "IS_EPS_DILUTED":      ["Lãi trên cổ phiếu pha loãng (VND)"],
  },
  "BS": {
   "BS_CURRENT_ASSETS": ["TÀI SẢN NGẮN HẠN"],
   "BS_TOTAL_ASSETS":   ["TỔNG CỘNG TÀI SẢN"],
   "BS_CURRENT_LIAB":   ["Nợ phải trả ngắn hạn", "Nợ ngắn hạn"],
   "BS_TOTAL_DEBT":     ["NỢ PHẢI TRẢ"],
   "SEC_MARGIN_LOANS":  ["Các khoản cho vay"],
   "BS_NCI":            ["Lợi ích cổ đông không kiểm soát","Lợi ích của cổ đông thiểu số"],
   "BS_BORROW_ST":      ["Vay và nợ thuê tài chính ngắn hạn","Vay ngắn hạn"],
   "BS_BORROW_LT":      ["Vay và nợ thuê tài chính dài hạn","Vay dài hạn"],
  },
  "CF": {
   "CF_OPERATING": ["Lưu chuyển thuần từ hoạt động kinh doanh"],
   "CF_CAPEX":     ["Tiền chi để mua sắm, xây dựng TSCĐ, BĐSĐT và các tài sản dài hạn khác"],
   "CF_INVESTING": ["Lưu chuyển tiền thuần từ hoạt động đầu tư"],
   "CF_FINANCING": ["Lưu chuyển thuần từ hoạt động tài chính"],
   "CF_NET":       ["LƯU CHUYỂN TIỀN THUẦN TRONG KỲ", "Lưu chuyển tiền thuần trong kỳ"],
  },
 },
 "insurance": {
  "IS": {
   "IS_REVENUE":          ["Doanh thu thuần từ hoạt động kinh doanh bảo hiểm"],
   "INS_PREMIUM_NET":     ["Doanh thu phí bảo hiểm thuần"],
   "IS_GROSS_PROFIT":     ["Lợi nhuận gộp hoạt động kinh doanh bảo hiểm"],
   "INS_CLAIM":           ["Tổng chi trực tiếp hoạt động kinh doanh bảo hiểm"],
   "INS_UNDERWRITING":    ["Lợi nhuận thuần hoạt động kinh doanh bảo hiểm"],
   "INS_FIN_RESULT":      ["Lợi nhuận hoạt động tài chính"],
   "IS_OTHER_INCOME":     ["Thu nhập khác"],
   "IS_OTHER_EXPENSE":    ["Chi phí khác"],
   "IS_PRETAX":           ["Tổng lợi nhuận kế toán trước thuế"],
   "IS_NET_PROFIT":       ["Lợi nhuận sau thuế thu nhập doanh nghiệp"],
   "IS_NET_PROFIT_PARENT":["Lợi nhuận sau thuế của chủ sở hữu, tập đoàn"],
   "IS_EPS":              ["Lãi cơ bản trên cổ phiếu (VND)"],
   "IS_EPS_DILUTED":      ["Lãi trên cổ phiếu pha loãng (VND)"],
  },
  "BS": {
   "BS_CASH":           ["Tiền và các khoản tương đương tiền"],
   "BS_CURRENT_ASSETS": ["TÀI SẢN NGẮN HẠN"],
   "BS_TOTAL_ASSETS":   ["TỔNG CỘNG TÀI SẢN"],
   "BS_CURRENT_LIAB":   ["Nợ ngắn hạn", "Nợ phải trả ngắn hạn"],
   "BS_TOTAL_DEBT":     ["NỢ PHẢI TRẢ"],
   "BS_NCI":            ["Lợi ích cổ đông không kiểm soát","Lợi ích của cổ đông thiểu số"],
  },
  "CF": {
   "CF_OPERATING": ["Lưu chuyển tiền thuần từ hoạt động kinh doanh"],
   "CF_CAPEX":     ["Tiền chi mua sắm, xây dựng TSCĐ và các tài sản dài hạn khác"],
   "CF_INVESTING": ["Lưu chuyển tiền thuần từ hoạt động đầu tư"],
   "CF_FINANCING": ["Lưu chuyển tiền thuần từ hoạt động tài chính"],
   "CF_NET":       ["Lưu chuyển tiền thuần trong kỳ"],
  },
 },
}

# ─────────────────────────────────────────────────────────────────────────────
def load_sheets(sym):
    f = find_file(sym)
    wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
    out = {}
    for sh in ["Balance Sheet","Income Statement","Cash Flow","Note"]:
        rows = list(wb[sh].iter_rows(values_only=True))
        hdr = rows[10]
        years = {ci:int(hdr[ci]) for ci in range(1,9)
                 if ci < len(hdr) and isinstance(hdr[ci],(int,float))}
        data = {}                                  # label -> {year:val} (first wins)
        for r in rows[11:]:
            l = r[0]
            if not isinstance(l,str): continue
            l = l.strip()
            if l in data: continue
            data[l] = {years[ci]: (r[ci] if isinstance(r[ci],(int,float)) else None) for ci in years}
        out[sh] = data
    return out

SHEET = {"IS":"Income Statement","BS":"Balance Sheet","CF":"Cash Flow","NOTE":"Note"}

def classify(sheets):
    is_lbl = set(sheets["Income Statement"].keys())
    if "Thu nhập lãi thuần" in is_lbl or "Tổng thu nhập hoạt động" in is_lbl:
        return "bank"
    if "Doanh thu thuần từ hoạt động kinh doanh bảo hiểm" in is_lbl or "Doanh thu phí bảo hiểm thuần" in is_lbl:
        return "insurance"
    if "DOANH THU HOẠT ĐỘNG" in is_lbl or "KẾT QUẢ HOẠT ĐỘNG" in is_lbl:
        return "securities"
    return "normal"

def pick(sheet_data, candidates):
    for c in candidates:
        if c in sheet_data:
            return c, sheet_data[c]
    return None, None

def extract(sym):
    sheets = load_sheets(sym)
    ctype = classify(sheets)
    cfg = MAP[ctype]
    # facts[code] = {year: value}, labels[code] = vn_label
    facts, labels = {}, {}
    for stmt, codes in cfg.items():
        sd = sheets[SHEET[stmt]]
        for code, cands in codes.items():
            lbl, series = pick(sd, cands)
            if series is not None:
                facts[(stmt, code)] = series
                labels[(stmt, code)] = lbl
    return ctype, facts, labels

def val(facts, stmt, code, yr):
    s = facts.get((stmt, code))
    return s.get(yr) if s else None

def extract_quarterly(sym, ctype):
    """Trích net profit / doanh thu theo QUÝ (cho TTM) -> financial_statements rows."""
    f=find_file(sym)
    wb=openpyxl.load_workbook(f, read_only=True, data_only=True)
    rows=list(wb["Income Statement"].iter_rows(values_only=True)); hdr=rows[10]
    quarters={ci:hdr[ci] for ci in range(9,len(hdr)) if isinstance(hdr[ci],str) and hdr[ci].startswith("Q")}
    data={}
    for r in rows[11:]:
        l=r[0]
        if isinstance(l,str) and l.strip() not in data: data[l.strip()]=r
    iscfg=MAP[ctype]["IS"]; out=[]
    for code in ["IS_NET_PROFIT_PARENT","IS_NET_PROFIT","IS_REVENUE","BANK_TOI"]:
        if code not in iscfg: continue
        for cand in iscfg[code]:
            if cand in data:
                r=data[cand]
                for ci,q in quarters.items():
                    v=r[ci]
                    if isinstance(v,(int,float)):
                        qq=q.split()
                        out.append(dict(symbol=sym,company_type=ctype,statement="IS",
                            period=f"{qq[0]}/{qq[1]}",period_type="QUARTER",item_code=code,
                            item_label_vi=cand,value=round(v,2),is_derived=False))
                break
    return out

# ─── Derived line-items ──────────────────────────────────────────────────────
def build_statement_rows(sym, ctype, facts, labels):
    """Trả về list financial_statements rows (annual FY)."""
    years = sorted({yr for s in facts.values() for yr in s})
    rows = []
    for (stmt, code), series in facts.items():
        for yr, v in series.items():
            if v is None: continue
            rows.append(dict(symbol=sym, company_type=ctype, statement=stmt,
                             period=str(yr), period_type="FY", item_code=code,
                             item_label_vi=labels[(stmt,code)], value=round(v,2),
                             is_derived=False))
    # Derived: BS_EQUITY = total_assets - total_debt
    for yr in years:
        ta = val(facts,"BS","BS_TOTAL_ASSETS",yr); td = val(facts,"BS","BS_TOTAL_DEBT",yr)
        if ta is not None and td is not None:
            eq_tot = ta - td
            rows.append(dict(symbol=sym,company_type=ctype,statement="BS",period=str(yr),
                period_type="FY",item_code="BS_EQUITY",item_label_vi="(derived) TTS - Nợ PT",
                value=round(eq_tot,2),is_derived=True))
            # VCSH cổ đông MẸ = VCSH tổng − lợi ích cổ đông thiểu số (NCI) → dùng cho ROE chuẩn
            nci = val(facts,"BS","BS_NCI",yr) or 0
            rows.append(dict(symbol=sym,company_type=ctype,statement="BS",period=str(yr),
                period_type="FY",item_code="BS_EQUITY_PARENT",item_label_vi="(derived) VCSH cổ đông mẹ",
                value=round(eq_tot-nci,2),is_derived=True))
        # Nợ vay CÓ LÃI = vay NH + vay DH (D/E tài chính, tách khỏi tổng nợ phải trả)
        bst = val(facts,"BS","BS_BORROW_ST",yr); blt = val(facts,"BS","BS_BORROW_LT",yr)
        if bst is not None or blt is not None:
            rows.append(dict(symbol=sym,company_type=ctype,statement="BS",period=str(yr),
                period_type="FY",item_code="BS_INTEREST_DEBT",item_label_vi="(derived) Nợ vay NH+DH",
                value=round((bst or 0)+(blt or 0),2),is_derived=True))
        # IS_OPERATING_PROFIT = direct (CK) else LNTT - (other_income - other_expense)
        direct = val(facts,"IS","IS_OPERATING_DIRECT",yr)
        pretax = val(facts,"IS","IS_PRETAX",yr)
        if direct is not None:
            op = direct
        elif pretax is not None:
            oi = val(facts,"IS","IS_OTHER_INCOME",yr) or 0
            oe = val(facts,"IS","IS_OTHER_EXPENSE",yr) or 0
            op = pretax - (oi + oe)        # oe đã âm trong file -> +oe
        else:
            op = None
        if op is not None:
            rows.append(dict(symbol=sym,company_type=ctype,statement="IS",period=str(yr),
                period_type="FY",item_code="IS_OPERATING_PROFIT",
                item_label_vi="(derived) LNTT - LN khác",value=round(op,2),is_derived=True))
        # CF_FCF = operating + capex
        ocf = val(facts,"CF","CF_OPERATING",yr); cap = val(facts,"CF","CF_CAPEX",yr)
        if ocf is not None and cap is not None:
            rows.append(dict(symbol=sym,company_type=ctype,statement="CF",period=str(yr),
                period_type="FY",item_code="CF_FCF",item_label_vi="(derived) OCF + capex",
                value=round(ocf+cap,2),is_derived=True))
    return rows

# ─── Ratios (không cần giá) ──────────────────────────────────────────────────
def div(a,b):
    return round(a/b,4) if (a is not None and b not in (None,0)) else None

def build_ratio_rows(sym, ctype, facts):
    years = sorted({yr for s in facts.values() for yr in s})
    out = []
    def g(stmt,code,yr): return val(facts,stmt,code,yr)
    for yr in years:
        ta = g("BS","BS_TOTAL_ASSETS",yr); td = g("BS","BS_TOTAL_DEBT",yr)
        eq = (ta-td) if (ta is not None and td is not None) else None
        nci = g("BS","BS_NCI",yr) or 0
        eq_par = (eq - nci) if eq is not None else None          # VCSH cổ đông MẸ (cho ROE)
        _bst=g("BS","BS_BORROW_ST",yr); _blt=g("BS","BS_BORROW_LT",yr)   # nợ vay có lãi (D/E, ROIC)
        idebt = ((_bst or 0)+(_blt or 0)) if (_bst is not None or _blt is not None) else None
        npp = g("IS","IS_NET_PROFIT_PARENT",yr) or g("IS","IS_NET_PROFIT",yr)
        net_tot = g("IS","IS_NET_PROFIT",yr)                     # LNST tổng (gồm NCI) cho ROA
        rev = g("IS","IS_REVENUE",yr) or g("IS","BANK_TOI",yr)   # bank revenue = TOI
        pretax = g("IS","IS_PRETAX",yr); inte = g("IS","IS_INTEREST_EXPENSE",yr)
        ebit = (pretax + abs(inte)) if (pretax is not None and inte is not None) else None
        # Bình quân đầu-cuối kỳ (chuẩn quốc tế cho ROE/ROA); thiếu kỳ trước → dùng cuối kỳ
        ta_p = g("BS","BS_TOTAL_ASSETS",yr-1); td_p = g("BS","BS_TOTAL_DEBT",yr-1)
        eq_p = (ta_p-td_p) if (ta_p is not None and td_p is not None) else None
        eqpar_p = (eq_p - (g("BS","BS_NCI",yr-1) or 0)) if eq_p is not None else None
        eqpar_avg = ((eq_par+eqpar_p)/2) if (eq_par is not None and eqpar_p is not None) else eq_par
        ta_avg = ((ta+ta_p)/2) if (ta is not None and ta_p is not None) else ta
        rev_ok = (rev is not None and rev > 0)   # biên LN vô nghĩa nếu DT ≤0
        R = {}; flagged = {}   # flagged[code]=na_reason -> emit dòng NULL để ghi đè số rác cũ
        R["ROE"]            = (div(npp,eqpar_avg), "pct")   # LN cổ đông mẹ / VCSH mẹ BÌNH QUÂN
        R["ROA"]            = (div(net_tot,ta_avg), "pct")  # LNST tổng / TTS BÌNH QUÂN (khớp tầng)
        R["DEBT_TO_EQUITY"] = (div(td,eq), "x")             # Nợ PHẢI TRẢ / VCSH (cơ cấu vốn)
        if idebt is not None and eq:                        # Nợ VAY có lãi / VCSH (đòn bẩy tài chính)
            R["DEBT_TO_EQUITY_IB"] = (div(idebt,eq), "x")
        R["NET_MARGIN"]     = (div(npp,rev), "pct")
        R["ASSET_TURNOVER"] = (div(rev,ta), "x")
        # Tăng trưởng YoY chỉ có nghĩa khi gốc DƯƠNG; gốc ≤0 → đảo dấu vô nghĩa → NULL+lý do
        rev_p=g("IS","IS_REVENUE",yr-1) or g("IS","BANK_TOI",yr-1)
        npp_p=g("IS","IS_NET_PROFIT_PARENT",yr-1) or g("IS","IS_NET_PROFIT",yr-1)
        if rev is not None and rev_p is not None:
            if rev_p > 0: R["REVENUE_GROWTH"]=(div(rev-rev_p,rev_p),"pct")
            else: flagged["REVENUE_GROWTH"]="negative_base"
        if npp is not None and npp_p is not None:
            if npp_p > 0: R["NET_PROFIT_GROWTH"]=(div(npp-npp_p,npp_p),"pct")
            else: flagged["NET_PROFIT_GROWTH"]="negative_base"
        epsd=g("IS","IS_EPS_DILUTED",yr)
        if epsd: R["EPS_DILUTED"]=(round(epsd,0),"vnd")
        # ROIC (phi tài chính): NOPAT / vốn đầu tư
        if ctype in ("normal","securities","insurance") and ebit is not None and pretax:
            nit=g("IS","IS_NET_PROFIT",yr)
            taxrate=min(max((pretax-nit)/pretax,0),0.4) if (nit is not None and pretax) else 0
            cash=g("BS","BS_CASH",yr) or 0
            cap_debt = idebt if idebt is not None else td       # vốn đầu tư = nợ VAY + VCSH - tiền
            ic=(cap_debt+eq-cash) if (cap_debt is not None and eq is not None) else None
            R["ROIC"]=(div(ebit*(1-taxrate),ic),"pct")
        gp = g("IS","IS_GROSS_PROFIT",yr)
        R["GROSS_MARGIN"]   = (div(gp,rev), "pct")
        op = None
        d = g("IS","IS_OPERATING_DIRECT",yr)
        if d is not None: op=d
        elif pretax is not None:
            oi=g("IS","IS_OTHER_INCOME",yr) or 0; oe=g("IS","IS_OTHER_EXPENSE",yr) or 0
            op=pretax-(oi+oe)
        R["OPERATING_MARGIN"] = (div(op,rev), "pct")
        if ctype != "bank":
            ca=g("BS","BS_CURRENT_ASSETS",yr); cl=g("BS","BS_CURRENT_LIAB",yr)
            R["CURRENT_RATIO"]=(div(ca,cl),"x")
            inv=g("BS","BS_INVENTORY",yr)
            if inv is not None: R["QUICK_RATIO"]=(div((ca-inv) if ca else None,cl),"x")
            rec=g("BS","BS_RECEIVABLES",yr)
            R["RECEIVABLES_TURNOVER"]=(div(rev,rec),"x")
            cogs=g("IS","IS_COGS",yr)
            if cogs is not None and g("BS","BS_INVENTORY",yr):
                R["INVENTORY_TURNOVER"]=(div(abs(cogs),inv),"x")
            if inte is not None:
                R["INTEREST_COVERAGE"]=(div(ebit,abs(inte)),"x")
        ocf=g("CF","CF_OPERATING",yr); ni=g("IS","IS_NET_PROFIT",yr)
        R["OCF_TO_NI"]=(div(ocf,ni),"x")
        if ctype=="bank":
            nii=g("IS","BANK_NII",yr); toi=g("IS","BANK_TOI",yr); opex=g("IS","BANK_OPEX",yr)
            loans=g("BS","BANK_LOANS",yr); dep=g("BS","BANK_DEPOSITS",yr)
            res=g("BS","BANK_LOAN_RESERVE",yr); prov=g("IS","BANK_PROVISION",yr)
            intinc=g("IS","BANK_INT_INCOME",yr); intexp=g("IS","BANK_INT_EXPENSE",yr)
            EAC=("BANK_LOANS","BANK_DEPOSIT_NHNN","BANK_DEPOSIT_TCTD","BANK_SEC_TRADING","BANK_SEC_INVEST")
            ea=sum(x for x in (g("BS",c,yr) for c in EAC) if x is not None) or None
            eap=sum(x for x in (g("BS",c,yr-1) for c in EAC) if x is not None) or None
            ea_avg=(ea+eap)/2 if (ea and eap) else ea                 # TS sinh lãi bình quân
            ibl=[g("BS",c,yr) for c in ("BANK_DEPOSITS","BANK_BORROW_TCTD","BANK_PAPER","BANK_GOV_DEBT")]
            ibl=sum(x for x in ibl if x is not None) or None
            R["NIM"]=(div(nii,ea_avg),"pct")                          # NIM chuẩn: NII / TS sinh lãi BQ
            R["YOEA"]=(div(intinc,ea_avg),"pct")
            R["COF"]=(div(abs(intexp) if intexp is not None else None,ibl),"pct")
            R["CIR"]=(div(abs(opex) if opex else None,toi),"pct")
            R["LDR"]=(div(loans,dep),"x")
            R["LAR"]=(div(loans,ta),"pct")
            g3=g("NOTE","NOTE_LOAN_G3",yr); g4=g("NOTE","NOTE_LOAN_G4",yr); g5=g("NOTE","NOTE_LOAN_G5",yr)
            g1=g("NOTE","NOTE_LOAN_G1",yr); g2=g("NOTE","NOTE_LOAN_G2",yr)
            if None not in (g1,g2,g3,g4,g5):
                npl=g3+g4+g5; tot=g1+g2+npl
                R["NPL"]=(div(npl,tot),"pct")
                if res is not None: R["NPL_COVERAGE"]=(div(abs(res),npl),"pct")
            casa=g("NOTE","NOTE_CASA",yr); depc=g("NOTE","NOTE_DEPOSIT_CLASSIFIED",yr)
            R["CASA"]=(div(casa,depc),"pct")
            if prov is not None and loans: R["CREDIT_COST"]=(div(abs(prov),loans),"pct")
        if ctype=="securities":
            mg=g("BS","SEC_MARGIN_LOANS",yr)
            if mg is not None and eq: R["MARGIN_TO_EQUITY"]=(div(mg,eq),"x")
        if ctype=="insurance":
            claim=g("IS","INS_CLAIM",yr); prem=g("IS","INS_PREMIUM_NET",yr)
            uw=g("IS","INS_UNDERWRITING",yr)
            if claim is not None and prem: R["CLAIM_RATIO"]=(div(abs(claim),prem),"pct")
            # Combined ratio = 1 - LN thuần nghiệp vụ / phí thuần (>100% = lỗ nghiệp vụ)
            if uw is not None and prem: R["COMBINED_RATIO"]=(round(1-uw/prem,4),"pct")
        # ── Guard mẫu số: ratio trên VCSH≤0 / DT≤0 là KHÔNG XÁC ĐỊNH → NULL+lý do ──
        if eqpar_avg is not None and eqpar_avg <= 0 and "ROE" in R:
            R["ROE"]=(None,"pct"); flagged["ROE"]="negative_equity"
        if eq is not None and eq <= 0 and "ROIC" in R:
            R["ROIC"]=(None,"pct"); flagged["ROIC"]="negative_equity"
        if rev is not None and not rev_ok:
            for c in ("NET_MARGIN","GROSS_MARGIN","OPERATING_MARGIN"):
                if c in R: R[c]=(None,"pct"); flagged[c]="non_positive_revenue"
        # Cap biên LN "không đại diện": DT dương nhưng quá nhỏ so với LN (holdco, LN từ tài chính)
        for c in ("NET_MARGIN","OPERATING_MARGIN"):
            v=R.get(c,(None,))[0]
            if v is not None and abs(v)>2:   # >200% → DT không đại diện cho quy mô LN
                R[c]=(None,"pct"); flagged[c]="revenue_not_representative"
        gv=R.get("GROSS_MARGIN",(None,))[0]
        if gv is not None and (gv>1.05 or gv<-1):   # LN gộp không thể vượt DT
            R["GROSS_MARGIN"]=(None,"pct"); flagged["GROSS_MARGIN"]="data_anomaly"
        # ROE/ROIC |>300%| = mẫu số gần 0 (VCSH kiệt / net-cash IC bé) → artifact, không phải suất sinh lời thật
        for c in ("ROE","ROIC"):
            v=R.get(c,(None,))[0]
            if v is not None and abs(v)>3:
                R[c]=(None,"pct"); flagged[c]="outlier_small_denominator"
        for code,(v,unit) in R.items():
            if v is None: continue
            out.append(dict(symbol=sym,company_type=ctype,period=str(yr),period_type="FY",
                ratio_code=code,value=v,unit=unit,formula_version="v1",na_reason=None))
        # Emit dòng NULL cho ratio bị gắn cờ (ghi đè giá trị rác đã lưu trước đó)
        for code,reason in flagged.items():
            out.append(dict(symbol=sym,company_type=ctype,period=str(yr),period_type="FY",
                ratio_code=code,value=None,unit="pct",formula_version="v1",na_reason=reason))
    return out

# ─── Tickers helpers (đăng ký mã mới cho sàn HNX/UPCOM) ──────────────────────
def fetch_existing_tickers():
    """Set các symbol đã có trong bảng tickers (phân trang qua PostgREST 1000-cap)."""
    have, off = set(), 0
    while True:
        req = urllib.request.Request(f"{URL}/rest/v1/tickers?select=symbol&limit=1000&offset={off}")
        req.add_header("apikey", KEY); req.add_header("Authorization", "Bearer " + KEY)
        d = json.load(urllib.request.urlopen(req))
        if not d: break
        have |= {r["symbol"] for r in d}; off += 1000
        if off > 20000: break
    return have

def fetch_names(symbols):
    """symbol -> tên công ty (organName) từ Vietcap getAll. Fallback: chính mã."""
    try:
        req = urllib.request.Request(
            "https://trading.vietcap.com.vn/api/price/symbols/getAll",
            headers={"User-Agent": "Mozilla/5.0"})
        d = json.load(urllib.request.urlopen(req, timeout=30))
        by = {x["symbol"]: (x.get("organName") or x.get("enOrganName") or x["symbol"]) for x in d}
    except Exception as e:
        print("  WARN fetch_names:", e); by = {}
    return {s: by.get(s, s) for s in symbols}

# ─── REST write ──────────────────────────────────────────────────────────────
def post(table, rows, conflict):
    ok=err=0
    for i in range(0,len(rows),500):
        ch=rows[i:i+500]; data=json.dumps(ch).encode()
        done=False
        for attempt in range(4):                     # retry cho timeout mạng
            req=urllib.request.Request(f"{URL}/rest/v1/{table}?on_conflict={conflict}",data=data,method="POST")
            req.add_header("apikey",KEY); req.add_header("Authorization","Bearer "+KEY)
            req.add_header("Content-Type","application/json")
            req.add_header("Prefer","resolution=merge-duplicates,return=minimal")
            try:
                urllib.request.urlopen(req,timeout=60); ok+=len(ch); done=True; break
            except urllib.error.HTTPError as e:
                err+=len(ch); print("  ERR",table,e.read().decode()[:200]); done=True; break
            except Exception as e:
                if attempt==3: print("  RETRY-FAIL",table,i,e)
                else: continue
        if not done: err+=len(ch)
    return ok,err

# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    syms=[os.path.basename(f).split("_")[0] for f in sorted(glob.glob(os.path.join(DIR,"*.xlsx")))]
    if not ALL and ONLY: syms=[s for s in syms if s in ONLY]
    print(f"{len(syms)} mã | mode={'WRITE' if WRITE else 'DRY-RUN'}")
    all_stmt=[]; all_ratio=[]; ctype_rows=[]; bytype={}
    for s in syms:
        try:
            ctype,facts,labels=extract(s)
            bytype[ctype]=bytype.get(ctype,0)+1
            ctype_rows.append({"symbol":s,"company_type":ctype})
            stmt=build_statement_rows(s,ctype,facts,labels)
            stmt+=extract_quarterly(s,ctype)          # net profit/DT theo quý (TTM)
            ratio=build_ratio_rows(s,ctype,facts)
            all_stmt+=stmt; all_ratio+=ratio
            if not ALL and len(syms)<=6:
                print(f"\n===== {s} ({ctype}) — {len(stmt)} line-items, {len(ratio)} ratios =====")
                for yr in sorted(YEARS_SHOW):
                    rs={r["ratio_code"]:r["value"] for r in ratio if r["period"]==str(yr)}
                    if rs: print(f"  [{yr}] "+"  ".join(f"{k}={v}" for k,v in sorted(rs.items())))
        except Exception as e:
            print(f"  FAIL {s}: {e}")
    for r in all_stmt: r["period_end"] = period_end(r["period"], r["period_type"])
    for r in all_ratio: r["period_end"] = period_end(r["period"], r["period_type"])
    print(f"\nTỔNG: statements={len(all_stmt)}  ratios={len(all_ratio)}  | phân loại={bytype}")
    if not WRITE:
        print("\n[DRY-RUN] chưa ghi. Thêm --write (sau khi apply migration).")
        return
    if not KEY: print("Thiếu SUPABASE_SERVICE_KEY"); return
    # ── Tickers: INSERT mã mới (sàn HNX/UPCOM chưa có), PATCH company_type mã đã có ──
    have = fetch_existing_tickers()
    new_syms = [r["symbol"] for r in ctype_rows if r["symbol"] not in have]
    old_syms = [r for r in ctype_rows if r["symbol"] in have]
    if new_syms:
        names = fetch_names(new_syms)
        ct = {r["symbol"]: r["company_type"] for r in ctype_rows}
        new_rows = [dict(symbol=s, name=names[s], exchange=EXCHANGE,
                         company_type=ct[s], is_active=True) for s in new_syms]
        print(f"\n--- INSERT {len(new_rows)} tickers mới (exchange={EXCHANGE}) ---")
        print("  ", post("tickers", new_rows, "symbol"))
    print(f"\n--- PATCH company_type cho {len(old_syms)} mã đã có ---")
    for r in old_syms:
        q=f"/rest/v1/tickers?symbol=eq.{urllib.parse.quote(r['symbol'])}"
        req=urllib.request.Request(URL+q,data=json.dumps({"company_type":r["company_type"]}).encode(),method="PATCH")
        req.add_header("apikey",KEY); req.add_header("Authorization","Bearer "+KEY)
        req.add_header("Content-Type","application/json"); req.add_header("Prefer","return=minimal")
        try: urllib.request.urlopen(req)
        except Exception as e: print("  ERR ctype",r["symbol"],e)
    print("  done")
    print("--- Ghi financial_statements ---"); print("  ",post("financial_statements",all_stmt,"symbol,statement,period,item_code"))
    print("--- Ghi financial_ratios ---");     print("  ",post("financial_ratios",all_ratio,"symbol,period,ratio_code"))

if __name__=="__main__":
    main()

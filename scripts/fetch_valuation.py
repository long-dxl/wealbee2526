#!/usr/bin/env python3
"""Khối ĐỊNH GIÁ cho full HOSE — dùng Trading.price_board (BULK, né rate limit).
price_board cho: giá hiện tại (match_price) + số CP lưu hành (listed_share).
Tính P/E,P/B,P/S,BVPS,MARKET_CAP,FCF_YIELD bằng LN/VCSH/DT/FCF (FY mới nhất) từ DB.

Dùng: fetch_valuation.py FPT MBB SSI BVH        # dry-run
      fetch_valuation.py --all --write          # full + ghi
"""
import os, sys, json, glob, time, urllib.request
import warnings; warnings.filterwarnings("ignore")
import contextlib, io

URL="https://fkwsvyzguehtsjpwmttb.supabase.co"
KEY=os.environ["SUPABASE_SERVICE_KEY"]
WRITE="--write" in sys.argv; ALL="--all" in sys.argv
def _arg(f,d):
    for i,a in enumerate(sys.argv):
        if a==f and i+1<len(sys.argv): return sys.argv[i+1]
        if a.startswith(f+"="): return a.split("=",1)[1]
    return d
EXCHANGE=_arg("--exchange","HOSE").upper()
DIR=_arg("--dir", f"/Users/daoxuanlong/bctc_vietcap/{EXCHANGE}")
ASOF=_arg("--asof","2026-07-04")
def _positional():
    out,skip=[],False
    for a in sys.argv[1:]:
        if skip: skip=False; continue
        if a in ("--exchange","--dir","--asof"): skip=True; continue
        if a.startswith("-"): continue
        out.append(a)
    return out
ONLY=_positional()
CHUNK=50

with contextlib.redirect_stdout(io.StringIO()):
    from vnstock import Trading

def db_get(path):
    r=urllib.request.Request(URL+path)
    r.add_header("apikey",KEY); r.add_header("Authorization","Bearer "+KEY)
    with urllib.request.urlopen(r) as resp: return json.load(resp)

def _qkey(p):  # "Q1/2025" -> (2025,1)
    q,y=p.split("/"); return (int(y), int(q[1]))

def load_financials(syms):
    """Bulk: {symbol: {net_profit(FY), equity, revenue(FY), fcf, ttm_np, ttm_rev, fy}}.
    TTM = tổng 4 quý gần nhất (net profit & doanh thu). Equity ưu tiên BS_EQUITY_PARENT
    (loại NCI — VCSH tổng gồm cả lợi ích cổ đông thiểu số không thuộc về cổ đông sở hữu
    CP, chuẩn CFA/IFRS cho BVPS/PB) của QUÝ MỚI NHẤT nếu mới hơn FY (equity là số dư tại
    1 thời điểm, không cộng dồn như TTM — verify VHM Q1/2026: BVPS=63.864đ vs Simplize
    thật=63.850đ, lệch 0.02%; trong khi dùng VCSH tổng của FY cũ lệch tới ~12-27%)."""
    codes="IS_NET_PROFIT_PARENT,IS_NET_PROFIT,BS_EQUITY,BS_EQUITY_PARENT,IS_REVENUE,BANK_TOI,CF_FCF"
    rows=[]; step=1000; off=0
    while True:
        page=db_get(f"/rest/v1/financial_statements?item_code=in.({codes})"
                    f"&select=symbol,period,period_type,item_code,value&limit={step}&offset={off}")
        rows+=page
        if len(page)<step: break
        off+=step
    fy={}; q={}
    for r in rows:
        if r["period_type"]=="FY":
            fy.setdefault(r["symbol"],{}).setdefault(r["period"],{})[r["item_code"]]=r["value"]
        elif r["period_type"]=="QUARTER":
            q.setdefault(r["symbol"],{}).setdefault(r["period"],{})[r["item_code"]]=r["value"]
    out={}
    for s,years in fy.items():
        for yr in sorted(years,reverse=True):
            d=years[yr]
            np_=d.get("IS_NET_PROFIT_PARENT") or d.get("IS_NET_PROFIT")
            if np_:
                equity=d.get("BS_EQUITY_PARENT") or d.get("BS_EQUITY")
                rec=dict(net_profit=np_, equity=equity,
                         revenue=d.get("IS_REVENUE") or d.get("BANK_TOI"), fcf=d.get("CF_FCF"),
                         fy=yr, ttm_np=None, ttm_rev=None)
                qs=q.get(s,{})
                last4=sorted(qs,key=_qkey)[-4:]
                if len(last4)==4:
                    nps=[ (qs[p].get("IS_NET_PROFIT_PARENT") or qs[p].get("IS_NET_PROFIT")) for p in last4]
                    rvs=[ (qs[p].get("IS_REVENUE") or qs[p].get("BANK_TOI")) for p in last4]
                    if all(x is not None for x in nps): rec["ttm_np"]=sum(nps)
                    if all(x is not None for x in rvs): rec["ttm_rev"]=sum(rvs)
                if qs:
                    latest_q=max(qs,key=_qkey)
                    if _qkey(latest_q)>_qkey(f"Q4/{yr}"):
                        eq_q=qs[latest_q].get("BS_EQUITY_PARENT") or qs[latest_q].get("BS_EQUITY")
                        if eq_q is not None: rec["equity"]=eq_q
                out[s]=rec
                break
    return out

def price_board(syms):
    t=Trading(source="VCI")
    with contextlib.redirect_stdout(io.StringIO()):
        df=t.price_board(syms)
    df.columns=['|'.join(str(x) for x in c) if isinstance(c,tuple) else str(c) for c in df.columns]
    out={}
    for _,row in df.iterrows():
        s=row.get("listing|symbol")
        price=row.get("match|match_price") or row.get("match|reference_price") or row.get("listing|ref_price")
        sh=row.get("listing|listed_share")
        if s and price and sh: out[str(s)]=(float(price), float(sh))
    return out

def div(a,b): return round(a/b,4) if (a not in (None,) and b not in (None,0)) else None

def load_dividends():
    """{symbol: tổng cash dividend/CP trong 12 tháng gần nhất}."""
    cut=f"{int(ASOF[:4])-1}{ASOF[4:]}"   # 12 tháng trước ASOF
    rows=[]; step=1000; off=0
    while True:
        page=db_get(f"/rest/v1/dividends?dividend_type=eq.cash&ex_date=gte.{cut}"
                    f"&select=symbol,amount&limit={step}&offset={off}")
        rows+=page
        if len(page)<step: break
        off+=step
    out={}
    for r in rows:
        if r.get("amount"): out[r["symbol"]]=out.get(r["symbol"],0)+r["amount"]
    return out

def main():
    syms=[os.path.basename(f).split("_")[0] for f in sorted(glob.glob(os.path.join(DIR,"*.xlsx")))]
    if not ALL and ONLY: syms=[s for s in syms if s in ONLY]
    print(f"{len(syms)} mã | {'WRITE' if WRITE else 'DRY-RUN'}")
    fin=load_financials(syms)
    print(f"financials FY mới nhất: {len(fin)} mã")
    divs=load_dividends()
    print(f"cash dividend TTM: {len(divs)} mã")
    # bulk price theo chunk
    pb={}
    for i in range(0,len(syms),CHUNK):
        ch=syms[i:i+CHUNK]
        try: pb.update(price_board(ch))
        except Exception as e: print(f"  price_board chunk {i} ERR: {repr(e)[:100]}")
        time.sleep(1.2)
    print(f"price_board: {len(pb)} mã có giá+CP")
    ctmap={r["symbol"]:r["company_type"] for r in db_get("/rest/v1/tickers?select=symbol,company_type&limit=2000")}
    out=[]; miss=[]
    for s in syms:
        if s not in pb or s not in fin: miss.append(s); continue
        price, shares = pb[s]; f=fin[s]
        mcap=price*shares
        np_ttm=f.get("ttm_np"); rev_ttm=f.get("ttm_rev")
        R={"MARKET_CAP":(round(mcap,0),"vnd"),
           "SHARES_OUT":(round(shares,0),"share"),
           "PRICE":(round(price,0),"vnd"),
           "PE":(div(mcap, np_ttm or f["net_profit"]),"x"),       # TTM ưu tiên
           "PE_FY":(div(mcap, f["net_profit"]),"x"),
           "PB":(div(mcap,f["equity"]),"x"),
           "PS":(div(mcap, rev_ttm or f["revenue"]),"x"),
           "BVPS":(round(f["equity"]/shares,0) if (f["equity"] and shares) else None,"vnd"),
           "FCF_YIELD":(div(f["fcf"],mcap),"pct") if f["fcf"] else (None,None),  # CF_FCF đã là VND, cùng đơn vị mcap → KHÔNG nhân 1e9
           "DIVIDEND_YIELD":(div(divs.get(s),price) if divs.get(s) else None,"pct")}
        for code,(val,unit) in R.items():
            if val is None: continue
            out.append(dict(symbol=s,company_type=ctmap.get(s) or "normal",period=ASOF,
                period_type="CURRENT",ratio_code=code,value=val,unit=unit,formula_version="v1",
                period_end=ASOF))   # CURRENT: period = period_end = ngày chốt
        if not ALL and len(syms)<=6:
            print(f"  {s}: giá={round(price)} PE(TTM)={R['PE'][0]} PE(FY{f['fy']})={R['PE_FY'][0]} PB={R['PB'][0]} PS={R['PS'][0]} BVPS={R['BVPS'][0]} ttm_np={round((np_ttm or 0)/1e9)}tỷ")
    print(f"\nTỔNG: {len(out)} ratio rows | thiếu giá/fin: {len(miss)} {miss[:10]}")
    if not WRITE: print("\n[DRY-RUN] chưa ghi."); return
    ok=err=0
    for i in range(0,len(out),500):
        ch=out[i:i+500]; data=json.dumps(ch).encode()
        req=urllib.request.Request(URL+"/rest/v1/financial_ratios?on_conflict=symbol,period,ratio_code",data=data,method="POST")
        req.add_header("apikey",KEY); req.add_header("Authorization","Bearer "+KEY)
        req.add_header("Content-Type","application/json"); req.add_header("Prefer","resolution=merge-duplicates,return=minimal")
        try: urllib.request.urlopen(req); ok+=len(ch)
        except urllib.error.HTTPError as e: err+=len(ch); print("ERR",e.read().decode()[:200])
    print(f"Ghi financial_ratios (CURRENT): OK={ok} ERR={err}")

if __name__=="__main__": main()

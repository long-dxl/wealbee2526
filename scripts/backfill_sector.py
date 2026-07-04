#!/usr/bin/env python3
"""Backfill tickers.sector cho 1 sàn (mặc định HNX) theo taxonomy GICS-VN của HOSE.
- 3 nhóm tài chính lấy trực tiếp từ company_type (chuẩn xác hơn ICB).
- Nhóm normal map từ ICB supersector (icbCode2 của Vietcap getAll) -> chuỗi sector HOSE đang dùng.

Dùng:  backfill_sector.py                 # dry-run HNX
       backfill_sector.py --write         # ghi
       backfill_sector.py --exchange UPCOM --write
"""
import os, sys, json, urllib.request, urllib.parse

URL="https://fkwsvyzguehtsjpwmttb.supabase.co"
KEY=os.environ.get("SUPABASE_SERVICE_KEY","")
WRITE="--write" in sys.argv
def _arg(f,d):
    for i,a in enumerate(sys.argv):
        if a==f and i+1<len(sys.argv): return sys.argv[i+1]
        if a.startswith(f+"="): return a.split("=",1)[1]
    return d
EXCHANGE=_arg("--exchange","HNX").upper()

# company_type -> sector (nhóm tài chính, ưu tiên tuyệt đối)
CT_SECTOR={"bank":"Tổ chức tín dụng","securities":"Dịch vụ tài chính","insurance":"Bảo hiểm"}

# ICB supersector (icbCode2, 4 chữ số) -> sector GICS-VN (cho company_type=normal)
ICB_SECTOR={
 "0500":"Năng lượng",
 "1300":"Nguyên vật liệu", "1700":"Nguyên vật liệu",
 "2300":"Hàng hóa công nghiệp", "2700":"Hàng hóa công nghiệp",
 "3300":"Xe và linh kiện",
 "3500":"Thực phẩm, đồ uống và thuốc lá",
 "3700":"Thời trang và hàng lâu bền",
 "4500":"Dược phẩm, công nghệ sinh học và khoa học sự sống",
 "5300":"Thương mại hàng không thiết yếu",
 "5500":"Truyền thông và giải trí",
 "5700":"Dịch vụ tiêu dùng",
 "6500":"Dịch vụ viễn thông",
 "7500":"Tiện ích",
 "8600":"Bất động sản",
 "8700":"Dịch vụ tài chính",
 "9500":"Phần mềm và dịch vụ",
}

def db_get(path):
    r=urllib.request.Request(URL+path); r.add_header("apikey",KEY); r.add_header("Authorization","Bearer "+KEY)
    return json.load(urllib.request.urlopen(r,timeout=30))

def main():
    icb={x["symbol"]:x.get("icbCode2") for x in json.load(urllib.request.urlopen(
        urllib.request.Request("https://trading.vietcap.com.vn/api/price/symbols/getAll",
                               headers={"User-Agent":"Mozilla/5.0"}),timeout=30))}
    rows=[]; off=0
    while True:
        p=db_get(f"/rest/v1/tickers?select=symbol,company_type,sector&exchange=eq.{EXCHANGE}&limit=1000&offset={off}")
        if not p: break
        rows+=p; off+=1000
        if off>20000: break
    plan=[]; unmapped=[]
    for r in rows:
        s=r["symbol"]; ct=r.get("company_type")
        sec=CT_SECTOR.get(ct) or ICB_SECTOR.get((icb.get(s) or "")[:4])
        if not sec: unmapped.append((s,icb.get(s))); continue
        plan.append((s,sec))
    from collections import Counter
    print(f"{EXCHANGE}: {len(rows)} mã | map được {len(plan)} | chưa map {len(unmapped)}")
    for sec,n in Counter(x[1] for x in plan).most_common(): print(f"  {n:3} {sec}")
    if unmapped: print("  CHƯA MAP:", unmapped[:30])
    if not WRITE:
        print("\n[DRY-RUN] thêm --write để ghi."); return
    if not KEY: print("Thiếu SUPABASE_SERVICE_KEY"); return
    ok=err=0
    for s,sec in plan:
        req=urllib.request.Request(URL+f"/rest/v1/tickers?symbol=eq.{urllib.parse.quote(s)}",
            data=json.dumps({"sector":sec}).encode(),method="PATCH")
        req.add_header("apikey",KEY); req.add_header("Authorization","Bearer "+KEY)
        req.add_header("Content-Type","application/json"); req.add_header("Prefer","return=minimal")
        try: urllib.request.urlopen(req,timeout=30); ok+=1
        except Exception as e: err+=1; print("  ERR",s,repr(e)[:80])
    print(f"Ghi sector: OK={ok} ERR={err}")

if __name__=="__main__": main()

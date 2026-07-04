#!/usr/bin/env python3
"""Parse <SÀN>.md (Simplize scraper) -> stocks.company_context + company_subsidiaries.
Tổng quát hoá từ toolcrawldata/seed_vn30_context.py, ghi qua REST (không cần supabase lib).

Dùng:  seed_context.py --file ~/simplize-scraper/HNX.md            # dry-run
       seed_context.py --file ~/simplize-scraper/HNX.md --write   # ghi cả context + subs
       seed_context.py --file ~/simplize-scraper/HNX.md --write --subs-only
"""
import os, sys, re, json, urllib.request, urllib.parse

URL="https://fkwsvyzguehtsjpwmttb.supabase.co"
KEY=os.environ.get("SUPABASE_SERVICE_KEY","")
WRITE="--write" in sys.argv
SUBS_ONLY="--subs-only" in sys.argv
def _arg(f,d):
    for i,a in enumerate(sys.argv):
        if a==f and i+1<len(sys.argv): return sys.argv[i+1]
        if a.startswith(f+"="): return a.split("=",1)[1]
    return d
FILE=os.path.expanduser(_arg("--file",""))

SECTION_MAP={
 r"^## Vị thế công ty":        "[Vị thế công ty]",
 r"^## Sản phẩm dịch vụ chính": "[Sản phẩm dịch vụ chính]",
 r"^## Chiến lược phát triển":  "[Chiến lược phát triển và đầu tư]",
 r"^## Rủi ro kinh doanh":      "[Rủi ro kinh doanh]",
}

def parse_row(line, parent, relation):
    cols=[c.strip() for c in line.strip().strip("|").split("|")]
    if len(cols)<4: return None
    name,tk,cap_raw,own_raw=cols[0],cols[1],cols[2],cols[3]
    if not name or name=="Công ty": return None
    ticker=None if tk in ("—","-","") else tk
    cap=None; m=re.search(r"\(([\d,]+)\s*VND\)",cap_raw)
    if m: cap=int(m.group(1).replace(",",""))
    own=None; m=re.search(r"([\d.]+)%",own_raw)
    if m: own=float(m.group(1))
    return dict(parent_symbol=parent,company_name=name,ticker=ticker,
               charter_capital=cap,ownership_pct=own,relation_type=relation)

def parse(path):
    content=open(path,encoding="utf-8").read()
    results=[]
    for block in re.split(r"\n---\n",content):
        block=block.strip()
        if not block: continue
        m=re.match(r"^\[([A-Z0-9]+)\]",block)
        if not m: continue
        symbol=m.group(1)
        narrative=[]; subs=[]; section=None; relation=None; in_table=False
        for line in block.splitlines():
            hit=False
            for pat,label in SECTION_MAP.items():
                if re.match(pat,line):
                    section="narrative"; relation=None; in_table=False; narrative.append(label); hit=True; break
            if hit: continue
            if re.match(r"^## Công ty con",line):
                section="subsidiary"; relation="con"; in_table=False
            elif re.match(r"^## Công ty liên kết",line):
                section="subsidiary"; relation="lien_ket"; in_table=False
            elif re.match(r"^\[[A-Z0-9]+\]$",line):
                continue
            else:
                if section=="narrative": narrative.append(line)
                elif section=="subsidiary":
                    if line.startswith("| ---"): in_table=True; continue
                    if in_table and line.startswith("|"):
                        r=parse_row(line,symbol,relation)
                        if r: subs.append(r)
        results.append(dict(symbol=symbol,context="\n".join(narrative).strip(),subsidiaries=subs))
    return results

def patch_context(sym,ctx):
    req=urllib.request.Request(URL+f"/rest/v1/stocks?symbol=eq.{urllib.parse.quote(sym)}",
        data=json.dumps({"company_context":ctx}).encode(),method="PATCH")
    req.add_header("apikey",KEY); req.add_header("Authorization","Bearer "+KEY)
    req.add_header("Content-Type","application/json"); req.add_header("Prefer","return=minimal")
    urllib.request.urlopen(req,timeout=30)

def upsert_subs(rows):
    ok=err=0
    for i in range(0,len(rows),200):
        ch=rows[i:i+200]
        req=urllib.request.Request(
            URL+"/rest/v1/company_subsidiaries?on_conflict=parent_symbol,company_name,relation_type",
            data=json.dumps(ch).encode(),method="POST")
        req.add_header("apikey",KEY); req.add_header("Authorization","Bearer "+KEY)
        req.add_header("Content-Type","application/json"); req.add_header("Prefer","resolution=merge-duplicates,return=minimal")
        try: urllib.request.urlopen(req,timeout=60); ok+=len(ch)
        except urllib.error.HTTPError as e: err+=len(ch); print("  ERR",e.read().decode()[:200])
    return ok,err

def main():
    if not FILE or not os.path.exists(FILE):
        print("Thiếu --file hợp lệ"); return
    data=parse(FILE)
    total_subs=sum(len(s["subsidiaries"]) for s in data)
    with_subs=sum(1 for s in data if s["subsidiaries"])
    print(f"{os.path.basename(FILE)}: {len(data)} mã | {with_subs} mã có sub | {total_subs} dòng sub")
    if not WRITE:
        ex=next((s for s in data if s["subsidiaries"]),None)
        if ex:
            print(f"  ví dụ {ex['symbol']}: {len(ex['subsidiaries'])} dòng")
            for r in ex["subsidiaries"][:3]: print("   ",r)
        print("\n[DRY-RUN] thêm --write để ghi."); return
    if not KEY: print("Thiếu SUPABASE_SERVICE_KEY"); return
    if not SUBS_ONLY:
        okc=errc=0
        for s in data:
            try: patch_context(s["symbol"],s["context"]); okc+=1
            except Exception as e: errc+=1; print("  ERR ctx",s["symbol"],repr(e)[:80])
        print(f"context: OK={okc} ERR={errc}")
    all_subs=[r for s in data for r in s["subsidiaries"]]
    print("subsidiaries:", upsert_subs(all_subs))

if __name__=="__main__": main()

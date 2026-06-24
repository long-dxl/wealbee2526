"""
seed_vn30_context.py — Parse VN30.md → upsert vào Supabase
  - stocks.company_context  : toàn bộ nội dung markdown mỗi mã
  - company_subsidiaries    : bảng công ty con / liên kết (structured)

Chạy: python3 seed_vn30_context.py
"""

import os
import re
import sys
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://fkwsvyzguehtsjpwmttb.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_KEY:
    print("❌  SUPABASE_SERVICE_KEY chưa được set")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

VN30_MD = os.path.join(os.path.dirname(__file__), "..", "VN30.md")


# ─── Parser ───────────────────────────────────────────────────────────────────

def parse_vn30(path: str):
    """
    Trả về list of dict:
      { symbol, context, subsidiaries: [{company_name, ticker, charter_capital, ownership_pct, relation_type}] }
    """
    with open(path, encoding="utf-8") as f:
        content = f.read()

    # Tách theo từng mã — dấu hiệu bắt đầu là `[SYMBOL]` trên dòng riêng
    blocks = re.split(r"\n---\n", content)
    results = []

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        # Lấy symbol từ dòng đầu [ACB]
        symbol_match = re.match(r"^\[([A-Z0-9]+)\]", block)
        if not symbol_match:
            continue
        symbol = symbol_match.group(1)

        # Tách phần narrative (không bao gồm bảng công ty con/liên kết)
        narrative_sections = []
        subsidiary_rows = []

        current_section = None
        current_relation = None
        in_table = False

        SECTION_MAP = {
            r"^## Vị thế công ty":        "[Vị thế công ty]",
            r"^## Sản phẩm dịch vụ chính": "[Sản phẩm dịch vụ chính]",
            r"^## Chiến lược phát triển":  "[Chiến lược phát triển và đầu tư]",
            r"^## Rủi ro kinh doanh":      "[Rủi ro kinh doanh]",
        }

        for line in block.splitlines():
            # Xác định section narrative
            matched_narrative = False
            for pattern, label in SECTION_MAP.items():
                if re.match(pattern, line):
                    current_section = "narrative"
                    current_relation = None
                    in_table = False
                    narrative_sections.append(label)
                    matched_narrative = True
                    break
            if matched_narrative:
                continue

            if re.match(r"^## Công ty con", line):
                current_section = "subsidiary"
                current_relation = "con"
                in_table = False
            elif re.match(r"^## Công ty liên kết", line):
                current_section = "subsidiary"
                current_relation = "lien_ket"
                in_table = False
            elif line.startswith("[") and re.match(r"^\[[A-Z0-9]+\]$", line):
                continue
            else:
                if current_section == "narrative":
                    narrative_sections.append(line)
                elif current_section == "subsidiary":
                    # Parse table rows (bỏ qua header và separator)
                    if line.startswith("| ---"):
                        in_table = True
                        continue
                    if in_table and line.startswith("|"):
                        row = parse_table_row(line, symbol, current_relation)
                        if row:
                            subsidiary_rows.append(row)

        context = "\n".join(narrative_sections).strip()
        results.append({
            "symbol": symbol,
            "context": context,
            "subsidiaries": subsidiary_rows,
        })

    return results


def parse_table_row(line: str, parent_symbol: str, relation_type: str):
    """Parse một dòng bảng markdown → dict subsidiary"""
    cols = [c.strip() for c in line.strip().strip("|").split("|")]
    if len(cols) < 4:
        return None

    company_name = cols[0].strip()
    ticker_raw   = cols[1].strip()
    capital_raw  = cols[2].strip()
    ownership_raw = cols[3].strip()

    if not company_name or company_name == "Công ty":
        return None

    ticker = None if ticker_raw in ("—", "-", "") else ticker_raw

    # Parse vốn điều lệ: lấy số trong ngoặc đơn "(...VND)"
    capital = None
    cap_match = re.search(r"\(([\d,]+)\s*VND\)", capital_raw)
    if cap_match:
        capital = int(cap_match.group(1).replace(",", ""))

    # Parse % sở hữu
    ownership = None
    own_match = re.search(r"([\d.]+)%", ownership_raw)
    if own_match:
        ownership = float(own_match.group(1))

    return {
        "parent_symbol":   parent_symbol,
        "company_name":    company_name,
        "ticker":          ticker,
        "charter_capital": capital,
        "ownership_pct":   ownership,
        "relation_type":   relation_type,
    }


# ─── Upsert ───────────────────────────────────────────────────────────────────

def upsert_contexts(stocks: list):
    ok = err = 0
    for s in stocks:
        try:
            sb.table("stocks").update({"company_context": s["context"]}) \
              .eq("symbol", s["symbol"]).execute()
            ok += 1
            print(f"  OK {s['symbol']}: context {len(s['context'])} chars")
        except Exception as e:
            err += 1
            print(f"  ERR {s['symbol']}: {e}")
    return ok, err


def upsert_subsidiaries(stocks: list):
    all_rows = []
    for s in stocks:
        all_rows.extend(s["subsidiaries"])

    if not all_rows:
        print("  (không có dòng nào)")
        return 0, 0

    ok = err = 0
    for i in range(0, len(all_rows), 200):
        chunk = all_rows[i:i+200]
        try:
            sb.table("company_subsidiaries").upsert(
                chunk,
                on_conflict="parent_symbol,company_name,relation_type"
            ).execute()
            ok += len(chunk)
        except Exception as e:
            err += len(chunk)
            print(f"  ❌ chunk {i}: {e}")

    return ok, err


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 55)
    print("Parse VN30.md")
    print("=" * 55)

    stocks = parse_vn30(VN30_MD)
    print(f"Tim thay {len(stocks)} ma: {[s['symbol'] for s in stocks]}\n")

    total_subs = sum(len(s["subsidiaries"]) for s in stocks)
    print(f"Tong cong ty con/lien ket: {total_subs} dong\n")

    print("-" * 55)
    print("Upsert company_context -> stocks")
    print("-" * 55)
    ok, err = upsert_contexts(stocks)
    print(f"\nOK: {ok} ma, LOI: {err}\n")

    print("-" * 55)
    print("Upsert -> company_subsidiaries")
    print("-" * 55)
    ok2, err2 = upsert_subsidiaries(stocks)
    print(f"\nOK: {ok2} dong, LOI: {err2}")

    print("\n" + "=" * 55)
    print("Done.")

if __name__ == "__main__":
    main()

"""markets/smoke_test.py — kiểm tra nhanh lớp đa-thị-trường (chạy: python markets/smoke_test.py).

Chốt 3 bất biến của Foundation:
  1. Package load + thị trường active đúng (mặc định vn).
  2. Config là SINGLE SOURCE: module cũ dùng CHUNG object với hồ sơ thị trường (no drift).
  3. Provider delegate được sang code hiện có (no behavior change).
Exit != 0 nếu sai → dùng được trong CI cùng evals/run_evals.py.
"""
import os
import sys

# Cho phép chạy trực tiếp `python markets/smoke_test.py` (đưa project root lên path).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main() -> int:
    import markets
    from core import agent_config
    from core import search_tools

    fails = []

    def check(name, cond):
        print(f"  {'OK ' if cond else 'FAIL'}  {name}")
        if not cond:
            fails.append(name)

    mkt = markets.active_market()
    c = mkt.config

    # 1. Active market
    check("active market = vn", mkt.code == "vn" and c.name == "Việt Nam")
    check("default fallback (market lạ → vn)", markets.get_market("xx").code == "vn")

    # 2. Single source of truth (đồng nhất object — đổi config là đổi mọi nơi)
    check("sector_aliases shared", c.sector_aliases is agent_config._SECTOR_ALIASES)
    check("macro_aliases shared", c.macro_aliases is agent_config._MACRO_ALIASES)
    check("watchlist shared", c.watchlist is agent_config.TOP_10_TICKERS)
    check("priority_tickers ordered (tiering)", isinstance(c.priority_tickers, tuple) and len(c.priority_tickers) == 10)
    check("primary_sources shared", c.primary_sources is search_tools._VN_PRIMARY_SOURCES)
    check("macro_source_map shared", c.macro_source_map is search_tools._MACRO_SOURCE_MAP)

    # 3. Provider delegate (no network: 'HPG' khớp regex, không gọi company_map)
    check("resolve_tickers delegate", mkt.resolve_tickers("phân tích HPG và FPT") == ["HPG", "FPT"])

    # 4. Tham số định giá theo thị trường
    check("valuation params", c.risk_free_rate == 0.045 and c.graham_const == 22.5)

    # 5. KG tri thức in-memory (markets/vn/knowledge.py) — offline
    g = mkt.knowledge
    st = g.stats()
    check("KG có node/cạnh", st["macro_nodes"] >= 30 and st["sector_nodes"] >= 19 and st["sector_edges"] >= 70)
    net = g.get_sector_network("SECTOR_STEEL")
    check("get_sector_network OK", net.get("status") == "OK" and len(net.get("macro_drivers", [])) >= 5)
    prop = g.propagate("LAI_SUAT_FED")
    has_2hop = any(len(c.get("path", [])) >= 3 for c in prop.get("transmits_chain", []))
    check("propagate đa-hop (Fed→DXY→tỷ giá)", has_2hop)

    print(f"\n{'✅ PASS' if not fails else '❌ FAIL: ' + ', '.join(fails)}  ({len(fails)} lỗi)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())

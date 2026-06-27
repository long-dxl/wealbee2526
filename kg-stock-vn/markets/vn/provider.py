"""markets/vn/provider.py — VNMarketProvider: đấu nối tool ngữ nghĩa vào nguồn nội địa VN.

Hiện thực `MarketProvider` bằng cách DELEGATE sang code hiện có (vnstock + SerpAPI + Supabase-KG)
→ no behavior change. Import được làm LAZY (trong method) để tránh vòng import với agent_config
(agent_config import search_tools; search_tools/orchestrator có thể tham chiếu config).
"""
from __future__ import annotations

from typing import Any

from markets.base import MarketProvider
from markets.vn.config import VN_CONFIG


class VNMarketProvider(MarketProvider):
    config = VN_CONFIG

    # ── Resolve thực thể ──
    def resolve_tickers(self, query: str) -> list[str]:
        from core.analysis_orchestrator import extract_tickers
        return extract_tickers(query)

    # ── Dữ liệu thị trường ──
    def get_financials(self, ticker: str, *args, **kwargs) -> Any:
        from core.agent_config import get_financial_statements
        return get_financial_statements(ticker, *args, **kwargs)

    def get_price(self, tickers, *args, **kwargs) -> Any:
        from core.agent_config import get_market_price
        return get_market_price(tickers, *args, **kwargs)

    # ── Tin & web ──
    def search_web(self, query: str, *args, **kwargs) -> Any:
        from core.search_tools import web_search
        return web_search(query, *args, **kwargs)

    def read_article(self, url: str, *args, **kwargs) -> Any:
        from core.search_tools import read_article
        return read_article(url, *args, **kwargs)

    # ── Vĩ mô ──
    def get_macro(self, indicator: str, *args, **kwargs) -> Any:
        from core.agent_config import query_macro_propagation
        return query_macro_propagation(indicator, *args, **kwargs)

    # ── So sánh ──
    def compare(self, tickers, *args, **kwargs) -> Any:
        from core.agent_config import compare_stocks
        return compare_stocks(tickers, *args, **kwargs)

    # ── Tri thức (KG IN-MEMORY: markets/vn/knowledge.py) ──
    @property
    def knowledge(self):
        from markets.vn.knowledge import VN_GRAPH
        return VN_GRAPH

    def sector_network(self, sector, *args, **kwargs) -> Any:
        from core.agent_config import query_sector_impact   # tri thức (engine) + mã/Beta (DB)
        return query_sector_impact(sector)

    def macro_propagation(self, macro, *args, **kwargs) -> Any:
        from core.agent_config import query_macro_propagation
        return query_macro_propagation(macro)

    def propagate(self, macro, max_hops: int = 3, *args, **kwargs) -> Any:
        return self.knowledge.propagate(macro, max_hops)

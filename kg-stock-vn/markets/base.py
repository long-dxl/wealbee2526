"""markets/base.py — Lớp trừu tượng ĐA-THỊ-TRƯỜNG (Brain + Tools).

Mục tiêu scale global: thâm nhập thị trường mới = cắm 1 `MarketConfig` (dữ liệu nội địa:
nguồn báo, taxonomy ngành, tham số định giá, ngôn ngữ) + 1 `MarketProvider` (đấu nối data
nội địa: BCTC, giá, tin, vĩ mô) — KHÔNG sửa lõi orchestrator/Brain.

- MarketConfig  = phần KHAI BÁO (data): mọi hằng số đặc thị-trường gom 1 chỗ, key theo `code`.
- MarketProvider = phần HÀNH VI (tools): interface ngữ nghĩa thống nhất; mỗi nước hiện thực
  riêng (VN = vnstock + SerpAPI + Supabase-KG; nước khác = nguồn nội địa của họ).

Phần lõi (Brain: prompt khung tư duy + KG suy luận + orchestrator) chỉ phụ thuộc 2 interface
này, nên đổi thị trường = đổi config/provider.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable


# ============================================================
# MARKET CONFIG — phần KHAI BÁO (mọi hằng số đặc thị-trường)
# ============================================================
@dataclass(frozen=True)
class MarketConfig:
    """Hồ sơ 1 thị trường. Thêm nước mới = tạo 1 instance này với dữ liệu nội địa.

    Mọi field đều có default an toàn để config từng nước chỉ khai phần mình có; phần còn
    thiếu (vd nước chưa có map ngành) vẫn chạy được, degrade chứ không vỡ.
    """
    # ── Định danh ──
    code: str                       # mã thị trường, vd "vn", "us"
    name: str                       # tên hiển thị, vd "Việt Nam"
    language: str = "vi"            # ngôn ngữ trả lời chính (ISO 639-1)
    timezone_offset_hours: int = 7  # lệch UTC (VN = +7) → mốc "HÔM NAY"

    # ── Tiền tệ & định dạng số ──
    currency: str = "VND"
    currency_unit_label: str = "tỷ VND (trừ EPS=VND/cp, % và lần)"
    thousands_sep: str = "."        # VN dùng '.' ngăn cách nghìn

    # ── Locale cho web search (SerpAPI/Google) ──
    search_hl: str = "vi"          # ngôn ngữ
    search_gl: str = "vn"          # quốc gia
    search_google_domain: str = "google.com.vn"

    # ── Nguồn primary (data — đổ từ config nội địa) ──
    primary_sources: frozenset = frozenset()       # báo tài chính nội địa uy tín
    intl_sources: frozenset = frozenset()          # nguồn quốc tế (vĩ mô/hàng hóa toàn cầu)
    sector_source_hint: dict = field(default_factory=dict)   # ngành → gợi ý báo
    topic_sources: tuple = ()       # [(keywords...), domain] — site-filter theo chủ đề
    macro_source_map: dict = field(default_factory=dict)     # chỉ số vĩ mô → (scope, query, nguồn)

    # ── Taxonomy ngành & vĩ mô (KG nội địa) ──
    sector_ids: frozenset = frozenset()
    sector_aliases: dict = field(default_factory=dict)       # keyword → SECTOR_ID (cho _resolve)
    sector_routing_aliases: dict = field(default_factory=dict)  # keyword → SECTOR_ID (routing câu hỏi ngành)
    sector_labels: dict = field(default_factory=dict)        # SECTOR_ID → nhãn search sạch
    icb_sector_map: dict = field(default_factory=dict)       # mã ngành nguồn (vd ICB) → SECTOR_ID (suy ngành on-demand cho MỌI mã)
    macro_ids: frozenset = frozenset()
    macro_aliases: dict = field(default_factory=dict)        # keyword → MACRO_ID
    rate_sensitive_sectors: frozenset = frozenset()          # ngành nhạy lãi suất → kéo vĩ mô quốc tế
    watchlist: frozenset = frozenset()                       # rổ theo dõi (vd Top 10) — = priority_tickers
    priority_tickers: tuple = ()                             # rổ ƯU TIÊN sync thường xuyên (tiering); KHÔNG giới hạn phân tích

    # ── Tham số ĐỊNH GIÁ (đặc thị-trường: bond yield, ERP, band) ──
    risk_free_rate: float = 0.045        # lợi suất TPCP kỳ hạn dài (Rf)
    equity_risk_premium: float = 0.075   # phần bù rủi ro vốn (ERP)
    blume_slope: float = 0.67            # Blume: β_adj = slope*β + intercept
    blume_intercept: float = 0.33
    graham_const: float = 22.5           # hằng số Graham √(k·EPS·BVPS)

    # ── Locale routing (keyword theo NGÔN NGỮ — bề mặt cần dịch khi sang nước khác) ──
    deep_intent: tuple = ()         # từ khóa ý định phân tích sâu
    overview_markers: tuple = ()    # "thế nào/ra sao/có nên"
    fin_intent: tuple = ()          # "báo cáo tài chính/bctc/kqkd"
    simple_markers: tuple = ()      # câu hỏi nhanh (giá/tin)
    compare_markers: tuple = ()     # ý định so sánh
    company_name_prefixes: tuple = ()   # tiền tố tên DN cần bỏ khi map tên→mã

    # ── Hook tùy biến (vd phân loại loại hình DN từ BCTC) ──
    # Để mặc định None; provider/lõi tự fallback nếu nước chưa khai.
    extra: dict = field(default_factory=dict)


# ============================================================
# MARKET PROVIDER — phần HÀNH VI (tools ngữ nghĩa)
# ============================================================
class MarketProvider(ABC):
    """Interface tool NGỮ NGHĨA mà Brain/orchestrator gọi. Nền tảng tự resolve sang
    connector đúng của từng nước (2026 'semantic action registry').

    VN hiện thực bằng vnstock + SerpAPI + Supabase-KG (delegate sang code hiện có →
    no behavior change). Nước mới chỉ cần hiện thực lại các method này trên nguồn nội địa.
    """

    #: MarketConfig đi kèm provider này.
    config: MarketConfig

    @property
    def code(self) -> str:
        return self.config.code

    # ── Resolve thực thể ──
    @abstractmethod
    def resolve_tickers(self, query: str) -> list[str]:
        """Câu hỏi tự do → danh sách mã (gồm nhận tên DN → mã)."""

    # ── Dữ liệu thị trường ──
    @abstractmethod
    def get_financials(self, ticker: str, *args, **kwargs) -> Any:
        """Báo cáo tài chính + chỉ số đã tính (IS/BS/CF/ratios + định giá)."""

    @abstractmethod
    def get_price(self, tickers, *args, **kwargs) -> Any:
        """Giá/khối lượng/vốn hóa thị trường."""

    # ── Tin & web ──
    @abstractmethod
    def search_web(self, query: str, *args, **kwargs) -> Any:
        """Tìm web (ưu tiên nguồn primary nội địa của thị trường)."""

    @abstractmethod
    def read_article(self, url: str, *args, **kwargs) -> Any:
        """Đọc nội dung 1 URL (HTML/PDF báo cáo)."""

    # ── Vĩ mô ──
    @abstractmethod
    def get_macro(self, indicator: str, *args, **kwargs) -> Any:
        """Chỉ số vĩ mô nội địa/quốc tế theo `macro_source_map`."""

    # ── So sánh ──
    def compare(self, tickers, *args, **kwargs) -> Any:
        """So sánh nhiều mã (mặc định: chưa hỗ trợ → None; nước nào có thì override)."""
        return None

    # ── Tri thức (KG suy luận: vĩ mô→ngành→mã) — mặc định None, market nào có thì override ──
    def sector_network(self, sector, *args, **kwargs) -> Any:
        """Bản đồ vĩ mô tác động 1 ngành + mã/Beta (tri thức + dữ liệu)."""
        return None

    def macro_propagation(self, macro, *args, **kwargs) -> Any:
        """1 cú sốc vĩ mô lan tới ngành nào + chuỗi hạ nguồn."""
        return None

    def propagate(self, macro, *args, **kwargs) -> Any:
        """Traversal ĐA-HOP cú sốc vĩ mô (lộ chuỗi phi hiển nhiên)."""
        return None

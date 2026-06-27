"""markets — lớp trừu tượng ĐA-THỊ-TRƯỜNG (Brain + Tools).

Thâm nhập nước mới = thêm `markets/<code>/` (config + provider) rồi register ở đây.
Chọn thị trường chạy bằng env `MARKET` (mặc định "vn").

    from markets import active_market
    mkt = active_market()           # provider của thị trường đang chạy
    mkt.get_financials("HPG")       # gọi tool ngữ nghĩa, nền tảng resolve connector đúng
"""
from markets.base import MarketConfig, MarketProvider
from markets.registry import register, get_market, active_market, available_markets

# ── Đăng ký các thị trường đã hỗ trợ ──
from markets.vn import VNMarketProvider

register(VNMarketProvider())

__all__ = [
    "MarketConfig", "MarketProvider",
    "register", "get_market", "active_market", "available_markets",
]

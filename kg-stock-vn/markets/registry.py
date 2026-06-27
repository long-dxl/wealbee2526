"""markets/registry.py — sổ đăng ký thị trường + chọn thị trường ĐANG HOẠT ĐỘNG.

Thâm nhập nước mới: viết `markets/<code>/config.py` + `provider.py`, gọi `register(provider)`
trong `markets/__init__.py`. Chọn thị trường chạy bằng biến môi trường `MARKET` (mặc định "vn").
"""
from __future__ import annotations

import os
from typing import Dict

from markets.base import MarketProvider

_REGISTRY: Dict[str, MarketProvider] = {}
_DEFAULT_CODE = "vn"


def register(provider: MarketProvider) -> MarketProvider:
    """Đăng ký 1 provider theo `config.code`. Trả lại provider để tiện gán."""
    _REGISTRY[provider.code] = provider
    return provider


def available_markets() -> list[str]:
    return sorted(_REGISTRY.keys())


def get_market(code: str | None = None) -> MarketProvider:
    """Lấy provider theo code; thiếu code → đọc env MARKET → mặc định 'vn'."""
    code = (code or os.getenv("MARKET") or _DEFAULT_CODE).lower()
    if code not in _REGISTRY:
        if _DEFAULT_CODE in _REGISTRY:
            return _REGISTRY[_DEFAULT_CODE]
        raise KeyError(f"Chưa đăng ký thị trường '{code}'. Đã có: {available_markets()}")
    return _REGISTRY[code]


def active_market() -> MarketProvider:
    """Provider của thị trường đang hoạt động (theo env MARKET)."""
    return get_market(None)

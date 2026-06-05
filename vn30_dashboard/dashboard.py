#!/usr/bin/env python3
"""
Vietnam VN30 Real-time Dashboard — Multi-Source Weighted Fallback
─────────────────────────────────────────────────────────────────
Chiến lược nguồn dữ liệu:
  1. VCI  (ưu tiên cao nhất, ~300ms)  ← dùng mặc định
  2. KBS  (dự phòng,        ~400ms)  ← tự chuyển khi VCI lỗi ≥3 lần
  Logic:
  - Sau FAIL_THRESHOLD lỗi liên tiếp → chuyển xuống nguồn tiếp theo
  - Sau RECOVERY_SECS  giây         → thử khôi phục về nguồn ưu tiên cao hơn
  - Dashboard không bao giờ dừng dù cả hai nguồn cùng lỗi (hiển thị data cũ)
"""

import time
import threading
import warnings
import sys
from datetime import datetime, time as dtime

warnings.filterwarnings("ignore")

from rich.console import Console
from rich.table import Table
from rich.live import Live
from rich.text import Text
from rich.align import Align
from rich.panel import Panel

try:
    from vnstock import Vnstock, Listing
except ImportError:
    print("Cài đặt: pip install vnstock rich")
    sys.exit(1)

# ══════════════════════════════════════════════════════════════════════════════
# Cấu hình
# ══════════════════════════════════════════════════════════════════════════════
REFRESH_SEC     = 2      # giây giữa các lần fetch
FETCH_TIMEOUT   = 8      # timeout 1 lần fetch (giây)
SESSION_END     = dtime(15, 15)
FAIL_THRESHOLD  = 3      # lỗi liên tiếp → chuyển nguồn
RECOVERY_SECS   = 60     # giây trước khi thử khôi phục nguồn ưu tiên hơn

console = Console()


# ══════════════════════════════════════════════════════════════════════════════
# Source Manager — trái tim của chiến lược đa nguồn
# ══════════════════════════════════════════════════════════════════════════════
class Source:
    """Đại diện cho 1 nguồn dữ liệu."""

    def __init__(self, name: str, vnstock_source: str):
        self.name            = name
        self.vnstock_source  = vnstock_source
        self.client          = None
        self.fail_count      = 0
        self.last_fail_time  = 0.0
        self.total_ok        = 0
        self.total_fail      = 0
        self.last_ms         = 0

    def build_client(self):
        self.client = Vnstock().stock(symbol="VCB", source=self.vnstock_source)

    def fetch(self, symbols: list[str]) -> list[dict]:
        """Fetch và trả về list[dict] chuẩn hoá, raise nếu lỗi."""
        t0 = time.perf_counter()
        df = self.client.trading.price_board(symbols_list=symbols)
        self.last_ms = int((time.perf_counter() - t0) * 1000)

        rows = []
        # VCI trả MultiIndex columns, KBS trả flat columns → xử lý cả hai
        if isinstance(df.columns[0], tuple):
            rows = self._parse_vci(df)
        else:
            rows = self._parse_kbs(df)

        rows.sort(key=lambda r: r["pct"])   # sort: giảm → tăng
        self.fail_count  = 0
        self.total_ok   += 1
        return rows

    def _parse_vci(self, df) -> list[dict]:
        result = []
        for _, row in df.iterrows():
            def g(grp, col, cast=float):
                v = row.get((grp, col), 0)
                try:    return cast(v) if v else cast(0)
                except: return cast(0)
            ref   = g("listing", "ref_price")
            price = g("match",   "match_price")
            chg   = price - ref
            pct   = (chg / ref * 100) if ref else 0.0
            result.append({
                "symbol": row[("listing", "symbol")],
                "price" : price, "ref"  : ref,
                "ceil"  : g("listing", "ceiling"),
                "floor" : g("listing", "floor"),
                "open"  : g("match",   "open_price"),
                "high"  : g("match",   "highest"),
                "low"   : g("match",   "lowest"),
                "volume": g("match",   "accumulated_volume", int),
                "value" : g("match",   "accumulated_value"),
                "change": chg, "pct": pct,
                "b1p"   : g("bid_ask", "bid_1_price"),
                "b1v"   : g("bid_ask", "bid_1_volume", int),
                "a1p"   : g("bid_ask", "ask_1_price"),
                "a1v"   : g("bid_ask", "ask_1_volume", int),
            })
        return result

    def _parse_kbs(self, df) -> list[dict]:
        result = []
        for _, row in df.iterrows():
            def g(col, cast=float):
                v = row.get(col, 0)
                try:    return cast(v) if v else cast(0)
                except: return cast(0)
            ref   = g("reference_price")
            price = g("close_price")
            chg   = price - ref
            pct   = (chg / ref * 100) if ref else 0.0
            result.append({
                "symbol": row["symbol"],
                "price" : price, "ref"  : ref,
                "ceil"  : g("ceiling_price"),
                "floor" : g("floor_price"),
                "open"  : g("open_price"),
                "high"  : g("high_price"),
                "low"   : g("low_price"),
                "volume": g("total_trades", int),
                "value" : g("total_value"),
                "change": chg, "pct": pct,
                "b1p"   : g("bid_price_1"),
                "b1v"   : g("bid_vol_1", int),
                "a1p"   : g("ask_price_1"),
                "a1v"   : g("ask_vol_1", int),
            })
        return result

    @property
    def reliability(self) -> float:
        total = self.total_ok + self.total_fail
        return self.total_ok / total if total else 1.0

    def __repr__(self):
        return f"Source({self.name}, ok={self.total_ok}, fail={self.total_fail})"


class SourceManager:
    """
    Quản lý danh sách nguồn theo chiến lược Weighted Fallback:
    - Dùng nguồn ưu tiên cao nhất
    - Tự chuyển xuống khi nguồn hiện tại lỗi ≥ FAIL_THRESHOLD lần
    - Thử khôi phục về nguồn ưu tiên cao hơn sau RECOVERY_SECS giây
    """

    def __init__(self, sources: list[Source]):
        self.sources      = sources   # thứ tự = ưu tiên (index 0 = cao nhất)
        self.current_idx  = 0
        self._lock        = threading.Lock()
        self._last_recovery_check = 0.0

    def setup(self):
        for src in self.sources:
            src.build_client()
        console.log(
            f"[green]Sources sẵn sàng:[/green] "
            + "  ".join(f"[{i+1}] {s.name}" for i, s in enumerate(self.sources))
        )

    @property
    def active(self) -> Source:
        return self.sources[self.current_idx]

    def fetch(self, symbols: list[str]) -> list[dict]:
        with self._lock:
            self._try_recovery()

        src = self.active
        try:
            data = src.fetch(symbols)
            return data
        except Exception as e:
            src.fail_count  += 1
            src.total_fail  += 1
            src.last_fail_time = time.time()

            if src.fail_count >= FAIL_THRESHOLD:
                self._switch_next(reason=str(e)[:60])

            raise   # re-raise để caller biết lỗi

    def _switch_next(self, reason: str):
        """Chuyển sang nguồn tiếp theo trong danh sách."""
        old = self.sources[self.current_idx].name
        next_idx = (self.current_idx + 1) % len(self.sources)
        self.current_idx = next_idx
        new = self.sources[self.current_idx].name
        self.sources[self.current_idx].fail_count = 0
        console.log(
            f"[yellow]⚡ CHUYỂN NGUỒN:[/yellow] "
            f"[red]{old}[/red] → [green]{new}[/green]  "
            f"[dim]({reason})[/dim]"
        )

    def _try_recovery(self):
        """Thử chuyển về nguồn ưu tiên cao hơn sau RECOVERY_SECS."""
        if self.current_idx == 0:
            return
        if time.time() - self._last_recovery_check < RECOVERY_SECS:
            return
        self._last_recovery_check = time.time()

        # Thử nguồn ưu tiên cao hơn
        for idx in range(self.current_idx):
            candidate = self.sources[idx]
            try:
                candidate.build_client()   # tạo lại client mới
                console.log(
                    f"[green]✓ KHÔI PHỤC:[/green] "
                    f"Chuyển về [cyan]{candidate.name}[/cyan]"
                )
                self.current_idx = idx
                candidate.fail_count = 0
                return
            except Exception:
                continue

    def status_str(self) -> str:
        """Chuỗi hiển thị trạng thái tất cả nguồn cho dashboard."""
        parts = []
        for i, src in enumerate(self.sources):
            rel = src.reliability * 100
            if i == self.current_idx:
                parts.append(
                    f"[bold green]{src.name} ●[/bold green] "
                    f"[dim]{src.last_ms}ms {rel:.0f}%[/dim]"
                )
            else:
                age = time.time() - src.last_fail_time
                if age < RECOVERY_SECS:
                    parts.append(f"[red]{src.name} ✗[/red] [dim]{rel:.0f}%[/dim]")
                else:
                    parts.append(f"[dim]{src.name} ○ {rel:.0f}%[/dim]")
        return "  ".join(parts)


# ══════════════════════════════════════════════════════════════════════════════
# Shared state
# ══════════════════════════════════════════════════════════════════════════════
_lock        = threading.Lock()
_last_data   : list[dict] = []
_last_ms     : int        = 0
_last_ok     : float      = 0.0
_error_msg   : str        = ""
_fetch_count : int        = 0
_symbols     : list[str]  = []
_src_manager : SourceManager | None = None


def _do_fetch():
    global _last_data, _last_ms, _last_ok, _error_msg, _fetch_count

    try:
        data = _src_manager.fetch(_symbols)
        ms   = _src_manager.active.last_ms
        with _lock:
            _last_data   = data
            _last_ms     = ms
            _last_ok     = time.time()
            _error_msg   = ""
            _fetch_count += 1
    except Exception as e:
        with _lock:
            _error_msg   = str(e)[:80]
            _fetch_count += 1


def fetch_loop():
    while True:
        t = threading.Thread(target=_do_fetch, daemon=True)
        t.start()
        t.join(timeout=FETCH_TIMEOUT)
        time.sleep(REFRESH_SEC)


# ══════════════════════════════════════════════════════════════════════════════
# Load VN30
# ══════════════════════════════════════════════════════════════════════════════
def load_vn30() -> list[str]:
    try:
        df = Listing().symbols_by_group(group='VN30')
        syms = sorted(df.tolist())
        console.log(f"[green]VN30:[/green] {len(syms)} mã — {' '.join(syms)}")
        return syms
    except Exception as e:
        console.log(f"[yellow]Dùng danh sách mặc định: {e}[/yellow]")
        return ["ACB","BID","CTG","DGC","FPT","GAS","GVR","HDB","HPG","LPB",
                "MBB","MSN","MWG","PLX","SAB","SHB","SSB","SSI","STB","TCB",
                "TPB","VCB","VHM","VIB","VIC","VJC","VNM","VPB","VPL","VRE"]


# ══════════════════════════════════════════════════════════════════════════════
# Helpers render
# ══════════════════════════════════════════════════════════════════════════════
def clr(val: float, text: str) -> Text:
    if val > 0:  return Text(text, style="bold green")
    if val < 0:  return Text(text, style="bold red")
    return Text(text, style="bold yellow")

def fmt(v: float, d: int = 1) -> str:
    return f"{v:,.{d}f}"

def session_info() -> tuple[str, str]:
    now = datetime.now().time()
    if   dtime(9,  0) <= now < dtime(11, 30): return "● PHIÊN SÁNG",  "bold green"
    elif dtime(11,30) <= now < dtime(13,  0): return "◌ NGHỈ TRƯA",   "bold yellow"
    elif dtime(13, 0) <= now < dtime(14, 45): return "● PHIÊN CHIỀU", "bold green"
    elif dtime(14,45) <= now < dtime(15,  0): return "⚡ ATO/ATC",     "bold magenta"
    elif dtime(15, 0) <= now <= SESSION_END:  return "■ KẾT THÚC",    "bold red"
    else:                                      return "○ NGOÀI GIỜ",   "dim"

def live_badge(last_ok: float) -> str:
    if last_ok == 0: return "[dim]Đang kết nối...[/dim]"
    age = time.time() - last_ok
    if age < 5:      return "[green]● LIVE[/green]"
    if age < 15:     return f"[yellow]⚠ {age:.0f}s trước[/yellow]"
    return                   f"[red]✗ Mất kết nối {age:.0f}s[/red]"


# ══════════════════════════════════════════════════════════════════════════════
# Build table
# ══════════════════════════════════════════════════════════════════════════════
def build_table(data: list[dict], ms: int, count: int,
                error: str, last_ok: float) -> Table:
    now        = datetime.now().strftime("%H:%M:%S  %d/%m/%Y")
    slbl, ssty = session_info()
    badge      = live_badge(last_ok)
    src_status = _src_manager.status_str() if _src_manager else ""
    err        = f"  [red]⚠ {error}[/red]" if error else ""

    up        = sum(1 for r in data if r["pct"] > 0)
    dn        = sum(1 for r in data if r["pct"] < 0)
    flat      = len(data) - up - dn
    total_val = sum(r["value"] for r in data) / 1e12

    title = (
        f"[bold cyan]🇻🇳 VN30 Dashboard[/bold cyan]  "
        f"[{ssty}]{slbl}[/{ssty}]  {badge}  [dim]{now}  #{count}[/dim]{err}\n"
        f"Nguồn: {src_status}   "
        f"[green]▲{up}[/green] [red]▼{dn}[/red] [yellow]■{flat}[/yellow]  "
        f"[dim]GT VN30: [white]{total_val:.2f} nghìn tỷ[/white]  {ms}ms[/dim]"
    )

    t = Table(
        title=title,
        border_style="cyan",
        header_style="bold white on dark_blue",
        show_lines=False,
        padding=(0, 1),
    )

    t.add_column("#",          justify="right",  style="dim",       width=3)
    t.add_column("Mã",         justify="center",                    width=5)
    t.add_column("Giá",        justify="right",                     width=9)
    t.add_column("±",          justify="right",                     width=8)
    t.add_column("%",          justify="right",                     width=8)
    t.add_column("TC",         justify="right",  style="yellow dim",width=8)
    t.add_column("Mở",         justify="right",  style="dim",       width=8)
    t.add_column("Cao",        justify="right",  style="green dim", width=8)
    t.add_column("Thấp",       justify="right",  style="red dim",   width=8)
    t.add_column("Bid",        justify="right",  style="green",     width=9)
    t.add_column("Ask",        justify="right",  style="red",       width=9)
    t.add_column("KL (tr CP)", justify="right",                     width=10)
    t.add_column("GT (tỷ đ)",  justify="right",  style="dim",       width=9)

    for i, item in enumerate(data, 1):
        sym = item["symbol"]
        chg = item["change"]
        pct = item["pct"]
        sgn = "+" if chg >= 0 else ""

        if item["price"] >= item["ceil"] > 0:
            sym_txt = Text(sym, style="bold magenta")
        elif item["floor"] > 0 and item["price"] <= item["floor"]:
            sym_txt = Text(sym, style="bold cyan")
        else:
            sym_txt = clr(chg, sym)

        t.add_row(
            str(i),
            sym_txt,
            clr(chg, fmt(item["price"])),
            clr(chg, f"{sgn}{fmt(chg)}"),
            clr(pct, f"{sgn}{pct:.2f}%"),
            Text(fmt(item["ref"]),  style="yellow dim"),
            Text(fmt(item["open"]), style="dim"),
            Text(fmt(item["high"]), style="green dim"),
            Text(fmt(item["low"]),  style="red dim"),
            Text(fmt(item["b1p"]) if item["b1p"] else "—", style="green"),
            Text(fmt(item["a1p"]) if item["a1p"] else "—", style="red"),
            clr(chg, f"{item['volume']/1_000_000:.2f}"),
            Text(f"{item['value']/1_000_000_000:.1f}", style="dim"),
        )

    t.caption = (
        "[magenta]Tím=Trần[/magenta]  [cyan]Xanh=Sàn[/cyan]  "
        "[green]▲Tăng[/green]  [red]▼Giảm[/red]  [yellow]■TC=Tham chiếu[/yellow]  "
        f"[dim]Dự phòng: chuyển nguồn sau {FAIL_THRESHOLD} lỗi · "
        f"khôi phục sau {RECOVERY_SECS}s  |  Ctrl+C thoát[/dim]"
    )
    return t


def build_closed_table(data: list[dict]) -> Table:
    up = sum(1 for r in data if r["pct"] > 0)
    dn = sum(1 for r in data if r["pct"] < 0)
    t  = Table(
        title=(
            f"[bold red]■ KẾT THÚC PHIÊN  {datetime.now().strftime('%d/%m/%Y')}[/bold red]\n"
            f"[green]▲ Tăng: {up}[/green]  [red]▼ Giảm: {dn}[/red]  "
            f"[yellow]■ Đứng: {len(data)-up-dn}[/yellow]"
        ),
        border_style="red", header_style="bold white on dark_red",
        show_lines=False, padding=(0, 1),
    )
    for col, w in [("Mã",5),("Đóng cửa",10),("±",8),("%",8),
                   ("Mở",9),("Cao",9),("Thấp",9),("TC",8),
                   ("KL(trCP)",10),("GT(tỷ)",9)]:
        t.add_column(col, justify="right" if col != "Mã" else "center", width=w)
    for item in data:
        chg = item["change"]
        pct = item["pct"]
        sgn = "+" if chg >= 0 else ""
        t.add_row(
            Text(item["symbol"], style="bold white"),
            clr(chg, fmt(item["price"])),
            clr(chg, f"{sgn}{fmt(chg)}"),
            clr(pct, f"{sgn}{pct:.2f}%"),
            Text(fmt(item["open"]), style="dim"),
            Text(fmt(item["high"]), style="green"),
            Text(fmt(item["low"]),  style="red"),
            Text(fmt(item["ref"]),  style="yellow dim"),
            Text(f"{item['volume']/1_000_000:.2f}"),
            Text(f"{item['value']/1_000_000_000:.1f}", style="dim"),
        )
    return t


# ══════════════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════════════
def main():
    global _symbols, _src_manager

    console.print(Panel.fit(
        "[bold cyan]VN30 Real-time Dashboard[/bold cyan]\n"
        "[dim]Khởi động hệ thống đa nguồn...[/dim]",
        border_style="cyan"
    ))

    _symbols    = load_vn30()
    _src_manager = SourceManager([
        Source("VCI", "VCI"),   # ưu tiên 1 — realtime tốt nhất
        Source("KBS", "KBS"),   # ưu tiên 2 — dự phòng
    ])
    _src_manager.setup()

    threading.Thread(target=fetch_loop, daemon=True).start()
    console.print("[dim]Đang fetch lần đầu...[/dim]")
    time.sleep(1.2)

    while True:
        if datetime.now().time() > SESSION_END:
            with _lock:
                final = list(_last_data)
            if final:
                console.print(Align.center(build_closed_table(final)))
            console.print(Panel.fit(
                "[bold red]Phiên giao dịch đã kết thúc.[/bold red]\n"
                "[dim]Chạy lại ngày mai từ 9:00.[/dim]",
                border_style="red"
            ))
            break

        try:
            with Live(console=console, refresh_per_second=4, screen=True) as live:
                while True:
                    if datetime.now().time() > SESSION_END:
                        break
                    with _lock:
                        data    = list(_last_data)
                        ms      = _last_ms
                        count   = _fetch_count
                        error   = _error_msg
                        last_ok = _last_ok
                    if data:
                        live.update(Align.center(
                            build_table(data, ms, count, error, last_ok)
                        ))
                    time.sleep(0.25)
        except KeyboardInterrupt:
            raise
        except Exception:
            time.sleep(1)
            continue


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        if _src_manager:
            console.print("\n[dim]Thống kê nguồn:[/dim]")
            for src in _src_manager.sources:
                console.print(f"  {src.name}: {src.total_ok} ok / {src.total_fail} lỗi  ({src.reliability*100:.1f}%)")
        console.print("\n[yellow]Đã thoát.[/yellow]")

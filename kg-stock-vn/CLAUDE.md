# CLAUDE.md — Bản đồ kiến trúc cho AI agent

Đọc file này TRƯỚC khi sửa code. Mục tiêu: giúp agent điều hướng nhanh + giữ bất biến chất lượng.

## Sản phẩm
AI Agent phân tích cổ phiếu **Việt Nam**: **Bộ não** (LLM Gemini + khung tư duy tài chính + **Knowledge Graph nhân-quả vĩ mô→ngành→mã ×Beta**) + **Tools** (web search, news, market data vnstock, báo cáo). Triết lý: **deterministic-first** — khi model lite không đáng tin (bịa số), build code tất định + bơm bảng đã tính, đừng tin model.

## Bản đồ domain (sau Phase 0)
| Thư mục | Vai trò |
|---|---|
| `app.py` + `design_system.py` + `pages/` | UI Streamlit (entry + multipage + design tokens). GIỮ ở root theo chuẩn Streamlit. |
| `core/` | **Bộ não** (import dạng `from core.X import`): `agent_config` (facade), `analysis_orchestrator` (6 đường điều phối), `prompts`, `sanitize`, `verifier`, `search_tools`, `analysis_knowledge`, `tool_translations`, `agent_errors`, `agent_learning` |
| `markets/` | **Đa-thị-trường + KG (CANONICAL)**: `base` (MarketConfig+MarketProvider), `registry`, `graph` (engine suy luận in-memory), `vn/config` (hằng số VN), `vn/knowledge` (**tri thức nhân-quả = code, nguồn chân lý**), `vn/provider` |
| `evals/` | Harness regression: `run_evals.py routing\|answers\|all` |
| `data/` | Pipeline (chạy `python -m data.X`): `sync_vietstock_news`, `sync_fundamentals`, `compute_beta`, `extract_events`, `macro_radar`, `scheduler`, `seed_*`, `graph_utils` |
| `db/` | `schema.sql`, `run_schema.py`, `migrations/*.sql` (áp thủ công lên Supabase) |
| `archive/` | Code chết / chạy-một-lần (KHÔNG dùng) |
| `docs/` | Hướng dẫn, SOP, cron setup |
| `assets/`,`lib/` | JS/CSS tĩnh cho pyvis (KG Explorer) — pyvis trỏ `lib/` runtime, ĐỪNG move |

## Chạy & kiểm thử
- **Interpreter**: dùng python có deps (máy này: `/Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13`; `python3` trần THIẾU deps).
- App: `streamlit run app.py --server.port 8501` → health `http://localhost:8501`.
- **Eval (chạy TRƯỚC mọi commit)**: `python evals/run_evals.py routing` (ngưỡng 95%, baseline 27/27=100%).
- Smoke đa-thị-trường: `python markets/smoke_test.py` (13 check).
- Hoặc: `make eval` / `make smoke` / `make run`.

## Bất biến (đừng phá)
1. **markets/vn/knowledge.py là nguồn chân lý** đồ thị nhân-quả. `seed_sector_graph.py` (root) ĐÃ lỗi thời — đừng sửa tri thức ở đó.
2. **Tách tri-thức vs dữ-liệu**: tri thức chuyên gia (cạnh/trọng số/cơ chế) → code (`markets/vn/knowledge`); dữ liệu khối lượng lớn (mã/Beta/giá trị vĩ mô hiện tại/tin) → Supabase.
3. **Facade**: `agent_config` re-export `prompts`/`sanitize`/`search_tools` + `markets.vn.config`. Đổi hành vi phải qua eval.
4. **Phân tích chạy cho MỌI mã** (không giới hạn Top 10): mã ngoài KG → `_resolve_sector_for_ticker` suy ngành on-demand. `priority_tickers` chỉ là cadence sync, KHÔNG giới hạn phân tích.
5. **UI**: icon SVG/Material, **KHÔNG emoji**, căn lề trái, không dùng dấu "—" (em-dash).
6. **Numeric integrity**: không để model bịa số/khuyến nghị; `verifier.enforce` hậu kiểm; số mặc định (vd Beta=1.0) phải kèm ghi chú.

## Sau khi sửa code
Chạy `python evals/run_evals.py routing` + `python markets/smoke_test.py`. Nếu đụng UI → boot app, curl health 200.

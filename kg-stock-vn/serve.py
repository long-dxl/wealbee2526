"""serve.py — API HTTP cho bộ não kg-stock-vn (thay ActionHub của Wealbee).

POST /analyze  { "message": str }  -> { "markdown": str, "sources": [...] }
GET  /health

Chạy local:  uvicorn serve:app --port 8077 --reload
Frontend ActionHub gọi:  POST http://localhost:8077/analyze
"""
from __future__ import annotations

import os
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from google import genai
from google.genai import types as types_mod

import re
import json as _json
from core import analysis_orchestrator as orch
from core import wealbee_retriever as wb
from core import agent_config as ac
from core.agent_config import GEMINI_DEFAULT, GEMINI_MODELS

try:
    from core import tool_translations as _tt
except Exception:
    _tt = None

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

# Model ưu tiên + fallback (đẩy default lên đầu, bỏ trùng)
_MODELS = [GEMINI_DEFAULT] + [m for m in GEMINI_MODELS if m != GEMINI_DEFAULT] + ["gemini-2.5-flash"]
_MODELS = list(dict.fromkeys(_MODELS))

# ── OpenAI gpt-4.1-mini = model CHÍNH (ổn định output); Gemini giữ FALLBACK. ──
OPENAI_MODEL = "gpt-4.1-mini"
try:
    from openai import OpenAI as _OpenAI
    _oa_key = os.environ.get("OPENAI_API_KEY", "").strip()
    _oa = _OpenAI(api_key=_oa_key) if _oa_key else None
except Exception:
    _oa = None

# ── Đo token THẬT mỗi request (để trừ credit) — contextvars an toàn đa luồng ──
import contextvars
_usage_acc: contextvars.ContextVar = contextvars.ContextVar("usage_acc", default=None)


def _usage_begin() -> dict:
    acc = {"in": 0, "out": 0, "cached": 0, "calls": 0}
    _usage_acc.set(acc)
    return acc


def _usage_track(tin: int, tout: int, cached: int = 0):
    acc = _usage_acc.get()
    if acc is not None:
        acc["in"] += int(tin or 0)
        acc["out"] += int(tout or 0)
        acc["cached"] += int(cached or 0)
        acc["calls"] += 1


def _oa_gen(prompt: str, system: str, json_mode: bool = False,
            max_tokens: int = 8192) -> str:
    """Gọi gpt-4.1-mini. Ghi nhận token thật. Raise nếu lỗi."""
    r = _oa.chat.completions.create(
        model=OPENAI_MODEL,
        temperature=0.2,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        **({"response_format": {"type": "json_object"}} if json_mode else {}),
    )
    u = getattr(r, "usage", None)
    if u:
        det = getattr(u, "prompt_tokens_details", None)
        cached = getattr(det, "cached_tokens", 0) if det else 0
        _usage_track(getattr(u, "prompt_tokens", 0), getattr(u, "completion_tokens", 0), cached)
    return (r.choices[0].message.content or "").strip()

app = FastAPI(title="KG-Stock-VN brain (Wealbee ActionHub)")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


class AnalyzeIn(BaseModel):
    message: str
    context: str | None = None              # (legacy) text ngữ cảnh
    context_cards: list[dict] | None = None  # thẻ kéo vào: [{id,type,label,badge,summary}]
    user_id: str | None = None               # để trừ credit theo token thật


def _gen(model: str, prompt: str, system: str) -> str:
    resp = _client.models.generate_content(
        model=model, contents=prompt,
        config=types_mod.GenerateContentConfig(
            system_instruction=system, temperature=0.2, max_output_tokens=8192),
    )
    um = getattr(resp, "usage_metadata", None)
    if um:
        _usage_track(getattr(um, "prompt_token_count", 0),
                     getattr(um, "candidates_token_count", 0))
    try:
        return resp.text or ""
    except Exception:
        out = ""
        for c in (getattr(resp, "candidates", None) or []):
            for p in (getattr(getattr(c, "content", None), "parts", None) or []):
                out += getattr(p, "text", "") or ""
        return out


def _gen_with_fallback(prompt: str, system: str) -> tuple[str, str]:
    """gpt-4.1-mini (chính) → Gemini fallback khi lỗi/hết quota."""
    last = ""
    if _oa is not None:
        try:
            txt = _oa_gen(prompt, system)
            if txt.strip():
                return txt, OPENAI_MODEL
        except Exception as e:
            last = str(e)
    for m in _MODELS:
        try:
            txt = _gen(m, prompt, system)
            if txt.strip():
                return txt, m
        except Exception as e:
            last = str(e)
            if any(x in last for x in ("429", "RESOURCE_EXHAUSTED", "503", "UNAVAILABLE")):
                time.sleep(0.5)
                continue
            break
    return (f"⚠️ Không tạo được phản hồi (model lỗi: {last[:120]}).", "")


def _is_deep(q: str) -> bool:
    try:
        return bool(orch.extract_tickers(q) or orch.is_sector_query(q)
                    or orch.is_macro_query(q) or orch.is_deep_analysis(q))
    except Exception:
        return False


@app.get("/health")
def health():
    return {"ok": True, "gemini": bool(_client), "openai": bool(_oa),
            "primary": OPENAI_MODEL if _oa else (_MODELS[0] if _MODELS else None),
            "wealbee": bool(os.environ.get("WEALBEE_SUPABASE_URL")),
            "models": _MODELS}


# ── Phát hiện ý định (để biết cần lấp data gì) ────────────────────────────────
_GAP_FIN_WORDS = ("tài chính", "bctc", "định giá", "doanh thu", "lợi nhuận", "roe", "p/e",
                  "pe", "eps", "biên", "dòng tiền", "phân tích", "kết quả kinh doanh")
_DEEPFIN_WORDS = ("phân tích tài chính", "tình hình tài chính", "báo cáo tài chính", "bctc",
                  "phân tích sâu", "định giá", "tài chính của", "sức khỏe tài chính",
                  "phân tích cổ phiếu", "phân tích mã")
_MACRO_WORDS = ("vĩ mô", "lãi suất", "tỷ giá", "cpi", "lạm phát", "gdp", "tín dụng", "fed",
                "thuế", "ảnh hưởng", "tác động", "chính sách", "ngành")

_REPORT_SYS = (
    "Bạn là chuyên viên phân tích chứng khoán Việt Nam của Wealbee. Viết BÁO CÁO hoàn chỉnh, đúng "
    "trọng tâm câu hỏi, tiếng Việt, markdown (dùng BẢNG khi cần). NGUYÊN TẮC BẮT BUỘC:\n"
    "1. NGUỒN CHÍNH = 'DỮ LIỆU WEALBEE'. Ưu tiên tối đa. TRÍCH NGUỒN BẮT BUỘC, CỤ THỂ:\n"
    "   • MỖI tin tức/báo cáo nhắc tới PHẢI có token **[ref:N]** ngay sau (N là số có sẵn trong dữ liệu). "
    "CHỈ dùng [ref:N] có sẵn — TUYỆT ĐỐI KHÔNG tự bịa kiểu [ref:stockbiz], (nguồn: ...), hay [ref:tên].\n"
    "   • Số nội bộ không link → ghi nguồn cụ thể đã cho trong ngoặc vuông: [Wealbee · prices_daily · ngày] / "
    "[Wealbee · financials_annual YYYY] — KHÔNG ghi '(nguồn Wealbee)' chung chung.\n"
    "2. 'DỮ LIỆU BỔ SUNG' chỉ lấp chỗ thiếu — ghi rõ (vnstock) / (KG nội bộ).\n"
    "3. KHÔNG bịa số; thiếu thì ghi '(chưa có số)'. KHÔNG khuyến nghị mua/bán.\n"
    "4. Bôi đậm **số quan trọng**. Cấu trúc rõ (## / ###, bảng). Kết bằng 1 dòng disclaimer.\n"
    "5. CHẤT LƯỢNG hơn độ dài: đủ ý cần thiết, súc tích, KHÔNG lan man/đệm chữ. Câu hỏi đơn giản → "
    "trả lời ngắn gọn sắc bén; câu phức tạp → kỹ. Mỗi câu phải mang thông tin.\n"
    "6. NHÃN CẢM TÍNH bằng TIẾNG VIỆT (tích cực / tiêu cực / trung lập / rất tích cực / rất tiêu cực) — "
    "KHÔNG in 'positive/negative/neutral'. KHÔNG in nhãn kỹ thuật thô như 'impact=4' hay 'label='; "
    "nếu nêu mức tác động thì viết tự nhiên (vd 'tác động mạnh ~5/10')."
)


def _wb_fin_syms(wb_bundle: dict) -> set:
    """Mã đã có BCTC trong dữ liệu Wealbee đã lấy (để biết mã nào CÒN THIẾU)."""
    out = set()
    if wb_bundle.get("mode") == "plan":
        for r in wb_bundle.get("queries", []):
            if r.get("table") == "financials_annual":
                for row in (r.get("rows") or []):
                    if row.get("symbol"):
                        out.add(str(row["symbol"]).upper())
    else:
        for sym, rec in (wb_bundle.get("stocks") or {}).items():
            if rec.get("financials"):
                out.add(sym.upper())
    return out


def _wb_sources(wb_bundle: dict) -> list:
    src = []
    rows_groups = ([r.get("rows") or [] for r in wb_bundle.get("queries", [])]
                   if wb_bundle.get("mode") == "plan"
                   else [(rec.get("news") or []) for rec in (wb_bundle.get("stocks") or {}).values()])
    for rows in rows_groups:
        for n in rows:
            if isinstance(n, dict) and n.get("article_url"):
                src.append({"title": n.get("title"), "url": n["article_url"], "source": n.get("source")})
    return src[:8]


_PLAN_ANSWER_SYS = (
    "Bạn là bộ HOẠCH ĐỊNH CÂU TRẢ LỜI cho hệ phân tích chứng khoán VN. Đọc câu hỏi, xác định người "
    "dùng THỰC SỰ cần gì để HÀI LÒNG, rồi phác KHUNG trả lời CHẤT LƯỢNG — đủ ý cốt lõi, KHÔNG lan man. "
    "CHỈ trả JSON:\n"
    "{\"intent\": \"1 câu: người dùng muốn gì\", \"depth\": \"concise|standard|deep\", "
    "\"outline\": [\"các mục/khía cạnh CỐT LÕI cần có để trả lời ĐÚNG & CHẤT cho RIÊNG câu này\"], "
    "\"data\": {\"tickers\": [\"mã 3 chữ in hoa\"], \"need_financials\": bool, \"need_quarterly\": bool, "
    "\"need_news\": bool, \"need_valuation\": bool, \"need_macro_kg\": bool, \"need_comparison\": bool, "
    "\"need_subsidiaries\": bool}}\n"
    "NGUYÊN TẮC: outline BÁM ĐÚNG câu hỏi — hỏi hẹp (giá, 1 tin, 1 con số) → outline NGẮN + depth=concise; "
    "phân tích tài chính/đầu tư/định giá → depth=deep, need_quarterly=true (cần quý mới + chỉ số ngành); "
    "hỏi tác động vĩ mô/ngành/nhân-quả → need_macro_kg=true. KHÔNG thêm mục thừa ngoài ý câu hỏi."
)


def plan_answer(q: str) -> dict:
    """Hoạch định: hiểu yêu cầu thật → khung trả lời (outline/depth) + data cần. Rỗng nếu lỗi."""
    # gpt-4.1-mini (chính) — JSON mode
    if _oa is not None:
        try:
            txt = _oa_gen(f"CÂU HỎI: {q}", _PLAN_ANSWER_SYS, json_mode=True, max_tokens=900)
            data = _json.loads(txt)
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    if _client is None:
        return {}
    for model in _MODELS:
        try:
            r = _client.models.generate_content(
                model=model, contents=f"{_PLAN_ANSWER_SYS}\n\nCÂU HỎI: {q}",
                config=types_mod.GenerateContentConfig(
                    temperature=0, max_output_tokens=600, response_mime_type="application/json"),
            )
            um = getattr(r, "usage_metadata", None)
            if um:
                _usage_track(getattr(um, "prompt_token_count", 0),
                             getattr(um, "candidates_token_count", 0))
            data = _json.loads((r.text or "").strip())
            if isinstance(data, dict):
                return data
        except Exception:
            continue
    return {}


_GROUND_ONLY_RE = re.compile(r"chỉ\s+(dựa|dùng|sử dụng|căn cứ|theo)|only based|chỉ trong (tài liệu|báo cáo|nội dung)")


def _fetch_card_content(card: dict) -> dict | None:
    """Lấy nội dung THẬT của thẻ kéo vào theo type+id. Trả {block, focus, syms, is_report}."""
    sb = wb._wb()
    if sb is None or not isinstance(card, dict):
        return None
    ctype = (card.get("type") or "").lower()
    cid = card.get("id")
    label = card.get("label") or ""
    try:
        if ctype == "report" and cid:
            r = (sb.table("analyst_reports")
                 .select("ticker,title,source_firm,recommendation,target_price,report_date,full_text")
                 .eq("id", str(cid)).limit(1).execute().data)
            if r:
                d = r[0]; ft = (d.get("full_text") or "")[:40000]
                blk = (f"### TÀI LIỆU GỐC — Báo cáo phân tích {d.get('ticker')} · {d.get('source_firm')} · {d.get('report_date')}\n"
                       f"Khuyến nghị: **{d.get('recommendation')}** · Giá mục tiêu: **{d.get('target_price')}** · {d.get('title')}\n\n"
                       f"--- TOÀN VĂN BÁO CÁO ---\n{ft}")
                return {"block": blk, "focus": f"báo cáo phân tích {d.get('ticker')} của {d.get('source_firm')}",
                        "syms": [d["ticker"]] if d.get("ticker") else [], "is_report": True}
        if ctype == "news" and cid:
            r = (sb.table("market_news")
                 .select("title,content,content_summary,source,published_at,affected_symbols")
                 .eq("id", str(cid)).limit(1).execute().data)
            if r:
                d = r[0]; cs = d.get("content_summary")
                body = d.get("content") or (cs if isinstance(cs, str) else "\n".join(cs or []))
                blk = (f"### TIN GỐC — {d.get('title')} ({d.get('source')}, {str(d.get('published_at'))[:10]})\n"
                       f"{(body or '')[:6000]}")
                return {"block": blk, "focus": f"tin '{d.get('title')}'",
                        "syms": [s for s in (d.get("affected_symbols") or [])], "is_report": False}
    except Exception:
        pass
    # ticker/mover/index/portfolio → suy mã từ label để retriever lấy đúng (không cần fetch riêng)
    m = re.search(r"\b([A-Z]{3})\b", label)
    if m:
        return {"block": "", "focus": label, "syms": [m.group(1)], "is_report": False}
    return None


def build_report(message: str, context: str | None = None, cards: list | None = None,
                 symbols: list | None = None) -> dict:
    """Wealbee-first + HOẠCH ĐỊNH theo câu hỏi + GROUNDED theo thẻ kéo vào.

    symbols: mã người dùng CHỌN (agent). Nếu có → CHỈ phân tích/lấy data các mã này,
    KHÔNG quét mã trong nội dung prompt (vd câu ví dụ "VHM")."""
    explicit_syms = [s.upper() for s in (symbols or []) if s]
    q = message.strip()
    if context:
        q = f"{q}\n\n[Ngữ cảnh đính kèm]\n{context}"
    ql = q.lower()

    # ── THẺ KÉO VÀO = TIÊU ĐIỂM: lấy nội dung thật theo type+id ──
    card_blocks: list[str] = []
    card_syms: list[str] = []
    card_focus: list[str] = []
    has_report = False
    for c in (cards or []):
        info = _fetch_card_content(c)
        if not info:
            continue
        if info["block"]:
            card_blocks.append(info["block"])
        card_syms += [s.upper() for s in info["syms"] if s]
        if info["focus"]:
            card_focus.append(info["focus"])
        has_report = has_report or info["is_report"]
    ground_only = has_report and bool(_GROUND_ONLY_RE.search(ql))

    # GROUNDED-ONLY: người dùng yêu cầu "CHỈ dựa vào báo cáo này" → chỉ dùng toàn văn tài liệu, KHÔNG bổ sung
    if ground_only and card_blocks:
        doc = "\n\n".join(card_blocks)[:48000]
        sys_g = ("Bạn là chuyên viên phân tích tài chính. CHỈ dùng TÀI LIỆU GỐC dưới đây để trả lời — "
                 "TUYỆT ĐỐI KHÔNG thêm số liệu/kiến thức ngoài tài liệu; chỉ tiêu thiếu thì ghi "
                 "'(không có trong tài liệu)'. Tiếng Việt, markdown, bôi đậm **số quan trọng**, dùng bảng "
                 "khi liệt kê chỉ số; KHÔNG đưa khuyến nghị mua/bán của hệ thống. Kết bằng 1 dòng disclaimer.")
        prompt_g = (f"CÂU HỎI: {q}\n\n=== TÀI LIỆU GỐC (NGUỒN DUY NHẤT) ===\n{doc}\n\n"
                    "YÊU CẦU: Trả lời ĐÚNG câu hỏi, CHỈ rút từ tài liệu trên (số liệu, khuyến nghị, "
                    "giá mục tiêu, luận điểm). Súc tích, đủ ý.")
        text, used = _gen_with_fallback(prompt_g, sys_g)
        return {"markdown": text, "sources": [], "model": used, "data_mode": "card-grounded",
                "gap_fill": [f"grounded:{f}" for f in card_focus]}

    # 0) HOẠCH ĐỊNH CÂU TRẢ LỜI (tổng quát cho MỌI input)
    plan = plan_answer(q)
    pdata = plan.get("data") or {}
    depth = plan.get("depth") or "standard"
    outline = [o for o in (plan.get("outline") or []) if isinstance(o, str)]
    intent = plan.get("intent") or ""
    if card_focus and not intent:
        intent = "Phân tích/giải thích sâu về " + ", ".join(card_focus)

    if explicit_syms:
        # Mã CHỌN là nguồn duy nhất (+ mã từ thẻ kéo vào) — KHÔNG quét mã từ prompt
        tickers = list(dict.fromkeys(card_syms + explicit_syms))
    else:
        tickers = [t.upper() for t in (pdata.get("tickers") or []) if isinstance(t, str)]
        if not tickers:
            try:
                tickers = orch.extract_tickers(q)
            except Exception:
                tickers = []
        # Mã từ thẻ kéo vào lên ĐẦU (tiêu điểm)
        tickers = list(dict.fromkeys(card_syms + tickers))

    # Cờ nhu cầu: ưu tiên plan, fallback keyword nếu planner rỗng
    need_fin = pdata.get("need_financials", bool(tickers) or any(w in ql for w in _GAP_FIN_WORDS))
    need_quarterly = pdata.get("need_quarterly", any(w in ql for w in _DEEPFIN_WORDS))
    need_macro = pdata.get("need_macro_kg", any(w in ql for w in _MACRO_WORDS))

    # 1) WEALBEE = NGUỒN CHÍNH (kèm refs [ref:N] cho tin/báo cáo)
    #    Mã CHỌN (nếu có) ưu tiên tuyệt đối → CHỈ lấy data các mã đó.
    wb_bundle = wb.retrieve(q, symbols=(tickers if explicit_syms else None))
    wb_ctx, wb_refs = wb.to_context_with_refs(wb_bundle)

    ext_parts: list[str] = []
    gap_fill: list[str] = []

    # 2a) BCTC: cần quý/định giá → LUÔN vnstock (quý mới + NIM/CIR/CASA/CAR/LDR bank); else chỉ mã Wealbee thiếu
    if need_fin and tickers:
        have = _wb_fin_syms(wb_bundle)
        for sym in tickers[:3]:
            if not need_quarterly and sym.upper() in have:
                continue
            try:
                fin = ac.get_financial_statements(sym)
                if isinstance(fin, dict) and not fin.get("error"):
                    ext_parts.append(f"### BCTC chi tiết {sym} (nguồn: vnstock)\n"
                                     + _json.dumps(fin, ensure_ascii=False, default=str)[:5000])
                    gap_fill.append(f"{sym}: BCTC vnstock")
            except Exception:
                pass

    # 2b) Câu hỏi vĩ mô/ngành/tác động → KG nhân-quả IN-CODE (VN_GRAPH, luôn chạy, không phụ thuộc DB)
    if need_macro:
        try:
            from markets.vn.knowledge import VN_GRAPH

            def _kg_block(sid: str, title: str) -> str | None:
                sn = VN_GRAPH.get_sector_network(sid)
                if not sn or sn.get("error"):
                    return None
                drivers = sn.get("macro_drivers", [])[:8]
                if not drivers:
                    return None
                lines = [f"- **{d.get('macro_name')}** (chiều {d.get('sign')}, trọng số {d.get('weight')}"
                         f"{', độ trễ ' + str(d.get('lag')) if d.get('lag') else ''}): {d.get('mechanism')}"
                         for d in drivers]
                return f"### {title} (Knowledge Graph nhân-quả nội bộ)\n" + "\n".join(lines)

            if tickers:
                for sym in tickers[:3]:
                    r = ac._resolve_sector_for_ticker(sym)
                    sid = r.get("sector") if r else None
                    if sid:
                        blk = _kg_block(sid, f"Bản đồ vĩ mô→ngành→{sym} (×Beta)")
                        if blk:
                            ext_parts.append(blk)
                            gap_fill.append(f"{sym}: KG ngành {sid}")
            else:
                sid = orch.detect_sector(q)
                if sid:
                    blk = _kg_block(sid, f"Bản đồ tác động vĩ mô lên ngành")
                    if blk:
                        ext_parts.append(blk)
                        gap_fill.append(f"ngành {sid}: KG")
        except Exception:
            pass

    ext_ctx = "\n\n".join(ext_parts)
    outline_block = "\n".join(f"- {o}" for o in outline) if outline else "(tự xác định mục phù hợp với câu hỏi)"
    depth_note = {
        "concise": "NGẮN GỌN, sắc — chỉ điều cốt lõi, có thể chỉ vài câu hoặc 1 bảng nhỏ.",
        "deep": "PHÂN TÍCH KỸ, đa chiều, có bảng & đối chiếu số; nếu là tài chính thì chia nhóm "
                "(sinh lời / chất lượng tài sản / tăng trưởng / định giá) + bảng chấm điểm ★, kèm QUÝ MỚI NHẤT & YoY.",
    }.get(depth, "Vừa đủ, trọng tâm.")

    card_ctx = "\n\n".join(card_blocks)
    focus_note = (f"NGƯỜI DÙNG ĐÃ ĐÍNH KÈM: {', '.join(card_focus)}. TẬP TRUNG phân tích/giải thích/tóm tắt "
                  "ĐÚNG nội dung này; ưu tiên TÀI LIỆU ĐÍNH KÈM, dùng dữ liệu khác để bổ trợ quanh nó.\n\n"
                  if card_focus else "")

    prompt = (
        f"CÂU HỎI: {q}\n"
        f"Ý ĐỊNH NGƯỜI DÙNG: {intent or '(tự suy)'}\n"
        f"ĐỘ SÂU: {depth} — {depth_note}\n\n"
        f"{focus_note}"
        + (f"=== TÀI LIỆU NGƯỜI DÙNG ĐÍNH KÈM (ƯU TIÊN CAO NHẤT) ===\n{card_ctx}\n\n" if card_ctx else "")
        + f"=== DỮ LIỆU WEALBEE (nguồn chính) ===\n"
        f"{wb_ctx or '(không có dữ liệu nội bộ khớp)'}\n\n"
        f"=== DỮ LIỆU BỔ SUNG (vnstock/KG — ghi rõ nguồn) ===\n"
        f"{ext_ctx or '(không cần bổ sung)'}\n\n"
        f"=== KHUNG CÂU TRẢ LỜI (bám đúng yêu cầu — phủ ĐỦ các mục này là ĐỦ) ===\n{outline_block}\n\n"
        "YÊU CẦU: Trả lời ĐÚNG & ĐỦ các mục khung trên với CHẤT LƯỢNG. ĐẦY ĐỦ ≠ DÀI: súc tích, "
        "KHÔNG đệm chữ/lặp ý, không thêm mục ngoài khung; độ dài theo thực chất câu hỏi — mỗi câu phải "
        "thêm thông tin. Ưu tiên DỮ LIỆU WEALBEE, số bổ sung ghi nguồn. ROE/ROA hiển thị %. Tiếng Việt."
    )
    # ── TIẾN TRÌNH thực (hiển thị các bước đã chạy) ──
    n_syms, n_news, n_fin = _count_bundle(wb_bundle)
    steps = [{"label": f"Phân tích yêu cầu (độ sâu: {depth})", "status": "done"}]
    data_lbl = f"Lấy dữ liệu Wealbee · {n_syms} mã · {n_news} tin"
    if n_fin:
        data_lbl += f" · {n_fin} kỳ BCTC"
    steps.append({"label": data_lbl, "status": "done"})
    if any("BCTC vnstock" in g for g in gap_fill):
        steps.append({"label": "Bổ sung BCTC chi tiết (vnstock)", "status": "done"})
    if any("KG" in g for g in gap_fill):
        steps.append({"label": "Đồ thị nhân-quả vĩ mô→ngành (KG)", "status": "done"})

    text, used = _gen_with_fallback(prompt, _REPORT_SYS)
    steps.append({"label": "Tổng hợp báo cáo (Wealbee AI)", "status": "done"})
    return {"markdown": text, "sources": wb_refs, "model": used,
            "data_mode": wb_bundle.get("mode", "fallback"), "gap_fill": gap_fill,
            "steps": steps}


def _count_bundle(b: dict) -> tuple[int, int, int]:
    """Đếm (số mã, số tin, số kỳ BCTC) trong bundle để hiển thị tiến trình."""
    ns = nn = nf = 0
    if b.get("mode") == "plan":
        syms: set = set()
        for res in b.get("queries", []):
            rows = res.get("rows") or []
            tbl = res.get("table")
            if tbl == "market_news":
                nn += len(rows)
            elif tbl == "financials_annual":
                nf += len(rows)
            for r in rows:
                if r.get("symbol"):
                    syms.add(r["symbol"])
        ns = len(syms)
    else:
        stocks = b.get("stocks", {}) or {}
        ns = len(stocks)
        for rec in stocks.values():
            nn += len(rec.get("news") or [])
            nf += len(rec.get("financials") or [])
        nn += len(b.get("market_news") or [])
    return ns, nn, nf


_NO_CREDIT_MSG = ("⚠️ **Bạn đã hết Beeny hôm nay.** Beeny sẽ được nạp lại vào ngày mai, "
                  "hoặc nâng cấp gói để có thêm Beeny và nhiều agent hơn.")


def _charge(user_id: str | None, acc: dict, note: str) -> dict:
    """Trừ credit theo token thật sau khi chạy. Trả {credits_used, balance} (rỗng nếu không có user)."""
    if not user_id or not acc or (acc["in"] + acc["out"]) <= 0:
        return {}
    from core import credits as cr
    sb = wb._wb()
    if sb is None:
        return {}
    return cr.deduct(sb, user_id, acc["in"], acc["out"], note, acc.get("cached", 0))


@app.post("/analyze")
def analyze(inp: AnalyzeIn):
    if _client is None and _oa is None:
        return {"markdown": "⚠️ Chưa cấu hình model AI trên server.", "sources": []}
    # Chặn trước khi chạy nếu hết credit
    if inp.user_id:
        from core import credits as cr
        sb = wb._wb()
        if sb is not None:
            ok, bal = cr.has_credits(sb, inp.user_id)
            if not ok:
                return {"markdown": _NO_CREDIT_MSG, "sources": [],
                        "error": "not_enough_credits", "balance": bal}
    acc = _usage_begin()
    try:
        out = build_report(inp.message, inp.context, inp.context_cards)
        out.update({"tokens_in": acc["in"], "tokens_out": acc["out"]})
        out.update(_charge(inp.user_id, acc, "actionhub /analyze"))
        return out
    except Exception as e:
        return {"markdown": f"⚠️ Lỗi tạo báo cáo: {str(e)[:160]}", "sources": []}


# ── AGENT RUN (NGUỒN CHUNG cho scheduler / "Chạy thử" / "Run now") ──────────────
# Mọi đường chạy agent PHẢI đi qua build_agent_message + run_agent_core để đồng bộ
# tuyệt đối: cùng cách dựng prompt, cùng engine build_report, cùng cách lưu brief.

def build_agent_message(system_prompt: str | None, symbols=None, event_ctx: str = "") -> str:
    """Dựng nhiệm vụ gửi vào brain — DÙNG CHUNG cho mọi đường chạy agent."""
    base = (system_prompt or "Phân tích theo cấu hình agent.").strip()
    if base.startswith("__TARGET_SYMBOL__"):
        base = "\n".join(base.split("\n")[1:]).strip()
    syms = [s.upper() for s in (symbols or []) if s]
    msg = base
    if syms:
        msg += f"\n\nMã quan tâm: {', '.join(syms)}"
    if event_ctx:
        msg += (f"\n\n[SỰ KIỆN KÍCH HOẠT AGENT]\n{event_ctx}\n"
                "Hãy PHÂN TÍCH NGUYÊN NHÂN/Ý NGHĨA của sự kiện này (vì sao xảy ra, tác động).")
    return msg


def run_agent_core(*, system_prompt: str | None = "", symbols=None, event_ctx: str = "",
                   save_brief: bool = False, agent_id: str | None = None,
                   user_id: str | None = None, name: str = "Agent",
                   template_id: str | None = None, email_notify: bool = False) -> dict:
    """Chạy 1 agent qua brain → (tùy chọn) lưu brief + (tùy chọn) gửi email.
    email_notify: chỉ gửi email khi True (mặc định False = agent KHÔNG gửi email).
    Có user_id → CHẶN nếu hết credit + TRỪ credit theo token thật sau khi chạy."""
    # Chặn trước khi chạy nếu hết credit
    if user_id:
        from core import credits as cr
        sb0 = wb._wb()
        if sb0 is not None:
            ok, bal = cr.has_credits(sb0, user_id)
            if not ok:
                return {"markdown": _NO_CREDIT_MSG, "sources": [], "title": name or "Agent",
                        "summary": "Hết credit — không chạy được agent.", "brief_id": None,
                        "steps": [], "error": "not_enough_credits", "balance": bal,
                        "email_sent": False}

    acc = _usage_begin()
    syms = [s.upper() for s in (symbols or []) if s]
    msg = build_agent_message(system_prompt, syms, event_ctx)
    res = build_report(msg, symbols=syms or None)
    md = res.get("markdown", "") or ""
    sources = res.get("sources", []) or []
    steps = res.get("steps", []) or []

    # Rút title + summary (dùng chung — trùng logic scheduler cũ)
    title = name or "Agent"
    summary = ""
    for line in md.split("\n"):
        c = line.lstrip("#").replace("*", "").strip()
        if len(c) >= 8:
            if title == (name or "Agent"):
                title = c[:120]
            elif not summary:
                summary = c[:240]
                break
    if not summary:
        summary = md.replace("#", "").replace("*", "").strip()[:240] or title

    brief_id = None
    email_sent = False
    if save_brief and agent_id and user_id:
        sb = wb._wb()
        try:
            r = sb.table("briefs").insert({
                "user_id": user_id, "agent_id": agent_id,
                "title": title, "summary": summary, "content": md,
                "refs": sources, "sources": sources,
                "tickers": syms[:8], "type": template_id or "agent",
            }).execute()
            brief_id = (r.data or [{}])[0].get("id")
        except Exception as e:
            print(f"    [!] lưu brief lỗi: {str(e)[:140]}")

        # Gửi email CHỈ khi agent bật email_notify (mặc định off)
        if email_notify:
            try:
                from core.email_sender import get_user_email, send_brief_email
                to_email, _uname = get_user_email(sb, user_id)
                if to_email:
                    email_sent = send_brief_email(to_email, name or "Agent", title, md, sources)
                    print(f"    [mail] {'đã gửi' if email_sent else 'không gửi được'} → {to_email}")
            except Exception as e:
                print(f"    [!] email lỗi: {str(e)[:140]}")

    # Trừ credit theo token thật (mọi đường: Chạy thử / Run now / scheduler)
    charge = _charge(user_id, acc, f"agent:{name or 'Agent'}"[:80])

    return {"markdown": md, "sources": sources, "title": title, "summary": summary,
            "brief_id": brief_id, "steps": steps, "email_sent": email_sent,
            "tokens_in": acc["in"], "tokens_out": acc["out"], **charge}


class RunAgentIn(BaseModel):
    system_prompt: str | None = ""
    symbols: list[str] = []
    event_ctx: str = ""
    save_brief: bool = False
    agent_id: str | None = None
    user_id: str | None = None
    name: str = "Agent"
    template_id: str | None = None
    email_notify: bool = False


@app.post("/run-agent")
def run_agent_ep(inp: RunAgentIn):
    if _client is None:
        return {"markdown": "⚠️ Chưa cấu hình GEMINI_API_KEY trên server.", "sources": []}
    try:
        return run_agent_core(
            system_prompt=inp.system_prompt, symbols=inp.symbols, event_ctx=inp.event_ctx,
            save_brief=inp.save_brief, agent_id=inp.agent_id, user_id=inp.user_id,
            name=inp.name, template_id=inp.template_id, email_notify=inp.email_notify)
    except Exception as e:
        return {"markdown": f"⚠️ Lỗi chạy agent: {str(e)[:160]}", "sources": []}

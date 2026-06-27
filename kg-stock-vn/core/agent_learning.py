"""
agent_learning.py — LỚP HỌC LIÊN TỤC (P1 capture; P2 outcome/lessons sẽ bổ sung).
=================================================================================
P1: ghi nhận MỖI lượt phân tích (hành vi tool + chi phí) + NHẬN ĐỊNH định-lượng datable
(lấy DETERMINISTIC từ tool output — không cần LLM trích) + phản hồi người dùng.
Tất cả BEST-EFFORT: bảng chưa tạo / lỗi DB → degrade im lặng, KHÔNG làm hỏng câu trả lời.

Khuôn: TradingAgents (chấm realised-return → reflection) + Memento (học qua case-bank, không fine-tune).
P2 (sau): cron chấm outcome thị trường sau N ngày → sinh `lessons` (pgvector) → retrieve tiêm lại.
"""
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()


def _sb():
    from core.agent_config import get_supabase
    return get_supabase()


_GENAI_CLIENT = None


def _genai():
    # SINGLETON: tạo nhiều genai.Client → httpx transport dùng chung bị GC đóng giữa chừng
    # ("client has been closed"). Tái dùng 1 client cho cả eval/reflect/embed.
    global _GENAI_CLIENT
    if _GENAI_CLIENT is None:
        import os
        from google import genai
        _GENAI_CLIENT = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    return _GENAI_CLIENT


def _today_vn() -> str:
    return datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")


# ── Tóm tắt hành vi tool (cho cột agent_runs.tools) ──────────────────────────────
def summarize_tools(tool_calls: list) -> list:
    out = []
    for c in (tool_calls or []):
        r = c.get("result")
        out.append({
            "tool": c.get("tool"),
            "ticker": c.get("ticker") or (c.get("tickers") or [None])[0],
            "status": (r.get("status") if isinstance(r, dict) else None),
            "ms": c.get("ms"),
        })
    return out


# ── Trích NHẬN ĐỊNH định-lượng từ tool output (deterministic, datable) ───────────
# Map verdict → direction (+1 tích cực / -1 tiêu cực / 0 trung tính) để P2 chấm với chiều giá.
def _val_direction(s: str) -> int:
    s = (s or "").lower()
    if "rẻ" in s:
        return 1
    if "đắt" in s:
        return -1
    return 0


def extract_claims(tool_calls: list) -> tuple[dict, list]:
    """Trả (price_map {ticker:price}, claims[]). Claim = nhận định datable + chiều, để chấm outcome."""
    price_map = {}
    fin = {}        # ticker -> ratios
    for c in (tool_calls or []):
        r = c.get("result")
        if not isinstance(r, dict):
            continue
        tk = (c.get("ticker") or "").upper()
        if c.get("tool") == "get_market_price" and r.get("price"):
            price_map[tk] = r.get("price")
        if c.get("tool") == "get_financial_statements":
            ra = r.get("ratios") or {}
            if tk:
                fin[tk] = ra
            # giá ước tính từ BCTC nếu chưa có giá thị trường
            if tk and tk not in price_map and ra.get("gia_uoc_tinh_vnd"):
                price_map[tk] = ra.get("gia_uoc_tinh_vnd")

    as_of = _today_vn()
    claims = []

    def _add(tk, ctype, key, value, direction):
        if not value:
            return
        claims.append({
            "ticker": tk, "claim_type": ctype, "claim_key": key,
            "claim_value": str(value)[:120], "direction": direction,
            "as_of_date": as_of, "as_of_price": price_map.get(tk),
        })

    for tk, ra in fin.items():
        # ĐỊNH GIÁ
        _add(tk, "valuation", "peg_danh_gia", ra.get("peg_danh_gia"), _val_direction(ra.get("peg_danh_gia")))
        _add(tk, "valuation", "pe_vung_thi_truong", ra.get("pe_vung_thi_truong"),
             _val_direction(ra.get("pe_vung_thi_truong")))
        # CHẤT LƯỢNG LN — cờ dồn tích = tín hiệu tiêu cực
        flags = ra.get("co_dau_hieu_dong_tich") or []
        if flags:
            _add(tk, "quality", "accruals_flag", f"{len(flags)} khoản dồn tích đáng ngờ", -1)
        # VỊ THẾ ROE so lịch sử
        vt = (ra.get("vi_the_vs_lich_su") or {}).get("ROE") or {}
        if vt.get("vi_the"):
            d = 1 if "CAO" in vt["vi_the"] else (-1 if "THẤP" in vt["vi_the"] else 0)
            _add(tk, "quality", "vi_the_roe", vt["vi_the"], d)
    return price_map, claims


# ── GHI NHẬN (best-effort) ──────────────────────────────────────────────────────
def log_run(session_id, user_query, tickers, intent, model, tool_calls,
            latency_ms, answer) -> int | None:
    """Ghi 1 lượt vào agent_runs + claims datable. Trả run_id (None nếu lỗi/bảng chưa có)."""
    try:
        tools = summarize_tools(tool_calls)
        row = {
            "session_id": session_id, "user_query": (user_query or "")[:2000],
            "tickers": [t.upper() for t in (tickers or [])],
            "intent": intent, "model": model, "tools": tools,
            "n_tool_calls": len(tools), "latency_ms": int(latency_ms or 0),
            "answer_len": len(answer or ""), "answer_excerpt": (answer or "")[:6000],
        }
        res = _sb().table("agent_runs").insert(row).execute()
        run_id = (res.data or [{}])[0].get("id")
        if run_id:
            _, claims = extract_claims(tool_calls)
            if claims:
                for c in claims:
                    c["run_id"] = run_id
                _sb().table("agent_claims").insert(claims).execute()
        return run_id
    except Exception:
        return None


def record_feedback(run_id, rating: int, note: str = "", edited_text: str = "") -> bool:
    """Ghi 👍/👎 (+1/-1) + ghi chú/sửa vào user_feedback. Best-effort."""
    if not run_id:
        return False
    try:
        _sb().table("user_feedback").insert({
            "run_id": run_id, "rating": int(rating),
            "note": (note or "")[:1000], "edited_text": (edited_text or "")[:4000],
        }).execute()
        return True
    except Exception:
        return False


# ════════════════════════════════════════════════════════════════════════════════
# P2 — VÒNG HỌC TỪ KẾT QUẢ THỊ TRƯỜNG (outcome scoring → lessons → retrieve)
# ════════════════════════════════════════════════════════════════════════════════
def _hist(symbol: str, start: str, end: str):
    """Lịch sử giá đóng cửa (API mới vnstock.api.quote). None nếu lỗi."""
    try:
        from vnstock.api.quote import Quote
        import contextlib, io
        with contextlib.redirect_stdout(io.StringIO()):
            df = Quote(symbol=symbol, source="VCI").history(start=start, end=end, interval="1D")
        return df if (df is not None and not df.empty) else None
    except Exception:
        return None


def _period_return(symbol: str, start: str, end: str):
    """% thay đổi giá từ start→end (BẤT BIẾN đơn vị vì cùng nguồn). None nếu thiếu dữ liệu."""
    df = _hist(symbol, start, end)
    if df is None or len(df) < 2:
        return None
    try:
        a, b = float(df.iloc[0]["close"]), float(df.iloc[-1]["close"])
        return round((b / a - 1) * 100, 2) if a else None
    except Exception:
        return None


def _embed(text: str):
    """Embedding 768-chiều cho lessons (khớp lessons.embedding vector(768)). None nếu lỗi.
    LƯU Ý: text-embedding-004 đã 404; model hiện hành = gemini-embedding-001 (mặc định 3072 chiều)
    → ÉP output_dimensionality=768 cho khớp schema pgvector."""
    try:
        from google.genai import types
        r = _genai().models.embed_content(
            model="gemini-embedding-001", contents=text,
            config=types.EmbedContentConfig(output_dimensionality=768))
        v = list(r.embeddings[0].values)
        return v if len(v) == 768 else None
    except Exception:
        return None


def _reflect(claim: dict, ret: float, idx_ret, excess: float, correct: bool) -> str:
    """Sinh BÀI HỌC ngắn (Gemini lite) từ 1 nhận định đã có kết quả. Fallback template nếu lỗi."""
    verdict = "ĐÚNG" if correct else "SAI"
    fact = (f"Nhận định {claim['ticker']} ({claim['claim_key']}={claim['claim_value']}, "
            f"chiều {claim['direction']:+d}) ngày {claim['as_of_date']}: sau ~{claim['horizon_days']} ngày "
            f"giá {ret:+.1f}% vs VN-Index {idx_ret if idx_ret is None else f'{idx_ret:+.1f}%'} "
            f"(vượt {excess:+.1f}đ) → {verdict}.")
    try:
        from core.agent_config import GEMINI_MODELS, GEMINI_DEFAULT_IDX
        prompt = (fact + "\n\nViết 1 BÀI HỌC (1-2 câu, tiếng Việt) cho chuyên viên phân tích: vì sao "
                  "nhận định này đúng/sai và LƯU Ý gì cho lần phân tích mã/ngành tương tự sau. Ngắn gọn, "
                  "không lặp lại số. KHÔNG khuyến nghị mua/bán.")
        r = _genai().models.generate_content(model=GEMINI_MODELS[GEMINI_DEFAULT_IDX], contents=prompt)
        return (r.text or fact).strip()[:500]
    except Exception:
        return fact


def score_pending_outcomes(limit: int = 80, material_pct: float = 5.0, gen_lessons: bool = True) -> dict:
    """CHẤM các nhận định đã ĐỦ horizon (chống look-ahead: chỉ dùng giá SAU as_of_date).
    Tính return mã vs VN-Index → correct (excess cùng chiều). Nhận định MATERIAL (|excess|≥5đ) →
    sinh lesson (reflection) lưu `lessons`. Trả thống kê. Gọi tay (nút) hoặc cron."""
    today = datetime.now(timezone(timedelta(hours=7)))
    today_s = today.strftime("%Y-%m-%d")
    out = {"scored": 0, "correct": 0, "lessons": 0, "skipped": 0}
    try:
        rows = (_sb().table("agent_claims")
                .select("*").is_("scored_at", "null").neq("direction", 0)
                .order("as_of_date").limit(limit).execute().data) or []
    except Exception as e:
        return {"error": str(e)[:160], **out}

    for c in rows:
        try:
            as_of = c.get("as_of_date")
            horizon = c.get("horizon_days") or 60
            if not as_of:
                out["skipped"] += 1; continue
            due = (datetime.strptime(as_of, "%Y-%m-%d") + timedelta(days=horizon)).date()
            if due > today.date():            # chưa đủ horizon → để lần sau (không look-ahead/non-stationary nhiễu)
                out["skipped"] += 1; continue
            due_s = due.strftime("%Y-%m-%d")  # CHẤM tới đúng as_of+horizon (không kéo tới hôm nay → khỏi lệch)
            ret = _period_return(c["ticker"], as_of, due_s)
            if ret is None:
                out["skipped"] += 1; continue
            idx_ret = _period_return("VNINDEX", as_of, due_s)
            excess = ret - (idx_ret or 0.0)
            correct = (c["direction"] > 0 and excess > 0) or (c["direction"] < 0 and excess < 0)
            _sb().table("agent_claims").update({
                "scored_at": today.isoformat(), "outcome_return_pct": ret,
                "index_return_pct": idx_ret, "correct": correct,
            }).eq("id", c["id"]).execute()
            out["scored"] += 1
            out["correct"] += 1 if correct else 0
            # LESSON chỉ cho nhận định MATERIAL (tránh học nhiễu) — ưu tiên cái SAI
            if gen_lessons and abs(excess) >= material_pct:
                lesson = _reflect(c, ret, idx_ret, excess, correct)
                row = {"scope": "ticker", "ticker": c["ticker"], "lesson": lesson,
                       "source": "outcome", "source_id": c["id"],
                       "confidence": min(0.9, abs(excess) / 30 + 0.4),
                       "decay_at": (today + timedelta(days=365)).isoformat()}
                emb = _embed(lesson)
                if emb:
                    row["embedding"] = emb
                _sb().table("lessons").insert(row).execute()
                out["lessons"] += 1
        except Exception:
            out["skipped"] += 1
    return out


def retrieve_lessons(ticker: str = "", sector: str = "", limit: int = 4) -> list[str]:
    """Lấy BÀI HỌC liên quan (active, chưa decay) để TIÊM vào phân tích sau. v1: lọc theo mã/ngành
    (đơn giản, chắc); embedding để dành cho semantic cross-mã sau."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        q = (_sb().table("lessons").select("lesson,ticker,confidence,created_at")
             .eq("active", True).order("created_at", desc=True).limit(20))
        if ticker:
            q = q.eq("ticker", ticker.upper())
        rows = q.execute().data or []
        rows = [r for r in rows if not r.get("decay_at") or r["decay_at"] > now]
        return [r["lesson"] for r in rows[:limit] if r.get("lesson")]
    except Exception:
        return []


# ════════════════════════════════════════════════════════════════════════════════
# P3 — SELF-EVAL (LLM-judge) + ĐỀ XUẤT CẢI TIẾN (human-gated)
# ════════════════════════════════════════════════════════════════════════════════
import json as _json

_RUBRIC = ("evidence (mỗi luận điểm có SỐ+nguồn+thời điểm), citation (chỉ link web http sạch; KHÔNG "
           "'[Knowledge Graph]'/'Trọng số'/lời gọi tool), structure (bảng/phân tầng rõ), calibration "
           "(không quá chắc; rủi ro CÓ SỐ; lưu ý chu kỳ), compliance (KHÔNG khuyến nghị mua/bán + có "
           "disclaimer), clarity (dễ đọc, số quan trọng bôi đậm)")


def evaluate_pending_runs(limit: int = 25) -> dict:
    """LLM-judge chấm các lượt CHƯA eval (theo rubric) → lưu answer_evals. Batch (không thêm độ trễ
    cho user). Gọi tay (nút) hoặc cron."""
    out = {"evaluated": 0, "avg_overall": None, "skipped": 0}
    try:
        runs = (_sb().table("agent_runs").select("id,user_query,answer_excerpt,intent")
                .order("created_at", desc=True).limit(limit * 3).execute().data) or []
        done = {r["run_id"] for r in (_sb().table("answer_evals").select("run_id")
                .order("id", desc=True).limit(500).execute().data or [])}
    except Exception as e:
        return {"error": str(e)[:160], **out}
    runs = [r for r in runs if r["id"] not in done and (r.get("answer_excerpt") or "")][:limit]
    if not runs:
        return out
    from core.agent_config import GEMINI_MODELS, GEMINI_DEFAULT_IDX
    cli = _genai()
    totals = []
    for r in runs:
        try:
            prompt = (
                f"Bạn là GIÁM KHẢO chất lượng phân tích tài chính. Chấm câu trả lời dưới đây theo rubric "
                f"(mỗi tiêu chí 0..1): {_RUBRIC}.\n\nCÂU HỎI: {r['user_query']}\n\nTRẢ LỜI (trích):\n"
                f"{r['answer_excerpt'][:5000]}\n\nTRẢ VỀ JSON DUY NHẤT: "
                f'{{"evidence":0..1,"citation":0..1,"structure":0..1,"calibration":0..1,'
                f'"compliance":0..1,"clarity":0..1,"critique":"1-2 câu điểm yếu chính"}}')
            resp = cli.models.generate_content(model=GEMINI_MODELS[GEMINI_DEFAULT_IDX], contents=prompt)
            txt = (resp.text or "").strip()
            s = txt[txt.find("{"): txt.rfind("}") + 1]
            d = _json.loads(s)
            dims = ["evidence", "citation", "structure", "calibration", "compliance", "clarity"]
            scores = {k: float(d.get(k, 0)) for k in dims}
            overall = round(sum(scores.values()) / len(dims), 3)
            _sb().table("answer_evals").insert({
                "run_id": r["id"], "scores": scores, "overall": overall,
                "critique": str(d.get("critique", ""))[:500]}).execute()
            out["evaluated"] += 1
            totals.append(overall)
        except Exception:
            out["skipped"] += 1
    if totals:
        out["avg_overall"] = round(sum(totals) / len(totals), 3)
    return out


def propose_improvements(low_thresh: float = 0.6, lookback: int = 200) -> dict:
    """Gom điểm eval THẤP + 👎 + nhận định SAI → LLM tổng hợp ≤5 ĐỀ XUẤT cải tiến (DRAFT, human-gated).
    KHÔNG tự áp — lưu improvement_proposals.status='draft' để người duyệt (chống drift/reward-hacking)."""
    out = {"proposals": 0, "signals": {}}
    try:
        evals = (_sb().table("answer_evals").select("run_id,overall,critique,scores")
                 .lt("overall", low_thresh).order("created_at", desc=True).limit(lookback).execute().data) or []
        downs = (_sb().table("user_feedback").select("run_id,note")
                 .eq("rating", -1).order("created_at", desc=True).limit(lookback).execute().data) or []
        wrong = (_sb().table("agent_claims").select("ticker,claim_key,claim_value,outcome_return_pct,index_return_pct")
                 .eq("correct", False).not_.is_("scored_at", "null").order("scored_at", desc=True).limit(lookback).execute().data) or []
    except Exception as e:
        return {"error": str(e)[:160], **out}
    out["signals"] = {"low_evals": len(evals), "thumbs_down": len(downs), "wrong_claims": len(wrong)}
    if not (evals or downs or wrong):
        return out
    crit = [e.get("critique", "") for e in evals if e.get("critique")][:20]
    wrongs = [f"{w['ticker']} {w['claim_key']}={w['claim_value']} (mã {w.get('outcome_return_pct')}% vs index {w.get('index_return_pct')}%)"
              for w in wrong][:20]
    try:
        from core.agent_config import GEMINI_MODELS, GEMINI_DEFAULT_IDX
        prompt = (
            "Bạn là CTO/ML engineer cải tiến 1 AI Agent phân tích tài chính (KHÔNG fine-tune — chỉ chỉnh "
            "PROMPT/KNOWLEDGE CARD/chính sách tool). Dưới đây là TÍN HIỆU YẾU gom được:\n\n"
            f"• Phê bình từ self-eval điểm thấp:\n" + "\n".join(f"  - {c}" for c in crit) + "\n\n"
            f"• Nhận định SAI vs thị trường:\n" + "\n".join(f"  - {w}" for w in wrongs) + "\n\n"
            f"• Số lượt 👎: {len(downs)}\n\n"
            "Đề xuất TỐI ĐA 5 cải tiến CỤ THỂ, khả thi. TRẢ VỀ JSON DUY NHẤT: "
            '{"proposals":[{"kind":"knowledge_card|prompt_tweak|tool_policy","title":"...",'
            '"detail":"nội dung cụ thể áp được","rationale":"dựa tín hiệu nào"}]}')
        resp = _genai().models.generate_content(model=GEMINI_MODELS[GEMINI_DEFAULT_IDX], contents=prompt)
        txt = (resp.text or "").strip()
        data = _json.loads(txt[txt.find("{"): txt.rfind("}") + 1])
        for p in (data.get("proposals") or [])[:5]:
            _sb().table("improvement_proposals").insert({
                "kind": str(p.get("kind", "prompt_tweak"))[:40], "title": str(p.get("title", ""))[:200],
                "detail": str(p.get("detail", ""))[:2000], "rationale": str(p.get("rationale", ""))[:1000],
                "evidence": out["signals"], "status": "draft"}).execute()
            out["proposals"] += 1
    except Exception as e:
        out["error"] = str(e)[:160]
    return out


# ════════════════════════════════════════════════════════════════════════════════
# P4 — TỐI ƯU CHÍNH SÁCH TOOL từ log (tool nào hữu ích / lãng phí / chậm)
# ════════════════════════════════════════════════════════════════════════════════
def analyze_tool_usage(lookback: int = 500) -> dict:
    """Gom thống kê per-tool từ agent_runs.tools: số lần gọi, tỷ lệ EMPTY/ERROR/RATE_LIMIT, latency TB.
    → nhận diện tool LÃNG PHÍ (hay rỗng/lỗi) hoặc CHẬM để tối ưu chính sách gọi. Read-only."""
    try:
        runs = (_sb().table("agent_runs").select("tools")
                .order("created_at", desc=True).limit(lookback).execute().data) or []
    except Exception as e:
        return {"error": str(e)[:160], "tools": {}}
    stat = {}
    for r in runs:
        for t in (r.get("tools") or []):
            name = t.get("tool")
            if not name:
                continue
            s = stat.setdefault(name, {"calls": 0, "empty": 0, "error": 0, "ms_sum": 0, "ms_n": 0})
            s["calls"] += 1
            st_ = (t.get("status") or "").upper()
            if st_ in ("EMPTY", "NO_DATA", "NO_NEWS", "NOT_IN_KG"):
                s["empty"] += 1
            if st_ in ("ERROR", "RATE_LIMIT", "VNSTOCK_ERROR", "DB_ERROR", "FETCH_FAIL"):
                s["error"] += 1
            if isinstance(t.get("ms"), (int, float)):
                s["ms_sum"] += t["ms"]; s["ms_n"] += 1
    tools = {}
    for name, s in stat.items():
        tools[name] = {
            "calls": s["calls"],
            "empty_rate": round(s["empty"] / s["calls"], 2),
            "error_rate": round(s["error"] / s["calls"], 2),
            "avg_ms": round(s["ms_sum"] / s["ms_n"]) if s["ms_n"] else None,
        }
    ranked = dict(sorted(tools.items(), key=lambda kv: -(kv[1]["empty_rate"] + kv[1]["error_rate"])))
    return {"n_runs": len(runs), "tools": ranked}


def propose_tool_policy(min_calls: int = 8, waste_thresh: float = 0.5, slow_ms: int = 12000) -> dict:
    """Từ analyze_tool_usage → tạo đề xuất CHÍNH SÁCH TOOL (DRAFT, human-gated): tool hay rỗng/lỗi →
    cân nhắc bỏ/cache/fallback; tool chậm → cache/parallel. KHÔNG tự áp."""
    out = {"proposals": 0}
    a = analyze_tool_usage()
    if a.get("error"):
        return {"error": a["error"], **out}
    for name, s in (a.get("tools") or {}).items():
        if s["calls"] < min_calls:
            continue
        waste = s["empty_rate"] + s["error_rate"]
        flags = []
        if waste >= waste_thresh:
            flags.append(f"lãng phí (rỗng {int(s['empty_rate']*100)}% + lỗi {int(s['error_rate']*100)}%)")
        if s["avg_ms"] and s["avg_ms"] >= slow_ms:
            flags.append(f"chậm (~{s['avg_ms']}ms TB)")
        if not flags:
            continue
        try:
            _sb().table("improvement_proposals").insert({
                "kind": "tool_policy", "title": f"Tool `{name}`: {', '.join(flags)}",
                "detail": (f"Tool `{name}` gọi {s['calls']} lần — {', '.join(flags)}. Cân nhắc: cache lâu hơn / "
                           f"fallback nguồn khác / bỏ khỏi pre-fetch mặc định cho intent ít cần / chạy song song."),
                "rationale": f"Thống kê {a['n_runs']} lượt gần nhất: {s}",
                "evidence": s, "status": "draft"}).execute()
            out["proposals"] += 1
        except Exception:
            pass
    return out

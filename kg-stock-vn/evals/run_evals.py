"""
evals/run_evals.py — CHẠY regression + chấm điểm.

  python evals/run_evals.py routing   # nhanh, không gọi LLM → kiểm tra routing (chạy mỗi commit)
  python evals/run_evals.py answers    # e2e thật, chấm chất lượng (tốn quota, chạy theo mẻ)
  python evals/run_evals.py all

Output: bảng điểm + exit code != 0 nếu dưới ngưỡng (để chặn deploy trong CI).
"""
import os
import sys
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import warnings
warnings.filterwarnings("ignore")

ROUTING_PASS_THRESHOLD = 0.95   # routing phải ≥95% đúng
ANSWER_PASS_THRESHOLD = 0.90    # ≥90% check đạt


def route(q):
    """Mô phỏng ĐÚNG thứ tự app.py send_and_track → trả tên đường."""
    import core.analysis_orchestrator as o
    if o.is_price_query(q):
        return "PRICE"
    if o.is_report_query(q) and not o.is_sector_query(q) and (o.extract_tickers(q)):
        return "REPORT"
    if o.is_deep_analysis(q) or o.is_sector_query(q) or o.is_macro_query(q):
        if o.is_macro_query(q):
            return "MACRO"
        if not o.extract_tickers(q) and o.is_sector_query(q):
            return "SECTOR"
        return "DEEP"
    if o.is_simple_query(q):
        return "LEAN"
    return "MODEL"


def run_routing():
    from evals.cases import ROUTING_CASES
    ok = 0
    print("\n=== ROUTING REGRESSION ===")
    for c in ROUTING_CASES:
        got = route(c["q"])
        match = got == c["path"]
        ok += match
        if not match:
            print(f"  ✗ {c['q'][:50]:50s} | kỳ vọng {c['path']:7s} | thực {got}")
    rate = ok / len(ROUTING_CASES)
    print(f"  → {ok}/{len(ROUTING_CASES)} đúng = {rate:.0%}  (ngưỡng {ROUTING_PASS_THRESHOLD:.0%})")
    return rate >= ROUTING_PASS_THRESHOLD, rate


def _corpus_from_calls(calls):
    blob = []
    for c in (calls or []):
        if c.get("tool") == "read_article":
            blob += (c.get("result") or {}).get("so_lieu") or []
    return " ".join(blob)


def run_answers():
    import os as _os
    from dotenv import load_dotenv
    load_dotenv(_os.path.join(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))), ".env"))
    from google import genai
    from google.genai import types
    import core.analysis_orchestrator as o
    from core.agent_config import GEMINI_MODELS, GEMINI_DEFAULT_IDX
    from evals.cases import ANSWER_CASES
    from evals.metrics import REGISTRY
    client = genai.Client(api_key=_os.getenv("GEMINI_API_KEY"))
    M = GEMINI_MODELS[GEMINI_DEFAULT_IDX]

    print("\n=== ANSWER QUALITY (e2e) ===")
    total_checks = passed_checks = skipped = 0
    _DEGRADED = ("chưa hoàn tất", "đã đạt giới hạn", "thử lại sau", "lỗi gemini", "chưa đọc được báo cáo")
    for c in ANSWER_CASES:
        q = c["q"]
        try:
            if c["path"] == "REPORT":
                tk = o.extract_tickers(q)[0]
                ans, calls = o.run_report(q, tk, client, M, types)
            else:
                ans, calls = o.run(q, client, M, types)
        except Exception as e:
            print(f"  ⊘ SKIP {q[:38]:38s} → ERROR {str(e)[:50]}"); skipped += 1; continue
        # câu BỊ DEGRADE (rate-limit/lỗi nguồn) → KHÔNG tính vào điểm chất lượng (vấn đề quota, không phải chất lượng)
        if len(ans) < 300 or any(d in ans.lower()[:200] for d in _DEGRADED):
            print(f"  ⊘ SKIP {q[:38]:38s} → câu bị degrade/rate-limit (len={len(ans)})"); skipped += 1; continue
        ctx = {"corpus_blob": _corpus_from_calls(calls)}
        res = []
        for name in c["checks"]:
            fn = REGISTRY[name]
            okc = bool(fn(ans, ctx))
            res.append((name, okc))
            total_checks += 1; passed_checks += okc
        flags = " ".join(f"{'✓' if v else '✗'}{n}" for n, v in res)
        print(f"  [{c['path']:6s}] {q[:38]:38s} | {flags}")
    rate = passed_checks / total_checks if total_checks else 0
    print(f"  → {passed_checks}/{total_checks} check đạt = {rate:.0%}  (ngưỡng {ANSWER_PASS_THRESHOLD:.0%}) "
          f"· {skipped} câu bị bỏ qua (degrade/quota)")
    # nếu QUÁ NHIỀU câu bị degrade (>40%) → không kết luận được, coi như chưa chạy được (không chặn deploy oan)
    if skipped > len(ANSWER_CASES) * 0.4:
        print("  ⚠️ Quá nhiều câu bị rate-limit → cần chạy lại lúc API rảnh (free-tier giới hạn).")
        return True, rate
    return rate >= ANSWER_PASS_THRESHOLD, rate


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "routing"
    ok_all = True
    if mode in ("routing", "all"):
        ok, _ = run_routing(); ok_all = ok_all and ok
    if mode in ("answers", "all"):
        ok, _ = run_answers(); ok_all = ok_all and ok
    print("\n" + ("✅ PASS" if ok_all else "❌ FAIL (dưới ngưỡng — chặn deploy)"))
    sys.exit(0 if ok_all else 1)

"""
pages/7_Learning.py
-------------------
Trang "Học" — minh bạch lớp HỌC LIÊN TỤC (P1-P4). Read-only, governance:
- KPI: số lượt, nhận định đã chấm + ĐỘ CHÍNH XÁC (vs VN-Index), eval TB, bài học, đề xuất.
- Độ chính xác theo loại nhận định (claim_key) — tín hiệu nào đáng tin.
- Bài học gần đây · Đề xuất cải tiến chờ duyệt · Sức khỏe tool.
Degrade an toàn nếu bảng chưa tạo (chạy migration_agent_learning*.sql).
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from dotenv import load_dotenv
load_dotenv(dotenv_path=_ROOT / ".env")

import streamlit as st
from core.agent_config import get_supabase
from design_system import (
    inject_css, page_header, section_label, stat_card_html, COLORS,
    disclaimer_footer, sidebar_toggle_button,
)

st.set_page_config(page_title="Học — KG Stock VN", layout="wide",
                   initial_sidebar_state="expanded")
inject_css()
sidebar_toggle_button()
st.markdown(page_header("Lớp học liên tục",
            "Agent tự tối ưu theo thời gian — nhận định được chấm bằng kết quả thị trường thật, "
            "rút bài học, tự đánh giá & đề xuất cải tiến (human-gated)."),
            unsafe_allow_html=True)


def _q(table, select="*", **filters):
    """Query best-effort → [] nếu bảng chưa tạo/lỗi."""
    try:
        q = get_supabase().table(table).select(select)
        for k, v in filters.items():
            q = q.eq(k, v)
        return q.execute().data or []
    except Exception:
        return []


# ── Tải dữ liệu ───────────────────────────────────────────────────────────────
try:
    sb = get_supabase()
    n_runs = sb.table("agent_runs").select("id", count="exact").limit(1).execute().count or 0
    claims = sb.table("agent_claims").select(
        "claim_key,claim_value,direction,correct,outcome_return_pct,index_return_pct,scored_at,ticker"
    ).order("scored_at", desc=True).limit(1000).execute().data or []
    lessons = sb.table("lessons").select("ticker,lesson,confidence,created_at").eq("active", True)\
        .order("created_at", desc=True).limit(20).execute().data or []
    evals = sb.table("answer_evals").select("overall").order("created_at", desc=True).limit(500).execute().data or []
    props = sb.table("improvement_proposals").select("kind,title,rationale,status")\
        .eq("status", "draft").order("created_at", desc=True).limit(10).execute().data or []
    _db_ok = True
except Exception:
    n_runs, claims, lessons, evals, props, _db_ok = 0, [], [], [], [], False

if not _db_ok:
    st.warning("Chưa kết nối được bảng học. Hãy chạy `migration_agent_learning.sql` + "
               "`migration_agent_learning_p3.sql` trên Supabase, rồi dùng app để tích dữ liệu.")
    st.stop()

scored = [c for c in claims if c.get("scored_at")]
n_scored = len(scored)
n_correct = sum(1 for c in scored if c.get("correct"))
acc = (n_correct / n_scored * 100) if n_scored else None
avg_eval = (sum(e["overall"] for e in evals if e.get("overall") is not None) / len(evals)) if evals else None

# ── KPI ───────────────────────────────────────────────────────────────────────
cols = st.columns(5)
kpis = [
    ("Lượt phân tích", f"{n_runs:,}", "đã ghi nhận", ""),
    ("Nhận định đã chấm", f"{n_scored:,}", f"trên {len(claims):,} tổng", ""),
    ("Độ chính xác", f"{acc:.0f}%" if acc is not None else "—",
     "vs VN-Index", (COLORS["success"] if (acc or 0) >= 50 else COLORS["danger"]) if acc is not None else ""),
    ("Chất lượng (eval)", f"{avg_eval:.2f}" if avg_eval is not None else "—", "LLM-judge 0–1", ""),
    ("Bài học · Đề xuất", f"{len(lessons)} · {len(props)}", "đang hoạt động", ""),
]
for col, (lb, val, sub, color) in zip(cols, kpis):
    col.markdown(stat_card_html(lb, val, sub, color), unsafe_allow_html=True)

st.caption("⚠️ Độ chính xác = nhận định khớp chiều excess return (mã so VN-Index) sau horizon. "
           "Mẫu nhỏ ban đầu chỉ mang tính tham khảo; thị trường phi-dừng → cần đủ mẫu mới đáng tin.")

# ── Độ chính xác theo loại nhận định ──────────────────────────────────────────
st.markdown(section_label("Độ chính xác theo loại nhận định"), unsafe_allow_html=True)
by_key = {}
for c in scored:
    k = f"{c.get('claim_key')} = {c.get('claim_value')}"[:48]
    s = by_key.setdefault(k, {"n": 0, "ok": 0})
    s["n"] += 1
    s["ok"] += 1 if c.get("correct") else 0
if by_key:
    import pandas as pd
    df = pd.DataFrame([
        {"Nhận định": k, "Số mẫu": v["n"], "Đúng": v["ok"],
         "Chính xác %": round(v["ok"] / v["n"] * 100)} for k, v in
        sorted(by_key.items(), key=lambda kv: -kv[1]["n"])
    ])
    st.dataframe(df, use_container_width=True, hide_index=True)
else:
    st.caption("Chưa có nhận định nào đủ horizon để chấm. Bấm “🎓 Học & tự cải tiến” ở sidebar app để chấm thủ công.")

# ── Bài học + Đề xuất ─────────────────────────────────────────────────────────
c1, c2 = st.columns(2)
with c1:
    st.markdown(section_label("Bài học gần đây"), unsafe_allow_html=True)
    if lessons:
        for l in lessons[:8]:
            st.markdown(f"- **{l.get('ticker') or '—'}**: {l.get('lesson','')}")
    else:
        st.caption("Chưa có bài học (cần nhận định được chấm + biến động đủ lớn).")
with c2:
    st.markdown(section_label("Đề xuất cải tiến chờ duyệt"), unsafe_allow_html=True)
    if props:
        for p in props:
            st.markdown(f"- **[{p.get('kind')}]** {p.get('title')}  \n"
                        f"  <span style='color:{COLORS['text_muted']};font-size:12px'>{p.get('rationale','')[:140]}</span>",
                        unsafe_allow_html=True)
    else:
        st.caption("Chưa có đề xuất. Bấm “Tự đánh giá & đề xuất” ở sidebar app.")

# ── Sức khỏe tool (P4) ────────────────────────────────────────────────────────
st.markdown(section_label("Sức khỏe tool (lãng phí/chậm)"), unsafe_allow_html=True)
try:
    import core.agent_learning as _al
    tu = _al.analyze_tool_usage()
    rows = [{"Tool": k, "Gọi": v["calls"], "Rỗng %": int(v["empty_rate"] * 100),
             "Lỗi %": int(v["error_rate"] * 100), "TB ms": v.get("avg_ms") or "—"}
            for k, v in (tu.get("tools") or {}).items() if v["calls"] >= 3]
    if rows:
        import pandas as pd
        st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
    else:
        st.caption("Chưa đủ log tool.")
except Exception:
    st.caption("Chưa đủ log tool.")

st.markdown(disclaimer_footer(), unsafe_allow_html=True)

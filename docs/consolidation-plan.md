# Kế hoạch hợp nhất bộ não Wealbee về VPS

> Quyết định: **dồn toàn bộ bộ não về VPS Python (`kg-stock-vn`)**. Supabase = dữ liệu/auth, Vercel = giao diện, VPS = một bộ não duy nhất. Soạn 2026-07-12.

## 1. Hiện trạng — vì sao lộn xộn

Cùng đọc chung bảng `agents` trong Supabase, **hai engine khác nhau** thực thi cùng một agent:

| Luồng | Engine | Model | KG | Framework | Credits | Provenance |
|---|---|---|---|---|---|---|
| Chạy **tay** (bấm nút) | Supabase Edge `run-agent` (TS) | gpt-4.1-mini | ❌ | ✅ `framework_versions` | ✅ | ✅ (ledger) |
| Chạy **theo lịch** | VPS `scheduler_local.py` → `run_agent_core` (Python) | Gemini | ✅ | ❌ (CARDS) | ✅ | ❌ |
| **Chat** | Supabase Edge `bee-ai-chat` (TS) | gpt-4.1-mini | ❌ | — | ✅ | — |
| **Studio test** | Supabase Edge `agent-dry-run` (TS) | gpt-4.1-mini | ❌ | — | — | — |

**Hệ quả:** cùng 1 agent, chạy tay ≠ chạy lịch (khác model, khác tri thức). Đây là gốc rễ "lộn xộn".

## 2. Kiến trúc đích

```
Vercel (frontend)  ──HTTP──▶  VPS api.wealbee.com  ──▶  Supabase (DB/Auth/Storage)
   React, chỉ UI            BỘ NÃO DUY NHẤT (Python)      nguồn chân lý:
                            - run-agent (tay + lịch)       users, credits, agents,
                            - chat, analyze                briefs, framework_versions
                            - KG nhân-quả                  (Edge Fn: chỉ webhook/auth/pay)
                            - đọc framework từ DB
                            - cron pipeline
```

Nguyên tắc: **Supabase = dữ liệu, VPS = một bộ não, Vercel = giao diện.** Edge Functions chỉ giữ webhook/auth/payment (`admin-auth`, `zalo-webhook`, `resend-webhook`, `sepay-ipn`, `demo-*`, `framework-eval`, `create-checkout`, `embed-document`). **Ngừng route** 4 function brain: `run-agent`, `agent-scheduler`, `bee-ai-chat`, `agent-dry-run`.

## 3. Phân tích khoảng cách (VPS brain đã có gì / thiếu gì)

VPS `serve.py` **đã có sẵn** (khảo sát 2026-07-12):
- `POST /run-agent` (dòng 656) → `run_agent_core` (dòng 569): system_prompt, symbols, save_brief, agent_id, user_id, template_id, email_notify.
- `POST /analyze`, `GET /health`.
- **Credits**: đo token thật (dòng 53), chặn khi hết (dòng 531-539), trừ sau khi chạy (dòng 517) qua `core/credits.py`.
- **KG** nhân-quả (`markets/vn/knowledge.py`) — có sẵn, dùng tự động.
- **Briefs + email** (Resend) — có sẵn.

VPS brain **còn thiếu** so với Edge `run-agent`:
| Thiếu | Ảnh hưởng | Ưu tiên |
|---|---|---|
| **SSE streaming** (`/run-agent` trả JSON blocking) | UI chạy tay mất hiệu ứng live (step/chunk) | Cao (UX) |
| **Đọc `framework_versions` từ Supabase** (đang hardcode CARDS) | Admin Panel chưa điều khiển được brain | Cao |
| **Provenance ledger** (`agent_tool_calls`/`output_claims`) | Mất tầng audit grounding | Trung bình |
| **Guard fail-fast** khi deep_research không có mã | Bịa mã "VNH" | Cao (an toàn) |

## 4. Frontend — các call-site cần chuyển

| File:line | Hiện gọi | Chuyển thành |
|---|---|---|
| `src/pages/app/agents.tsx:556` | Supabase `run-agent` (SSE) | VPS `api.wealbee.com/run-agent` (SSE) |
| `src/pages/app/agent-studio-new.tsx:716` | Supabase `agent-dry-run` | VPS (chế độ dry-run, không lưu brief) |
| `src/lib/supabase/bee-ai.ts:56` | Supabase `bee-ai-chat` (SSE) | VPS chat endpoint |
| `src/pages/admin/admin-frameworks.tsx:293` | `framework-eval` | **giữ nguyên** (governance ở Supabase) |

Biến môi trường đã có: `VITE_KG_API_URL=https://api.wealbee.com` (frontend gọi VPS cho KG). Tái dùng cho run-agent/chat.

## 5. Kế hoạch triển khai theo phase

### Phase 0 — Ổn định (ĐÃ LÀM phần lớn 2026-07-12)
- [x] Audit `agent-scheduler` Edge (không caller trong repo → dormant; xác nhận cuối ở Dashboard → Database → Cron).
- [x] Đổi tên `20260711000000_feedback.sql` → `20260712000000_feedback.sql`.
- [x] Gỡ `_shared/prompts.ts` orphaned, gitignore `test-results/`.
- [ ] **P0.2 Guard fail-fast** deep_research không có mã → báo lỗi rõ ràng (frontend `agents.tsx` chặn trước + brain `run_agent_core` kiểm tra). Xem §7.
- [ ] **Đóng băng** không sửa thêm Edge Function brain (sắp bỏ).

### Phase 1 — Brain VPS thay Edge (2–3 ngày)
1. **VPS đọc `framework_versions` từ Supabase**: thêm `core/framework.py` (port `resolveFramework`/`applyToolPolicy`/`buildFrameworkPrompt` sang Python), `run_agent_core` ghép rules từ DB (fallback CARDS). Giữ Admin Panel làm bảng điều khiển.
2. **SSE cho `/run-agent`**: đổi endpoint sang `StreamingResponse` phát event `step`/`chunk`/`done` khớp format frontend đang parse (xem `agents.tsx` SSE handler).
3. **Provenance** (tùy chọn): `run_agent_core` ghi `agent_tool_calls`/`output_claims` (port `_shared/provenance.ts`).
4. **Frontend switch**: đổi 3 call-site (§4) sang `VITE_KG_API_URL`. `npm run check` trước push.
5. **Ngừng** Edge `run-agent`/`agent-scheduler`/`bee-ai-chat`/`agent-dry-run` (giữ code, chỉ bỏ route + tắt trigger).
6. **Test A/B**: cùng agent, tay vs lịch → **output GIỐNG NHAU** (cùng brain + KG + framework).

### Phase 2 — Chuẩn hóa tri thức (1–2 ngày)
7. Ranh giới rõ: **framework** (khung tư duy) ở Supabase DB; **KG** (nhân-quả) ở `knowledge.py` code. Không trùng.
8. Điền `tickers.beta` (`compute_beta`) → KG xuống cấp mã × Beta.
9. Map `tickers.sector` (text VN) ↔ node ngành KG.

### Phase 3 — Vận hành (1 ngày)
10. Monitoring VPS (systemd alert, uptime, disk), backup DB định kỳ, tài liệu "ai làm gì".

## 6. Rủi ro & rollback
- **VPS single point of failure**: hiện chấp nhận; cần backup + alert. HA sau (VM thứ 2 + LB).
- **Rollback Phase 1**: frontend đổi endpoint qua biến môi trường → chỉ cần trỏ lại Supabase là quay về brain cũ. Edge Functions giữ nguyên code (chỉ ngừng route), bật lại nhanh.
- **Credit double-charge**: đảm bảo chỉ MỘT brain trừ credit mỗi run (sau hợp nhất, chỉ VPS).

## 7. P0.2 — Guard fail-fast (chi tiết)
Triệu chứng: agent `deep_research` chạy không mã → tool không có ticker → model bịa "VNH" (không có trong `tickers`).
- **Frontend** (`agents.tsx` trước khi gọi run): nếu `template_id==='deep_research'` và `target_symbols` rỗng và người dùng chưa nhập mã → chặn, hiện "Vui lòng chọn mã cổ phiếu".
- **Brain** (`run_agent_core`): nếu cần-mã mà `symbols` rỗng → trả lỗi `{error:'symbol_required'}` thay vì chạy → không bao giờ ra báo cáo bịa.

## 8. Việc đã xong tuần này (bối cảnh)
- Framework mới (chưng cất CARDS) đã published trên Supabase: `deep_research.default@v2`, `deep_research.bank@v1`, `daily_digest.default@v2`, `default.default@v2`.
- Edge `run-agent` v141 đã deploy (có framework) — sẽ được thay ở Phase 1.
- Bảng provenance Phase 4 đã áp lên production.

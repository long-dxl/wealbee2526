# Kiến trúc Wealbee — Hạ tầng cho AI Agent Tài chính

> **Tầm nhìn:** Wealbee là *hạ tầng* để user tự dựng AI Agent tài chính — kết nối các **LLM hàng đầu** với **bộ khung tư duy độc quyền** (tách rời, cập nhật theo version), đứng **trung gian** giữa LLM (được prompt theo từng nhiệm vụ) và các **công cụ dữ liệu tài chính** (tổng hợp trong DB hoặc kéo API — **không bịa số / no-fiction**).
>
> Ẩn dụ chủ đạo: Wealbee = **"AWS cho AI Agent tài chính"** — người khác *dựng agent lên trên*, không phải tự viết lại lõi.

---

## Mục lục
1. [3 tài sản tri thức (đừng gộp nhầm)](#1-ba-tài-sản-tri-thức)
2. [Kiến trúc mục tiêu — 5 lớp](#2-kiến-trúc-mục-tiêu--5-lớp)
3. [Một request chảy qua hệ thống](#3-một-request-chảy-qua-hệ-thống)
4. [4 nguyên tắc bất biến](#4-bốn-nguyên-tắc-bất-biến)
5. [Freshness — cái gì cập nhật thế nào](#5-freshness--cái-gì-cập-nhật-thế-nào)
6. [Lộ trình thực thi — Phase 0 → 5](#6-lộ-trình-thực-thi)
7. [Khoảng cách hiện tại → mục tiêu](#7-khoảng-cách-hiện-tại--mục-tiêu)
8. [Ghi chú IP & quản trị](#8-ghi-chú-ip--quản-trị)

---

## 1. Ba tài sản tri thức

Rất hay bị gộp làm một. Phải tách rõ vì mỗi cái có **cách lưu, cách dùng, cách cập nhật** khác nhau.

| | **KG — Knowledge Graph** | **KB — Knowledge Base** | **Framework — Khung tư duy** |
|---|---|---|---|
| Là gì | *Sự thật & quan hệ* | *Tài liệu/nội dung* | *Quy tắc phân tích chạy được* |
| Ví dụ | "HPG sở hữu 99% Ống thép Hòa Phát"; "thép cần than cốc đầu vào" | Báo cáo phân tích ngành thép của chuyên gia (PDF) | "DN thường xem ROE/đòn bẩy; ngân hàng xem NIM/NPL; NPL>3% là cờ đỏ" |
| Dạng lưu | Đồ thị (node–edge) | Văn bản + vector (RAG) | Quy tắc/template có version |
| Cách dùng | Tra quan hệ | Retrieve đoạn liên quan | **Execute** — điều khiển cả phân tích |
| Vai trò | "Biết cái gì" (dữ liệu) | "Biết cái gì" (dữ liệu) | **"Biết làm thế nào" (hành động)** |

**Ẩn dụ y khoa:**
- **KB** = tủ sách giáo khoa của bác sĩ → *tra khi cần*.
- **KG** = hồ sơ bệnh án + quan hệ (bệnh này liên quan thuốc kia) → *sự thật có cấu trúc*.
- **Framework** = **phác đồ chẩn đoán bác sĩ làm theo mỗi ca** → *điều khiển quá trình khám*.

> **Chốt:** KG + KB là **kiến thức** (dữ liệu). Framework là **hành động** (quy trình). KB/KG *nuôi* Framework, nhưng chính Framework — vì **chạy được + kiểm định được** — mới là **moat khó sao chép nhất**.

---

## 2. Kiến trúc mục tiêu — 5 lớp

```
┌─────────────────────────────────────────────────────────────────────┐
│  L4 · AGENT PLATFORM  (bề mặt "hạ tầng" — user & bên thứ 3 dựng lên)  │
│   Agent Studio (task·tools·model·mã·lịch·KB) · Trigger · Metering      │
│   Multi-tenant · Observability · Marketplace (chia sẻ agent/template)  │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────────┐
│  L3 · AGENT CORE  (engine CHUNG — thay 3 monolith trùng lặp)          │
│   vòng lặp: reason → gọi tool → quan sát → lặp → chốt                   │
│   ├─ LLM ADAPTER: OpenAI / Claude / Gemini / BYO-key  ← "LLM hàng đầu"  │
│   └─ phát provenance: framework version + tool + nguồn + as-of         │
└───────────┬───────────────────────────┬───────────────────────────────┘
            │                           │
┌───────────▼─────────────┐   ┌─────────▼─────────────────────────────────┐
│ L2 · FRAMEWORK          │   │ L1 · TOOL REGISTRY                        │
│ (khung tư duy — MOAT)   │◄─▶│ (dữ liệu → tool gọi được, cắm thêm được)  │
│ • task × logic loại hình│   │ • contract TRUNG LẬP (chuẩn MCP)          │
│ • luật grounding        │   │ • mỗi tool: schema·nguồn·freshness·cost·  │
│ • VERSIONED + eval      │   │   citation                                │
│   (chuyên gia quyết)    │   │ • DB-tool + API-tool + (sau) tool bên thứ3│
└─────────────────────────┘   └─────────┬─────────────────────────────────┘
                                        │
┌───────────────────────────────────────▼───────────────────────────────┐
│  L0 · DATA FOUNDATION  (nguồn SỰ THẬT — nền no-fiction)                │
│   [DB có cấu trúc: BCTC·ratio·giá] [KG: sở hữu·chuỗi cung ứng]         │
│   [KB: tài liệu chuyên gia (RAG)]  [API: vnstock/DNSE/Yahoo/Brave]     │
│   Data-quality gate · provenance/as-of · ETL orchestrated + KG event  │
└───────────────────────────────────────────────────────────────────────┘

 ══ Xuyên suốt: GROUNDING/NO-FICTION · PROVENANCE · GOVERNANCE ══
```

### L0 · Data Foundation — nguồn sự thật
**Là gì:** tất cả dữ liệu thật + đảm bảo *tươi & đúng*. Gồm DB có cấu trúc (BCTC, chỉ số, giá — thứ ta vừa làm cứng), KG (quan hệ), KB (tài liệu), connector API kéo realtime.
**Ví dụ dễ hiểu:** như *kho nguyên liệu của bếp* — rau phải tươi, cân phải đúng. Một số sai (FCF_YIELD ×1e9) hay một quan hệ KG cũ (báo HPG còn sở hữu công ty đã bán) = "nguyên liệu hỏng".
**Điểm mấu chốt:** mỗi mẩu dữ liệu đi kèm **nguồn + ngày chốt (as-of)**; có **cổng kiểm định** (0 ratio vô lý, 0 quan hệ cũ).

### L1 · Tool Registry — biến dữ liệu thành "công cụ gọi được"
**Là gì:** danh mục các tool mà Agent dùng để lấy dữ liệu. Mỗi tool khai báo *schema, nguồn, độ tươi, chi phí, cách trích nguồn* — theo **contract trung lập** (không khoá riêng OpenAI), theo chuẩn **MCP** để sau này cắm thêm không cần sửa lõi.
**Ví dụ dễ hiểu:** như *ổ cắm điện chuẩn* — thiết bị mới (tool mới, thậm chí của bên thứ 3) chỉ cần đúng chuẩn phích cắm là chạy, không phải đục lại tường.
**Hiện tại:** tool đang *hàn chết* vào code (`OPENAI_TOOL_DEFS`) → thêm tool phải sửa + deploy.

### L2 · Framework — khung tư duy (MOAT)
**Là gì:** lớp *trung gian* quyết định **cách phân tích**: nhiệm vụ này (deep research / bản tin / quét rủi ro) × loại hình DN (ngân hàng/chứng khoán/…) → dùng tool nào, xem chỉ số gì, diễn giải & gắn cờ ra sao. **Có version, tách khỏi code, chỉ chuyên gia được sửa.**
**Ví dụ dễ hiểu:** như *phác đồ khám bệnh* — với "bệnh nhân ngân hàng" thì đo NIM/NPL trước; với "bệnh nhân bảo hiểm" thì đo combined ratio. Nâng "phác đồ v3 → v4" mà **không cần xây lại bệnh viện**.
**Vì sao là moat:** chạy được + **kiểm định được** (so ROE MBB với FireAnt) → khó copy hơn KB (tài liệu có thể crawl).

### L3 · Agent Core — engine chung
**Là gì:** *một* engine duy nhất chạy vòng lặp "suy nghĩ → gọi tool → đọc kết quả → lặp → chốt". Bên trong có **LLM Adapter** để gọi bất kỳ model nào (OpenAI/Claude/Gemini/BYO-key). Nó *áp* Framework (L2) + gọi tool (L1) + phát **provenance**.
**Ví dụ dễ hiểu:** như *bếp trưởng điều phối* — cầm phác đồ (Framework), sai phụ bếp lấy nguyên liệu (Tool), giao món cho "đầu bếp" user chọn (LLM). Hiện có **3 bếp trưởng chép tay giống hệt nhau** (run-agent, bee-ai-chat, agent-dry-run) → phải gộp thành 1.

### L4 · Agent Platform — bề mặt "hạ tầng"
**Là gì:** nơi user *dựng* agent (Agent Studio): chọn nhiệm vụ, tool, model, mã, lịch, KB. Kèm multi-tenant, đo lường tín dụng (metering), quan sát (observability), và **marketplace** chia sẻ agent/template.
**Ví dụ dễ hiểu:** như *App Store* — user không cần biết bên trong; họ lắp ghép và (sau này) chia sẻ agent cho người khác dùng.

---

## 3. Một request chảy qua hệ thống

> **Bối cảnh:** user bấm *"Phân tích sâu HPG"*, chọn model *Claude Sonnet*.

1. **L4** nhận lệnh → gọi **L3**.
2. **L3** nạp **Framework v3** (L2) cho `task = deep_research`, `loại hình = normal`.
3. **Framework** quyết: cần `financials(HPG)`, `value_chain(HPG)`, `news(HPG)` — và luật "chỉ dùng số từ tool, kèm nguồn".
4. **L3** gọi các tool đó ở **L1** → tool đọc **L0**: DB (BCTC/chỉ số HPG) + KG (HPG → thép xây dựng/HRC, cần than cốc) + giá HRC live từ API. Mỗi kết quả *kèm nguồn + ngày chốt*.
5. **L3** đưa toàn bộ cho **Claude Sonnet** qua **LLM Adapter** (đúng model user chọn).
6. **Grounding contract** rà output: mọi con số phải truy được về tool — số "mồ côi" bị chặn.
7. Trả kết quả **kèm provenance**: *"Dùng Framework v3 · nguồn Vietcap/DNSE · chốt 07/2026 · model Claude Sonnet"*.

---

## 4. Bốn nguyên tắc bất biến

1. **No-fiction là ràng buộc cấu trúc, không phải lời hứa prompt.** Fact chỉ đến từ L0 qua tool; model **không được tự chế số**. Có bước validate chặn số không truy nguồn được.
2. **Framework tách khỏi LLM và khỏi Tool.** Đổi model hay đổi nguồn dữ liệu **không phải viết lại khung tư duy** — vì nó là *trung gian*.
3. **Mọi output có provenance.** Version framework + tool + nguồn + as-of → độ tin cậy *đo được*, audit được.
4. **Governance rõ ràng.** KG/KB sửa nhanh & phân tán được; **Framework chỉ chuyên gia được đổi**, qua version + eval. User feedback về framework chỉ vào *hàng đợi review*, không tự động sửa.

---

## 5. Freshness — cái gì cập nhật thế nào

| Tài sản | Tần suất | Nguồn cập nhật | Vì sao |
|---|---|---|---|
| **KG + DB** (L0) | **Liên tục / theo sự kiện** | Chủ yếu **tự động** (filing, công bố) + chuyên gia xác minh cạnh khó + **user báo lỗi trực tiếp** | Bám hiện thực đang đổi; **cạnh cũ = sự thật giả = phá no-fiction** |
| **KB** (L0) | Khi có tài liệu mới | Chuyên gia/user upload | Nội dung tham chiếu, ít biến động |
| **Framework** (L2) | **Định kỳ, có version** | **Chỉ chuyên gia** + eval; user feedback *gián tiếp* | Nguyên lý ổn định, nhưng đổi chuẩn kế toán (VAS→IFRS) / phát hiện logic sai thì phải nâng version vì **diễn giải lại toàn bộ lịch sử** |

**Ví dụ:** Vinhomes tách khỏi Vingroup → **KG phải sửa ngay hôm đó** (tự động + xác minh). Cách tính ROE dùng VCSH bình quân thay vì cuối kỳ → **Framework nâng v3→v4** (chuyên gia quyết, gắn version).

---

## 6. Lộ trình thực thi

Mỗi Phase **ship được độc lập, ra giá trị riêng**. Thứ tự tối ưu cho *khả năng mở rộng*.

### Phase 0 — Tách Agent Core (nền tảng)
- **Làm gì:** rút vòng lặp tool-call chung ra `_shared/agent-core/`; 3 function (run-agent, bee-ai-chat, agent-dry-run) chỉ còn là "vỏ" (auth, I/O, SSE) gọi engine.
- **Vì sao trước tiên:** là *enabler* cho mọi Phase sau — không tách thì Phase 1-4 phải sửa 3 nơi. Trả nợ kỹ thuật ngay.
- **Ví dụ:** thay vì 3 bếp trưởng chép tay giống hệt, còn **1 bếp trưởng**; sửa công thức 1 lần, cả 3 quầy đổi theo. (Bug FCF_YIELD kiểu "sửa 1 chỗ quên 2 chỗ" sẽ không còn.)
- **Rủi ro:** thấp — refactor thuần. **Verify:** so output trước/sau trên vài mã, phải giống hệt.
- **Kết quả:** 1 engine chung, code gọn ~1/3.

### Phase 1 — LLM Adapter (đa provider)
- **Làm gì:** interface `chat(model, messages, tools) → {text, toolCalls}` + adapter OpenAI/Anthropic/Gemini; chuẩn hoá định dạng tool-call giữa các nhà cung cấp; routing thật theo `agent.model` + fallback; **hạch toán chi phí per-model vào `user_credits`**; chỗ cắm **BYO-key** (user mang key riêng, mã hoá).
- **Vì sao:** hiện `MODEL_MAP` gộp *mọi* lựa chọn → gpt-4.1-mini. Đây là **lời hứa headline + tầng thu phí** chưa bật.
- **Ví dụ:** user chọn *Claude Opus* thì **chạy Claude Opus thật** (không phải gpt-4.1-mini trá hình); gói Pro = model cao cấp, gói Free = model rẻ.
- **Kết quả:** "kết nối LLM hàng đầu" thành thật + mở doanh thu.

### Phase 2 — Tool Registry (cắm được, trung lập)
- **Làm gì:** bảng `tools` (id, schema JSON, handler, nguồn DB/API, freshness, cost, citation) + resolver runtime sinh tool-def theo format từng provider. Bỏ hardcode `OPENAI_TOOL_DEFS`.
- **Vì sao:** thêm tool hiện phải sửa code + deploy; và schema khoá OpenAI chặn cả đa-model.
- **Ví dụ:** muốn thêm tool *"giá cà phe robusta"* → thêm 1 dòng trong registry, **không đụng engine**. Về sau bên thứ 3 tự cắm tool qua **MCP**.
- **Kết quả:** dữ liệu mở rộng không giới hạn; nền cho hệ sinh thái.

### Phase 3 — Framework thành artifact có version
- **Làm gì:** đưa task templates + logic loại hình + luật grounding vào DB (`framework_versions`); engine nạp theo version; output gắn `framework_version`. Xây **eval harness** (bộ Q&A vàng mỗi loại hình).
- **Vì sao:** hiện framework lẫn trong prompt + if-else → không version, không rollback, không đo được.
- **Ví dụ:** nâng cách phân tích ngân hàng "v3 → v4", chạy eval (so 20 mã với chuẩn FireAnt) đạt mới phát hành; nếu v4 tệ → **rollback về v3 tức thì**, không cần deploy code.
- **Kết quả:** "khung tư duy tách rời, update theo version" thành hiện thực — đúng vision.

### Phase 4 — No-fiction enforcement
- **Làm gì:** (a) validate hậu kỳ: mọi số trong output phải map về một tool-output, số "mồ côi" bị gắn cờ/chặn; (b) bắt buộc citation + as-of (đã bắt đầu với `na_reason`, `period_end`); (c) data-quality gate như CI (0 ratio >500%, 0 null period_end, 0 cạnh KG cũ…).
- **Vì sao:** đây là **moat niềm tin** của sản phẩm tài chính — biến "không bịa số" từ lời hứa thành ràng buộc.
- **Ví dụ:** nếu LLM viết "P/E của HPG là 15" mà tool trả 12 → hệ thống **chặn/đánh dấu**, không cho ra ngoài.
- **Kết quả:** tin cậy được đảm bảo bằng hệ thống, không bằng hy vọng.

### Phase 5 — Bề mặt mở rộng (hệ sinh thái)
- **Làm gì:** user/bên thứ 3 đăng ký tool qua MCP; chia sẻ agent/template/framework (marketplace); chaining nhiều Agent.
- **Ví dụ:** một chuyên gia tạo "Agent phân tích ngành thép" chuẩn của họ → chia sẻ/bán cho user khác; user ghép "Agent quét tin" → "Agent định giá" thành pipeline.
- **Kết quả:** hiện thực trọn vẹn "hạ tầng" + "tuỳ biến cao nhất".

**Thứ tự & lý do:** 0 (nền, rủi ro thấp) → 1–2 (mở doanh thu + mở rộng) → 3–4 (làm cứng moat) → 5 (hệ sinh thái).

---

## 7. Khoảng cách hiện tại → mục tiêu

| Lớp | Hiện có | Cần build |
|---|---|---|
| L0 Data | DB có cấu trúc (vừa làm cứng), mầm KG (`company_subsidiaries`, `kg-stock-vn`), KB (`kb_search`) | ETL orchestrated + KG event-driven + data-quality gate hệ thống |
| L1 Tools | Tool ở `_shared/` nhưng **hardcode OpenAI** | Registry + contract trung lập (MCP) |
| L2 Framework | **Lẫn trong code**, không version | Tách + version + eval harness |
| L3 Core | **3 monolith trùng lặp**; `MODEL_MAP`→1 model | Engine chung + LLM Adapter đa provider |
| L4 Platform | Agent Studio, metering (`user_credits`), agent_runs | Marketplace, observability sâu, BYO-key |
| No-fiction | Kỷ luật prompt + `na_reason`/`period_end` | Ràng buộc cấu trúc + validate + provenance |

---

## 8. Ghi chú IP & quản trị

- **Bảo hộ pháp lý cho KG/Framework vốn mỏng:** sự thật không có bản quyền; phương pháp khó patent (nhất là ở VN). **Moat thật = trade secret + vòng lặp chuyên gia + độ tươi dữ liệu**, không phải tờ đăng ký.
- **Nên làm:** (a) đăng ký bản quyền *phần mềm/schema/tài liệu* (rẻ, làm bằng chứng tác giả); (b) **trade secret** (NDA, phân quyền) là lớp chính; (c) thương hiệu Wealbee.
- ⚠️ **Bắt buộc:** hợp đồng chuyên gia phải là **work-for-hire / chuyển giao quyền cho Wealbee** — nếu không, phần họ đóng góp thuộc về họ.
- **Cùng kỷ luật data-quality cho KG như đã làm cho BCTC** — một cạnh KG sai = một fiction.

---

*Tài liệu định hướng kiến trúc. Bước tiếp đề xuất: thiết kế kỹ thuật chi tiết **Phase 0 + 1** (interface `agent-core`, hợp đồng `LLMAdapter`, sơ đồ thư mục, cách verify không đổi hành vi) để bắt tay code.*

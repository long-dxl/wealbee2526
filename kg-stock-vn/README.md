# KG Stock VN

AI Agent phân tích cổ phiếu **Việt Nam**: **Knowledge Graph nhân-quả** (vĩ mô → ngành → mã ×Beta) + AI Agent **Gemini** + **Supabase** + **vnstock**. Suy luận có dẫn nguồn, số liệu tất định (chống bịa).

## Tính năng cốt lõi
1. **Bản đồ Tác động Nhân quả** — hỏi tự nhiên, AI suy luận chuỗi vĩ mô → cổ phiếu dựa trên quan hệ CÓ THẬT trong đồ thị, luôn dẫn nguồn.
2. **Phân tích tài chính sâu** — IS/BS/CF + chỉ số theo năm & quý gần nhất, định giá, thích ứng theo loại hình DN (ngân hàng/chứng khoán/bảo hiểm/sản xuất).
3. **Phủ cả thị trường** — phân tích mọi mã VN (không giới hạn rổ cố định).

## Chạy nhanh
```bash
pip install -r requirements.txt        # hoặc: pip install -e ".[pdf,dev]"
cp .env.example .env                    # điền GEMINI_API_KEY, SUPABASE_*, SERPAPI_API_KEY...
streamlit run app.py                    # → http://localhost:8501
```

## Kiểm thử
```bash
python evals/run_evals.py routing       # regression điều phối (ngưỡng 95%)
python markets/smoke_test.py            # smoke đa-thị-trường
# hoặc: make eval / make smoke / make run
```

## Cấu trúc
Xem [CLAUDE.md](CLAUDE.md) — bản đồ kiến trúc đầy đủ. Tóm tắt: `app.py`+`pages/` (UI) · `markets/` (đa-thị-trường + KG canonical) · `core` (bộ não agent, ở root) · `data` (pipeline) · `db/` (SQL) · `evals/` (test) · `docs/` (hướng dẫn).

## Tài liệu
- [docs/HUONG_DAN_SU_DUNG.md](docs/HUONG_DAN_SU_DUNG.md) — hướng dẫn sử dụng
- [docs/SUPABASE_CRON_SETUP.md](docs/SUPABASE_CRON_SETUP.md) — cron tin tức trên cloud

> Công cụ thông tin/phân tích, **không phải khuyến nghị đầu tư**.

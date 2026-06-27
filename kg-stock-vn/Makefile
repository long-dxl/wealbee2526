# Makefile — lệnh thường dùng. Ghi đè interpreter: make PYTHON=/path/to/python eval
PYTHON ?= python3

.PHONY: help run eval smoke test sync news fundamentals lint

help:
	@echo "run          - chạy app Streamlit (localhost:8501)"
	@echo "eval         - regression điều phối (chặn deploy nếu dưới ngưỡng)"
	@echo "smoke        - smoke test đa-thị-trường (markets/)"
	@echo "test         - eval + smoke"
	@echo "sync         - đồng bộ tin + cơ bản ngay (scheduler --now all)"
	@echo "lint         - ruff check"

run:
	$(PYTHON) -m streamlit run app.py --server.port 8501

eval:
	$(PYTHON) evals/run_evals.py routing

smoke:
	$(PYTHON) markets/smoke_test.py

test: eval smoke

sync:
	$(PYTHON) -m data.scheduler --now all

news:
	$(PYTHON) -m data.scheduler --now news

fundamentals:
	$(PYTHON) -m data.scheduler --now fundamentals

lint:
	ruff check .

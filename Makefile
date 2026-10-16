.PHONY: dev test eval install
install:
	pip install -r api/requirements.txt
dev:
	(cd api && uvicorn main:app --reload --port 7860) & python -m http.server 8000 -d web
test:
	cd api && for f in guard chunk crawl index; do python $$f.py || exit 1; done
	node --test web/rag.test.js
eval:
	python evals/run.py http://localhost:7860

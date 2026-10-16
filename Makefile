.PHONY: dev test eval
dev:   ## open http://localhost:8000
	python3 -m http.server 8000 -d web
test:
	node --test web/*.test.js worker/*.test.js
eval:
	npm install --no-audit --no-fund && node evals/run.js

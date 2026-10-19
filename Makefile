.PHONY: dev test eval
dev:   ## open http://localhost:8000
	python3 -m http.server 8000 -d web
test:
	node --test web/*.test.js
eval:
	node evals/run.js

.PHONY: dev test eval
dev:   ## open http://localhost:8000
	python3 -m http.server 8000 -d web
test:
	node --test web/*.test.js
eval:   ## replays evals/snapshots; re-record via the record-evals workflow
	node evals/run.js

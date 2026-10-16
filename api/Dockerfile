# Hugging Face Spaces (Docker SDK) expects port 7860 and a non-root user.
FROM python:3.12-slim
RUN useradd -m app
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
USER app
ENV HF_HOME=/home/app/.cache FASTEMBED_CACHE_PATH=/home/app/.cache/fastembed
# Warm the models at build time so the first request isn't a 60 s download.
RUN python -c "from index import embedder, reranker; embedder(); reranker()"
EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]

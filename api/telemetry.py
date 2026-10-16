"""OpenTelemetry -> New Relic over OTLP. Off unless NEW_RELIC_LICENSE_KEY is set, so local dev and forks need nothing."""
import os
from contextlib import contextmanager

_tracer = None


def setup(app):
    global _tracer
    key = os.getenv("NEW_RELIC_LICENSE_KEY")
    if not key:
        return
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    endpoint = os.getenv("NEW_RELIC_OTLP_ENDPOINT", "https://otlp.nr-data.net:4318")  # EU accounts: https://otlp.eu01.nr-data.net:4318
    provider = TracerProvider(resource=Resource.create({"service.name": "agentic-web-rag-api"}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces", headers={"api-key": key})))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)
    _tracer = trace.get_tracer("agentic-web-rag")


@contextmanager
def span(name: str, **attrs):
    """Never record question text or page content: hashes and numbers only."""
    if not _tracer:
        yield None
        return
    with _tracer.start_as_current_span(name) as s:
        for k, v in attrs.items():
            s.set_attribute(k, v)
        yield s

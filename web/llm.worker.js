import { WebWorkerMLCEngineHandler } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2/+esm";
const handler = new WebWorkerMLCEngineHandler();
onmessage = msg => handler.onmessage(msg);

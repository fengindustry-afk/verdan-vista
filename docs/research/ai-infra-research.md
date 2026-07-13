# AI Infrastructure Research

Research notes on six building blocks relevant to the Verdant Vista dMRV / OCR platform:
Qwen, MCP, A2A, Semantic Caching, Speculative Decoding, and Continuous Batching.

Last updated: 2026-07-13

---

## 1. Qwen

**What it is.** Qwen is Alibaba's open-weight LLM family (Apache-2.0 for most sizes). Relevant lines:

- **Qwen2.5** — dense models 0.5B → 72B; strong multilingual + coding/math; 128K context on larger sizes.
- **Qwen2.5-VL / Qwen2-VL** — vision-language models; the practical reason they appear in this repo (`ocr-service/backends/qwen_backend.py`). Excellent at document OCR, structured extraction (receipts, forms, tables), and grounding bounding boxes.
- **Qwen3** — adds hybrid "thinking / non-thinking" modes and MoE variants (e.g. 235B-A22B) that activate only a fraction of params per token, cutting inference cost.

**Why it fits here.** For receipt OCR (`receipts-ocr-feature`) and tree-scan analysis, a VL model like **Qwen2.5-VL-7B** can replace or backstop tesseract.js: it reads messy Malaysian receipts, returns structured JSON (vendor, date, line items, totals), and handles rotation/skew that classical OCR fails on. Trade-off: needs a GPU backend (the `ocr-service`), so it's server-side, not client-side like the current tesseract.js path.

**Deployment options.** vLLM / SGLang for self-host; Alibaba DashScope API; or quantized GGUF (llama.cpp) for smaller edge boxes — relevant to the offline-first edge proxy in `mrv-hybrid-vision`.

---

## 2. MCP (Model Context Protocol)

**What it is.** An open protocol (Anthropic, Nov 2024) that standardizes how LLM apps connect to external tools/data. Think "USB-C for AI tools." Client ↔ server over JSON-RPC 2.0 (stdio or streamable HTTP).

**Primitives a server exposes:**
- **Tools** — model-callable functions (e.g. `query_sensor_readings`, `issue_credit_draft`).
- **Resources** — read-only context the host can load (e.g. a plot's audit trail).
- **Prompts** — reusable templated workflows.

**Relevance.** An MCP server over the Supabase document-store could let any MCP-capable client (Claude, IDEs, agents) query plots, sensor readings, work-process entries, and readiness status through one audited interface — instead of bespoke endpoints per consumer. Server-side keys stay in the MCP server, matching the `mrv-hybrid-vista` "server-side keys" principle. Guard side-effectful tools (credit issuance, deletes) behind explicit confirmation.

---

## 3. A2A (Agent2Agent Protocol)

**What it is.** Google-originated (Apr 2025), now under the Linux Foundation. Standardizes communication **between autonomous agents** (peer-to-peer), whereas MCP connects one agent to its tools. Complementary, not competing.

**Core concepts:**
- **Agent Card** — a JSON descriptor at `/.well-known/agent.json` advertising an agent's skills, endpoints, and auth.
- **Task** — a unit of work with a lifecycle (submitted → working → completed/failed), supporting long-running + streaming (SSE) updates.
- **Messages / Artifacts** — multi-modal payloads exchanged during a task.

**Relevance.** In a Hybrid dMRV, distinct agents (an *ingestion/verification* agent, a *compliance* agent talking to Cula's API, a *credit-issuance* agent) could coordinate over A2A while each uses MCP internally for its own tools. A2A gives the tamper-evident hand-off boundary; MCP gives each agent its capabilities.

**Rule of thumb:** MCP = agent→tools (vertical). A2A = agent→agent (horizontal).

---

## 4. Semantic Caching

**What it is.** Cache LLM responses keyed by **meaning** (embedding similarity), not exact string match. Incoming prompt → embed → nearest-neighbor search in a vector store → if similarity > threshold, return cached answer; else call the model and store the result.

**Components:** embedding model + vector DB (Redis, pgvector, Milvus) + similarity threshold + TTL/invalidation.

**Payoffs:** big latency + cost reduction for repetitive queries; steadier answers.

**Risks:** *false hits* — semantically-close-but-materially-different prompts return a wrong cached answer (dangerous for numeric MRV/financial queries). Mitigate with a **high threshold**, and **never cache** compliance/credit-issuance or per-record numeric lookups. Good candidates: FAQ-style questions, doc summaries, classification of similar receipts.

**pgvector note.** Since the stack already runs Supabase (Postgres), pgvector is the low-friction path — no new infra.

---

## 5. Speculative Decoding

**What it is.** An inference *speed* technique that doesn't change output quality. A small, fast **draft model** proposes several future tokens; the large **target model** verifies them in a single parallel forward pass. Accepted tokens are kept; on the first rejection it falls back to the target's own token. Because verification is parallel, you get 2–3× throughput for the same distribution.

**Variants:** draft-model speculation; **self-speculation / Medusa** (extra decoding heads, no separate model); **EAGLE**; **n-gram / prompt-lookup** (cheap, good when output echoes the prompt — e.g. structured extraction that repeats field names).

**Relevance.** For self-hosted Qwen OCR/extraction, prompt-lookup or EAGLE-style speculation speeds up the token-heavy JSON output with zero accuracy loss. Supported out of the box in vLLM and SGLang — mostly a config flag.

---

## 6. Continuous Batching

**What it is.** The scheduling technique behind modern LLM serving throughput. Instead of **static batching** (wait to fill a batch, all requests finish together — wasted GPU while short requests idle for long ones), continuous batching (aka **in-flight batching**) works at the *iteration* level: as soon as one sequence in the batch finishes, its slot is freed and a queued request is admitted mid-flight.

**Paired with PagedAttention** (vLLM): the KV cache is stored in non-contiguous "pages," eliminating memory fragmentation so more sequences fit concurrently. Together they deliver the large throughput gains vLLM is known for.

**Relevance.** If the `ocr-service` scales to many concurrent receipt/scan uploads, serving Qwen-VL behind vLLM/SGLang gets continuous batching + paged KV cache for free — the difference between a GPU serving ~1 vs ~10+ concurrent OCR requests efficiently.

---

## How these compose (target architecture sketch)

```
Client / edge (offline-first)
   │  HMAC-signed payloads
   ▼
Edge + backend proxy  ──MCP──▶  data/tools (Supabase doc-store, sensors)
   │                              ▲
   │  A2A                         │ pgvector semantic cache
   ▼                              │
Compliance agent ──▶ Cula API (credit issuance)
   ▲
   │  self-hosted inference: vLLM/SGLang serving Qwen2.5-VL
   │     · continuous batching + PagedAttention (throughput)
   │     · speculative decoding (latency, lossless)
   └── OCR / structured extraction (receipts, scans)
```

- **Qwen-VL** does the OCR/extraction.
- **Continuous batching + speculative decoding** make that inference cheap and fast.
- **Semantic caching (pgvector)** avoids re-inferring repeat queries — never on numeric/compliance paths.
- **MCP** gives every consumer one audited tool interface to the data.
- **A2A** coordinates the ingestion → compliance → issuance agents with tamper-evident hand-offs.

---

# Deep dives + suitability for Verdant Vista

Context reminder: the "website" is a **React + Vite + Supabase** SPA (client-side tesseract.js OCR today), with a separate Python **`ocr-service`** that already has a Qwen backend, plus the offline-first edge/proxy vision (`mrv-hybrid-vision`). Suitability is judged against *this* stack, not a generic one.

Verdict legend: ✅ adopt · 🟡 adopt with guardrails · 🔷 later / when scale demands · ⛔ skip.

---

## 1a. Qwen — deep dive

**Recommended model:** `Qwen2.5-VL-7B-Instruct` for receipt/scan OCR. The 3B variant works on smaller GPUs; 72B is overkill for extraction.

**Serving with vLLM (OpenAI-compatible endpoint):**

```bash
# ocr-service GPU host — needs ~18GB VRAM for 7B in bf16, ~9GB with AWQ int4
vllm serve Qwen/Qwen2.5-VL-7B-Instruct \
  --served-model-name qwen-vl \
  --max-model-len 8192 \
  --limit-mm-per-prompt image=2 \
  --gpu-memory-utilization 0.90 \
  --port 8001
```

**Extraction call (structured JSON, from the Python backend):**

```python
# ocr-service/backends/qwen_backend.py — sketch of the request shape
resp = client.chat.completions.create(
    model="qwen-vl",
    messages=[{
        "role": "user",
        "content": [
            {"type": "image_url",
             "image_url": {"url": f"data:image/webp;base64,{img_b64}"}},
            {"type": "text", "text": RECEIPT_EXTRACTION_PROMPT},
        ],
    }],
    temperature=0,                 # deterministic for extraction
    extra_body={"guided_json": RECEIPT_SCHEMA},  # vLLM constrained decoding
)
```

`guided_json` (vLLM's outlines/xgrammar integration) forces valid JSON against your receipt schema — eliminates parse-retry loops.

**Suitability: ✅ adopt (server-side).** Directly upgrades `receipts-ocr-feature` and tree-scan reading. Keep tesseract.js as the offline/client fallback; route to Qwen when the edge proxy has connectivity. Cost/latency: a single 7B on one L4/A10 handles the platform's receipt volume comfortably.

---

## 2a. MCP — concrete tool schema

An MCP server (TypeScript, over the Supabase service-role key) exposing the doc-store. Tool definitions:

```jsonc
// tools advertised by the Verdant Vista MCP server
[
  {
    "name": "query_plots",
    "description": "List/filter carbon plots and their summary metrics.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "treatmentGroup": { "type": "string" },
        "limit": { "type": "integer", "default": 50 }
      }
    }
  },
  {
    "name": "get_sensor_readings",
    "description": "Time-series sensor_readings for one device.",
    "inputSchema": {
      "type": "object",
      "required": ["deviceId"],
      "properties": {
        "deviceId": { "type": "string" },
        "since": { "type": "string", "format": "date-time" },
        "metric": { "type": "string", "enum": ["soil_moisture","temp","co2"] }
      }
    }
  },
  {
    "name": "get_readiness_status",
    "description": "Production-readiness checklist state (78 activities).",
    "inputSchema": { "type": "object", "properties": {} }
  },
  {
    "name": "issue_credit_draft",
    "description": "PREPARE (not submit) a credit-issuance payload for Cula. Requires explicit human confirmation before any submit.",
    "inputSchema": {
      "type": "object",
      "required": ["plotId","periodStart","periodEnd"],
      "properties": {
        "plotId": { "type": "string" },
        "periodStart": { "type": "string", "format": "date" },
        "periodEnd": { "type": "string", "format": "date" }
      }
    },
    "annotations": { "destructiveHint": false, "readOnlyHint": false }
  }
]
```

Design rules for this repo: read tools (`query_*`, `get_*`) run freely; any write/issuance tool returns a **draft** and requires a separate confirmed submit — mirrors the app's immutable `edit_history` and RLS posture. Keys never leave the server.

**Suitability: 🔷 later (high value, not urgent).** Worth it once there are multiple consumers (Claude, agents, internal tooling) hitting the data. For the website alone it's premature — the React app already talks to Supabase directly. Build it when the A2A/agent layer arrives, since those agents need exactly this interface.

---

## 3a. A2A — deep dive

Minimal **Agent Card** for a compliance agent:

```jsonc
// https://compliance.verdant.example/.well-known/agent.json
{
  "name": "verdant-compliance-agent",
  "description": "Validates MRV payloads and forwards to Cula for credit issuance.",
  "url": "https://compliance.verdant.example/a2a",
  "version": "0.1.0",
  "capabilities": { "streaming": true },
  "defaultInputModes": ["application/json"],
  "skills": [{
    "id": "validate-and-issue",
    "name": "Validate MRV batch & request issuance",
    "tags": ["mrv","carbon","cula"]
  }]
}
```

**Suitability: 🔷 later.** A2A only pays off when you genuinely have ≥2 independent agents needing a standard hand-off (ingestion ↔ compliance ↔ issuance in `mrv-hybrid-vision`). Today that's one backend proxy — a plain internal API is simpler. Adopt A2A when the compliance/issuance logic splits into its own deployable agent. Keep it on the roadmap, not the sprint.

---

## 4a. Semantic Caching — deep dive (pgvector)

Since Supabase = Postgres, no new infra:

```sql
create extension if not exists vector;

create table llm_cache (
  id          bigserial primary key,
  embedding   vector(1536),
  prompt      text,
  response    jsonb,
  created_at  timestamptz default now()
);
create index on llm_cache using ivfflat (embedding vector_cosine_ops);
```

```ts
// lookup: only trust a hit above a conservative cosine threshold
const { data } = await supabase.rpc('match_llm_cache', {
  query_embedding: emb,
  match_threshold: 0.95,   // deliberately high
  match_count: 1
});
if (data?.[0]) return data[0].response;   // cache hit
```

**Suitability: 🟡 adopt with guardrails — narrow scope only.** Safe for: FAQ/help answers, doc/summary text, "explain this section." **Never** for: numeric sensor lookups, per-receipt extraction, readiness percentages, or anything on the credit/compliance path — a false hit there returns wrong numbers. Because the current website has no general-purpose LLM Q&A surface yet, this is only worth building *when/if* you add a chat/assistant feature. Until then: ⛔ not needed.

---

## 5a. Speculative Decoding — deep dive

vLLM config on the same Qwen server:

```bash
# n-gram / prompt-lookup — best for extraction that echoes field names, zero extra VRAM
vllm serve Qwen/Qwen2.5-VL-7B-Instruct \
  --served-model-name qwen-vl \
  --speculative-config '{"method":"ngram","num_speculative_tokens":4,"prompt_lookup_max":4}'
```

Lossless (output distribution unchanged); typical 1.5–2× speedup on structured JSON output where tokens repeat the prompt schema.

**Suitability: ✅ adopt (free win) — but only inside `ocr-service`.** It's a serving flag with no downside for the JSON-extraction workload. Irrelevant to the React frontend itself. Turn it on when Qwen goes to production; measure the acceptance rate and drop it if <20%.

---

## 6a. Continuous Batching — deep dive

Not a config to enable — it's the **default scheduler** in vLLM/SGLang/TGI. You get it automatically by serving through vLLM (§1a). Levers that matter:

```bash
--max-num-seqs 16          # max concurrent sequences in a batch
--max-num-batched-tokens 8192
--gpu-memory-utilization 0.90   # more headroom → more concurrent seqs (PagedAttention)
```

**Suitability: ✅ adopt implicitly.** The moment you serve Qwen via vLLM you inherit continuous batching + PagedAttention. No separate decision. Only tune `--max-num-seqs` if concurrent OCR uploads spike. For the website there's nothing to do — it's a property of the inference server, not the app.

---

## Suitability summary

| Method | Verdict | Where | When |
|---|---|---|---|
| Qwen2.5-VL | ✅ adopt | `ocr-service` | Now — upgrades receipt/scan OCR |
| Speculative decoding | ✅ free win | `ocr-service` (vLLM) | With Qwen prod rollout |
| Continuous batching | ✅ implicit | `ocr-service` (vLLM) | Automatic via vLLM |
| Semantic caching | 🟡 guardrails | future assistant feature | Only if/when chat Q&A added; never on numeric/compliance |
| MCP | 🔷 later | new server over Supabase | When multiple data consumers / agents exist |
| A2A | 🔷 later | ingestion↔compliance↔issuance | When agents split into separate deployables |

**Bottom line for the website today:** the three inference-side methods (Qwen + speculative decoding + continuous batching) all land together in `ocr-service` as one coherent, high-value upgrade. MCP and A2A are correct architecture but premature until the agent layer exists. Semantic caching has no surface to attach to yet — revisit only if you add an LLM assistant.

## Open questions / next steps
- Benchmark Qwen2.5-VL-7B vs current tesseract.js on the real MY-receipt corpus (accuracy + $/1k docs).
- Decide self-host (vLLM on a GPU box) vs DashScope API for the edge-proxy latency budget.
- Define the MCP tool surface + which tools require explicit confirmation (issuance, delete).
- Prototype pgvector semantic cache with a conservative threshold; measure false-hit rate.

# Esterra Source-Docs ↔ Repo Value-Chain/CORC Comparison

Date: 2026-08-13. Repo: `D:\Projects\verdant-vista-03-main`. Sources: `esterra/` (5 files).

## Files read

| File | Type | Verdict |
|---|---|---|
| `Value Chain Evaluation.xlsx` | Excel (base model) | **Faithfully transcribed** into `src/lib/valueChain.ts` ✓ |
| `Value Chain Evaluation MP Sepang.xlsx` | Excel (MP Sepang variant) | **NOT in the repo** — materially different model (see §2) |
| `Tigasfera Greentech Executive Summary.pdf` | PDF | Context: operator = Tigasfera Greentech (TG); the repo is TG's digital value-chain platform |
| `Cula On-Site Onboarding Readiness Checklist (1).pdf` | PDF | Context: TG onboarding to **Cula** (biochar carbon-registry/MRV platform) |
| `WhatsApp Image … .jpeg` | Image | **Not analyzed** — no vision tool available in this session |

---

## 1. Transcription audit — `valueChain.ts` vs `Value Chain Evaluation.xlsx` → FAITHFUL

Cell-by-cell, the code matches the base workbook exactly:

| Basis block | Workbook | Code |
|---|---|---|
| Pre-processing efficiency | 0.5 | 0.5 ✓ |
| Conversion efficiency | 0.2 | 0.2 ✓ |
| CDR Ratio / Biochar volume | 1 | 1 ✓ |
| Application/storage ratio | 1 | 1 ✓ |
| Biochar CORC Conversion | 2 | 2 ✓ |
| **Sources (ex-source → delivered)** | | |
| MP Sepang Green Waste | 20 → 10 | 20 → 10 ✓ |
| PJ Greenwaste | 20 → 20 | 20 → 20 ✓ |
| Sustainable Feedstock | 20 → 0 | 20 → 0 ✓ |
| **Chain totals** | 60→30→15→3→3→3→6 | delivered 30 → ×0.5=15 → ×0.2=3 ✓ |

4 other feedstocks (Bamboo/Vetiver/EFB/FIBRECORP) → `basis: null` in code, matching the workbook's placeholder cells `X/Y/Z/A`. ✓

**Gap (non-blocking):** the base workbook's *economics* columns — Application split (fertilizer 0.5 / building 0.2 / road 0.3), Raw Biochar Price 1500, Pallet/Powder 3000, CORC price 675 — are **not** carried into the repo. That's correct: the chart only needs CORC factors, not prices. No defect, just noting the workbook has data the repo deliberately doesn't use.

---

## 2. Base vs MP Sepang divergence — THE key finding (which is authoritative?)

| Factor | Base (`Value Chain Evaluation.xlsx`) | MP Sepang variant |
|---|---|---|
| Conversion efficiency | **0.2** | **0.25** |
| MP Sepang delivery | 10 t/day | **20 t/day** |
| PJ Greenwaste | 20 t | 0 |
| Sustainable Feedstock | 20 t | 0 |
| Total delivered | 30 t/day | 20 t/day |
| Biochar output | 3 t/day | 2.5 t/day |
| CORC output | 6 MTe/day | 5 MTe/day = **120 MTe/mo** |
| Raw Biochar Price | 1500 RM | **2500 RM** |
| Revenue / cash | — | **231,000 RM/mo** |
| EBITDA | — | 97,000 RM/mo |
| Profit-share (TG : MPS) | — | 48,500 : 48,500 |
| Scope | 3-source aggregate | **MP Sepang site only** |

**Business impact:** the MP Sepang variant models only the MP Sepang site — which, per the Tigasfera/MP Sepang partnership in the PDFs, is the *live* project. It uses a **higher conversion efficiency (0.25 vs 0.2)** and assumes MP Sepang delivers **20 t/day (vs the 10 t/day** it gets in the base workbook's 3-source aggregate).

⇒ The Dashboard's Wood Chip **"Potential CORC"** chart (which transcribes the *base* model: MP Sepang = 10 t) **understates the actual MP Sepang project**: it uses a 0.2 conversion factor and half the MP Sepang tonnage. If MP Sepang is the live project, the chart should read the MP Sepang variant (0.25, 20 t/day → 5 MTe/day, 120 MTe/mo).

---

## 3. CORC math — two deliberately different systems (by design, not a bug)

- **`corcMetrics`** (`src/lib/feedstock.ts`, used by Dashboard cards + `CorcCalculator.tsx`) — **Puro registry-grade per-batch**:
  `gross = yield(kg) × carbon% × 44/12 / 1000`; `durable = gross × permanence` (0.9 if H/Cₒᵣg<0.4, else 0.8); `net = eligible ? max(0, durable − LCA) : 0`, LCA = explicit value or `max(8% durable, measured transport+pyrolysis)`. Defaults: yield 33%, carbon 80%, H/Cₒᵣg 0.5.
- **`valueChain.ts`** (Dashboard chart) — **workbook planning model**: `delivered × 0.5 (preproc) × 0.2 (conversion) × 2 (CORC per t biochar)`, flat per stage.
- **`CorcCalculator.tsx`** = Puro path + a production planner using measured **Ecosfera reactor** yields (32.5% / 33.3%).

The code comments state these are "not expected to agree," and they don't: the workbook's `×2` is a crude economic CORC proxy; `corcMetrics` is the measurement that a registry (Cula) actually certifies. **No alignment defect** — this split is intentional. Note the CorcCalculator's Woodchip default yield (33%) vs the reactor's measured 32.5% (Ecosfera 0.5) / 33.3% (Ecosfera 1.0) are close but not identical.

---

## 4. Context (from PDFs) — who/what the platform is

- **Tigasfera Greentech (TG)** = operator. Decarbonization-as-a-service; cold-mix asphalt (CMA) for rural roads; permanent CO₂ storage via fertilizer, building material, road pavement. ~4,000 MTe CO₂ removed per km of rural road. Built a digital platform to track carbon along the value chain = **this repo**.
- **Cula** = the carbon registry / MRV platform TG is onboarding to (LCA setup, machine-data integration, moisture analyzer, weighing, 100-hour production trials, registry decision). The repo's **Carbon Certification** custody stage corresponds to Cula certification.
- **MP Sepang (MPS)** = site/partner; the MP Sepang workbook is the site-specific economic model (profit-share 50:50 TG/MPS).

---

## 5. Hardcoded-constant sweep → CLEAN

Grep of `src/` and `docs/` for the workbook's factors/sources/prices (0.5, 0.2, 0.25, 1500, 2500, 3000, 675, 20, 10, 30, 231000, 48500, "MP Sepang", "PJ Greenwaste", "Sustainable Feedstock", "conversion efficiency"): the factors and sources appear **only** in `src/lib/valueChain.ts` (single source of truth). All other hits are coincidental (a `1500 kg` input placeholder, an OCR timeout `15000`, a theme hex `#…675`, test fixtures with 1500/2500 kg). **No stale second copy** of the workbook constants exists.

---

## Recommendations / open questions

1. **Decide the authoritative workbook.** If MP Sepang is the live project, update `WORKBOOK_FEEDSTOCKS.WOOD_CHIP_BASIS` to the MP Sepang model (conversion **0.2→0.25**, MP Sepang delivered **10→20 t**, drop PJ/Sustainable or keep as a separate selectable model). This changes the Dashboard Potential-CORC chart and its tests.
2. **The MP Sepang workbook is not in the repo's model at all** — consider adding it as a second selectable value-chain scenario alongside the base (the Dashboard already has a feedstock dropdown; a scenario/model dropdown would be analogous).
3. **Prices (1500/2500/3000/675) are not modeled anywhere** in the app. If CORC cash value / biochar economics are in scope, that's new work (not present in the base transcription either).
4. **Image unanalyzed** — needs a vision-capable run or a human look to confirm it's non-numeric (likely site/photographic).

**Blast radius if MP Sepang becomes authoritative:** `src/lib/valueChain.ts` (`WOOD_CHIP_BASIS` + doc comment), `src/lib/valueChain.test.ts` (factor/tonnage expectations), and the Dashboard chart tooltip text. Build/test verification: `npm run build` + `npx tsc -b` + `npx vitest run src/lib/valueChain.test.ts src/lib/feedstock.test.ts`.

# 001 — VLM Selection and Cost Strategy

> **Status**: Working document. Sections 0–2 are confirmed. Sections 3+ are in progress.
> Once a section stabilizes, distill it into a polished ADR under `docs/decisions/`.

## Context

JINDO is an AI-powered listing generator for the Korean community in Vancouver using secondhand marketplaces (UvanU, VanJoseon, HelloVancouver). Users upload photos of their items and receive a complete Korean listing (title, description, price range, tags) as JSON output. This plan refines the 4-week roadmap in `PROJECT_PLAN.md` into executable engineering decisions.

**Dual purpose of this project**:
1. **Revenue** — Freemium SaaS with Pro/Plus subscriptions
2. **Portfolio** — Public repository demonstrating engineering judgment for Canadian tech employers

Cost optimization (revenue) and decision documentation (portfolio) are treated as equal concerns.

**Language policy**: All repository documentation, commit messages, code comments, and PR descriptions are written in **English** for accessibility to Canadian employers. User-facing product UI remains in **Korean** (target audience is the Vancouver Korean community).

---

## 0. Documentation Strategy

All documentation lives inside the repo to preserve portability across machines and capture decision evolution in Git history.

```
listing-ai/
├── docs/
│   ├── planning/            # WIP plans (rough content allowed; Git history is the audit trail)
│   │   └── 001-vlm-and-cost.md
│   ├── decisions/           # Polished ADRs written once a decision solidifies
│   │   ├── 001-vlm-selection.md
│   │   ├── 002-stack-choices.md
│   │   └── 003-pricing-model.md
│   └── research/            # Experiments, benchmarks, prompt iteration notes
│       ├── vlm-cost-analysis.md
│       ├── prompt-iterations.md
│       └── model-ab-results.md
├── README.md                # Project intro + links into docs/decisions/
└── ...
```

Workflow:
1. `docs/planning/` — where active work happens; rough exploration is fine here
2. `docs/decisions/` — polished ADRs distilled from planning sections once confirmed
3. `docs/research/` — empirical work: prompt experiments, A/B results, cost retrospectives

---

## 1. VLM Model Comparison (as of 2026-04, prices in CAD at USD/CAD ≈ 1.37)

### Evaluation Criteria

1. **Cost** — Pre-revenue; minimize unit cost per generation
2. **Korean generation quality** — Friendly polite tone matching the Vancouver Korean community
3. **Image understanding** — Brand, material, condition recognition across up to 5 photos
4. **Structured JSON output** — Enforced schema; minimal parse failures
5. **Response latency** — Target p50 under 5 seconds
6. **Vercel serverless compatibility** — No GPU, no self-hosting

### Price Comparison (CAD)

| Model | Input $/1M | Output $/1M | Tokens/image |
|---|---|---|---|
| **Gemini 3.1 Flash Lite** | $0.34 | $2.06 | ~1,120 |
| **Gemini 3 Flash** | $0.69 | $4.11 | ~1,120 |
| **Claude Haiku 4.5** | $1.37 | $6.85 | 1,000+ |
| **GPT-5 Mini (Image)** | $3.43 | $2.74 | ~140/tile |
| Qwen2.5-VL (open source) | self-hosted | — | — |

### Unit Cost per Generation (5 photos + 500 output tokens, CAD)

| Model | 1 call | 100 | 1,000 | 10,000 |
|---|---|---|---|---|
| Gemini 3.1 Flash Lite | ~$0.003 | $0.30 | $3.00 | $30 |
| **Gemini 3 Flash** | ~$0.006 | $0.60 | $6.00 | $60 |
| Claude Haiku 4.5 | ~$0.007 | $0.70 | $7.00 | $70 |
| GPT-5 Mini | ~$0.009 | $0.90 | $9.00 | $90 |

With a single photo, costs drop to roughly **1/3** of the above (images dominate the token count).

### Trade-offs by Model

**Gemini 3.1 Flash Lite** (cheapest)
- ✅ Lowest cost, fastest response, same SDK surface as Flash (trivial to swap)
- ⚠️ May underperform on complex pricing reasoning and subtle Korean nuance
- ⚠️ Preview-stage — stability risk

**Gemini 3 Flash** (balanced — current choice)
- ✅ Best balance across cost / quality / speed for this use case
- ✅ Thinking mode improves price-recommendation reasoning quality
- ✅ 1M context window — comfortable room for 5 photos plus long descriptions
- ⚠️ 2× the cost of Lite (still only $0.006 CAD/call)

**Claude Haiku 4.5** (quality-first)
- ✅ Strongest tool-use-based JSON enforcement — minimal parse errors
- ✅ Natural Korean tone, high instruction-following rate
- ⚠️ 2.3× the cost of Gemini Lite
- ⚠️ High image token consumption — cost spikes with 5 photos

**GPT-5 Mini**
- ✅ Mature Structured Outputs, well-documented ecosystem
- ⚠️ Most expensive in this table; exceeds JINDO's cost target
- ⚠️ Unclear training bias for Korean community marketplace tone

**Qwen2.5-VL** (excluded from MVP)
- ✅ Strong on Asian languages including Korean
- ❌ Cannot run on Vercel — requires GPU instance (RunPod / Modal)
- → Revisit at scale

### Model Strategy — Hybrid (Freemium Tier Split)

"Picked the most expensive model" is a weak portfolio narrative. "Analyzed costs, chose tiered strategy backed by A/B data" is what tech reviewers respond to — and it doubles as genuine SaaS value segmentation.

| Tier | Model | Rationale |
|---|---|---|
| **Free** (guest / logged-in) | **Gemini 3 Flash** | $0.006 CAD/call; balanced on cost / quality / speed |
| **Pro** ($4.99/mo) | **Claude Haiku 4.5** | $0.007 CAD/call; differentiates paid tier via Korean fluency |

Value of this structure:
1. **Revenue**: Pro tier upgrade is justified by *output quality*, not just volume — stronger value proposition
2. **Portfolio**: Mirrors real SaaS tiering patterns reviewers recognize
3. **ADR material**: `docs/decisions/001-vlm-selection.md` will document cost simulation, A/B methodology, and observed quality delta

### Architectural Implication

**Adopt the Vercel AI SDK** for provider abstraction:

```ts
// lib/ai/generate-listing.ts
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';

const model = tier === 'pro'
  ? anthropic('claude-haiku-4-5-20251001')
  : google('gemini-3-flash');
```

Model swaps become a one-line change. A/B tests and future premium tiers (e.g., Opus) slot in naturally.

---

## 2. Cost Management Strategy (Including Demo / Dev)

### Principle

**Every API call costs money** — demos, development, and production alike. But MVP / portfolio-stage volume is low enough that absolute cost is negligible *provided* hard limits are configured to prevent runaway spend.

### Realistic Cost Scenarios (CAD)

| Scenario | Calls | Cost |
|---|---|---|
| Portfolio demo (20 interviewers × 3 calls) | 60 | ~$0.36 |
| MVP first month (50 users × 5 calls) | 250 | ~$1.50 |
| Monetization start (200 users × 10 calls) | 2,000 | ~$12.00 |
| Growth phase (1,000 users × 10 calls) | 10,000 | ~$60.00 |

Breakeven: **3× Pro subscribers at $4.99/mo** covers the first month's total AI cost.

### Four Cost-Saving Tactics

1. **Gemini free tier (dev only)**
   - AI Studio key: 15 RPM, ~1,500 requests/day free
   - ⚠️ Free-tier data is used for training → never send sensitive images
   - Production must use paid tier (Vertex AI or paid Gemini API)

2. **Hard API-key limits**
   - Google Cloud Console → API key → daily cap $5 CAD
   - Anthropic Console → spend limit
   - Blocks runaway loops and leaked-key damage

3. **Mock layer during development**
   ```ts
   // lib/ai/generate-listing.ts
   if (process.env.AI_MOCK === 'true') {
     return MOCK_RESPONSE; // fixed JSON for UI iteration
   }
   ```
   - UI work consumes zero API calls
   - Reusable in Playwright / Cypress E2E tests

4. **Per-environment model switching**
   - `NODE_ENV=development` → Gemini 3.1 Flash Lite ($0.003/call)
   - `NODE_ENV=production` → Gemini 3 Flash / Claude Haiku 4.5
   - Handled automatically by the AI SDK abstraction

### Observability

- Vercel Analytics + custom events for per-call cost tracking
- Supabase `ai_calls` table recording model, token counts, latency
- Monthly retrospective automated to `docs/research/cost-retrospective.md`

---

## 3. Technical Stack Details

*In progress — next section to fill in.*

Topics to cover:
- Package manager (pnpm recommended)
- Image storage: Vercel Blob vs Supabase Storage (avoid dual storage layers)
- Supabase schema (users, listings, usage_counts, ai_calls)
- Folder structure (`src/`, feature-based organization)
- Auth: Supabase Auth with email + Google OAuth
- Validation and environment management (Zod, T3 env schema)

## 4. Week 1 — File-Level Task List

*TBD*

## 5. Week 2 — Core Feature Implementation Order

*TBD*

## 6. Week 3 — Auth and Usage-Limit Logic

*TBD*

## 7. Week 4 — Launch Checklist

*TBD*

## 8. Verification Plan

*TBD*

---

## References

- [Gemini API Pricing — Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 3.1 Flash Lite Preview — OpenRouter](https://openrouter.ai/google/gemini-3.1-flash-lite-preview)
- [Claude API Pricing — Anthropic](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude Haiku 4.5 Pricing — BenchLM](https://benchlm.ai/blog/posts/claude-api-pricing)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [Vercel AI SDK Documentation](https://ai-sdk.dev/)

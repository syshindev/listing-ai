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

### Package Manager

**pnpm** — fastest install, strict dependency resolution, disk-efficient via content-addressable store. Vercel's recommended default.

### Image Storage

**Supabase Storage** (not Vercel Blob or Cloudflare R2).

Rationale:
- Same project as Postgres + Auth → Row-Level Security references `auth.uid()` directly on storage paths
- One vendor invoice instead of three once usage exceeds free tiers
- Free tier (1GB) comfortably covers MVP (~3,000 photos at 300KB each)
- Built-in image transform API for resizing and WebP conversion

Trade-off: Cloudflare R2 would be cheaper at scale (free egress), but its infrastructure overhead isn't worth it for current traffic expectations. Revisit if storage egress cost becomes material.

### Folder Structure

**`src/` + feature-based**:

```
src/
├── app/              # Next.js App Router — thin routing only
├── features/
│   ├── listing/      # AI listing generation (self-contained)
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── actions.ts
│   │   └── schemas.ts
│   ├── auth/
│   ├── billing/
│   └── usage-limit/
├── components/ui/    # Reusable shadcn/ui primitives
├── lib/              # Domain-neutral helpers (db client, AI SDK setup, utils)
├── env.ts            # Typed environment schema
└── types/
```

Rule: code used by a single feature lives under `features/<name>/`. Code shared across two or more features graduates to `lib/`.

Rationale:
- One feature = one folder → cognitive load for adding or removing a feature is minimal
- Portfolio signal: type-based (`components/`, `hooks/`, `lib/`) spreads one feature across multiple top-level directories; feature-based reads as production-scale thinking
- Scales naturally as the 4-week roadmap adds `auth`, `billing`, `usage-limit` as new feature modules

### Supabase Schema

Five tables, all in the `public` schema. `auth.users` is managed by Supabase Auth.

```sql
profiles
├── id (uuid, PK, FK → auth.users.id)
├── email (text)
├── plan (enum: 'free' | 'pro')
├── created_at, updated_at

listings
├── id (uuid, PK)
├── user_id (uuid, FK → profiles.id, NOT NULL)
├── title (text)
├── description (text)
├── price_min, price_max, price_suggested (int)   -- CAD
├── price_reasoning (text)
├── tags (text[])
├── image_urls (text[])
├── model_used (text)              -- 'gemini-3-flash' etc.
├── is_edited (bool)               -- true after user edits the AI output
├── created_at, updated_at

ai_calls
├── id (uuid, PK)
├── user_id (uuid, FK, NOT NULL)
├── listing_id (uuid, FK, nullable)
├── model (text)
├── input_tokens, output_tokens (int)
├── cost_cad (numeric(10, 6))
├── latency_ms (int)
├── status (enum: 'success' | 'error')
├── error_message (text, nullable)
├── created_at

usage_counts
├── id (uuid, PK)
├── user_id (uuid, FK, NOT NULL)
├── period_start (date)            -- first day of month
├── count (int)
├── UNIQUE (user_id, period_start)
├── created_at, updated_at

subscriptions
├── id (uuid, PK)
├── user_id (uuid, FK, NOT NULL)
├── plan (enum: 'pro')
├── status (enum: 'active' | 'cancelled' | 'expired')
├── lemonsqueezy_subscription_id (text)
├── current_period_end (timestamptz)
├── created_at, updated_at
```

Design decisions:
- **Two tiers only (free, pro)** — Plus dropped from original PROJECT_PLAN as over-scoped for expected usage. Adding Plus later is a one-line enum extension.
- **`profiles.plan` duplicated from `subscriptions`** — hot-path tier checks avoid a join. A trigger keeps them in sync when `subscriptions` changes.
- **Login required** — no anonymous usage tracking. All `user_id` columns are NOT NULL. Simpler RLS, less abuse surface.
- **`ai_calls` table is append-only** — immutable cost observability log, deliberately separate from the mutable `listings` table.
- **`usage_counts` aggregates by month** — O(1) rate-limit check rather than counting rows in `listings`.
- **`cost_cad` stored per call** — pins FX-rate-at-time-of-call so historical cost reports stay accurate despite exchange rate drift.

Row-Level Security: every user-owned table uses `auth.uid() = user_id` policies. `ai_calls` is read-only for owners; writes happen through a Server Action running as the service role.

### Authentication

**Email/password + Google OAuth**, both via Supabase Auth.

Routes:
- `/auth/login` — email+password and Google button
- `/auth/signup` — email+password and Google button
- `/auth/forgot-password` — password reset via email link
- `/auth/reset-password` — consumes the reset link
- `/auth/verify-email` — consumes the email verification link

Middleware gates protected routes (`/create`, `/result/[id]`, anything under `/app`).

Rationale for supporting both: email/password gives portfolio depth (hashing, reset flow, verification) at near-zero additional cost since Supabase handles the hard parts. Google OAuth is the low-friction default for the Vancouver Korean community (Gmail penetration is very high).

### Validation

**Zod** throughout — form input, Server Action payloads, AI response parsing, environment schema.

Integrates with:
- `react-hook-form` via `@hookform/resolvers/zod`
- `@t3-oss/env-nextjs` for typed env
- AI SDK `generateObject({ schema: ... })` for VLM structured output

### Environment Variables

**`@t3-oss/env-nextjs`** with a Zod schema at `src/env.ts`. Catches missing or malformed env vars at build time, separates server vs client env, and provides full TypeScript inference on `env.X` usage.

### Rate Limiting

**Supabase DB using the `usage_counts` table.** Implementation:

```typescript
// Pseudocode for the rate-limit check (runs server-side before any AI call)
const { count } = await supabase
  .from('usage_counts')
  .select('count')
  .eq('user_id', userId)
  .eq('period_start', currentMonth)
  .single();

if (profile.plan === 'free' && count >= 5) {
  throw new Error('Monthly limit reached');
}
// After success, UPSERT increment count
```

Rationale:
- One less external service (no Upstash Redis bill or dashboard to manage)
- JINDO's traffic profile (low frequency, low concurrency) doesn't need sub-millisecond rate-limit latency
- DB transactions handle the race condition
- Documentable as an ADR: a DIY rate limiter shows engineering judgment more than dropping in an SDK

Scale trigger: if per-user concurrency or total RPS grows past a few hundred per second, swap to Upstash via the same function signature.

### Summary of Section 3 Decisions

| Area | Choice |
|---|---|
| Package manager | pnpm |
| Image storage | Supabase Storage |
| Folder structure | `src/` + feature-based |
| Schema | 5 tables; login required; free + pro tiers |
| Auth | Email/password + Google OAuth (both) |
| Validation | Zod |
| Env management | `@t3-oss/env-nextjs` |
| Rate limiting | Supabase DB (`usage_counts`) |

## 4. Week 1 — File-Level Task List

Goal by end of Week 1: a deployed, empty-but-navigable JINDO shell on Vercel with Supabase connected, auth wired (no real flows yet), and folder structure in place. AI features are deferred to Week 2.

### 4.1 Next.js Foundation (local)

```bash
# In the existing repo root:
pnpm create next-app@latest . \
  --typescript --tailwind --app \
  --src-dir --import-alias "@/*" \
  --no-eslint  # linter config added deliberately later (Biome or ESLint)
```

- [ ] Scaffold runs successfully; `pnpm dev` shows Next.js welcome page at `http://localhost:3000`
- [ ] Verify directory: `src/app/layout.tsx`, `src/app/page.tsx`, `tsconfig.json`, `tailwind.config.ts` exist
- [ ] Delete boilerplate content from `src/app/page.tsx` (keep the file, empty component)

### 4.2 Core Dependencies

```bash
pnpm add @supabase/supabase-js @supabase/ssr
pnpm add ai @ai-sdk/google @ai-sdk/anthropic
pnpm add zod @t3-oss/env-nextjs
pnpm add react-hook-form @hookform/resolvers
pnpm add lucide-react class-variance-authority clsx tailwind-merge
pnpm add -D @types/node
```

- [ ] `package.json` reflects all of the above
- [ ] `pnpm install` finishes without peer-dep warnings

### 4.3 shadcn/ui Initialization

```bash
pnpm dlx shadcn@latest init
# Accept defaults; choose: Default style, Slate base color, src/components/ui
```

- [ ] `components.json` exists at repo root
- [ ] `src/components/ui/` directory created
- [ ] `src/lib/utils.ts` has `cn()` helper

Install the core primitives used by the initial pages:

```bash
pnpm dlx shadcn@latest add button input label form card toast
```

### 4.4 Folder Structure — Feature-Based Skeleton

Create the following empty directories (stub `.gitkeep` files so Git tracks them):

```
src/
├── app/
│   ├── (marketing)/
│   │   └── page.tsx          # Landing — move existing home here
│   ├── create/
│   │   └── page.tsx          # Listing creation (empty stub)
│   ├── result/[id]/
│   │   └── page.tsx          # Result view (empty stub)
│   ├── auth/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── reset-password/page.tsx
│   │   └── verify-email/page.tsx
│   ├── api/                  # Route handlers (webhooks etc.)
│   └── layout.tsx
├── features/
│   ├── listing/.gitkeep
│   ├── auth/.gitkeep
│   ├── billing/.gitkeep
│   └── usage-limit/.gitkeep
├── components/
│   └── ui/                    # populated by shadcn
├── lib/
│   ├── ai/.gitkeep           # AI SDK abstraction lives here
│   ├── supabase/.gitkeep     # Supabase server/browser clients
│   └── utils.ts              # shadcn cn() helper
├── types/.gitkeep
└── env.ts                     # t3-oss/env schema (next step)
```

- [ ] All stub pages render "coming soon" placeholder text
- [ ] Routing works: visiting `/create`, `/result/abc`, `/auth/login` returns valid pages (not 404)

### 4.5 Environment Schema

Create `src/env.ts` using `@t3-oss/env-nextjs`:

```typescript
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    GEMINI_API_KEY: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    AI_MOCK: z.enum(['true', 'false']).default('false'),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
  runtimeEnv: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AI_MOCK: process.env.AI_MOCK,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
});
```

- [ ] `.env.example` file committed with empty placeholders (no real keys)
- [ ] `.env.local` created locally (gitignored already by default Next.js setup)

### 4.6 Supabase Project

On supabase.com:

1. Create new project. Region: `us-west-1` (closest to Vancouver for latency)
2. Set database password, save to password manager
3. From project settings → API: copy
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-side only!)

Run the schema in Supabase SQL editor:

```sql
-- profiles
create type plan_tier as enum ('free', 'pro');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  plan plan_tier not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- listings
create table listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text not null,
  price_min int,
  price_max int,
  price_suggested int,
  price_reasoning text,
  tags text[] default '{}',
  image_urls text[] default '{}',
  model_used text not null,
  is_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ai_calls
create type call_status as enum ('success', 'error');

create table ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid references listings(id) on delete set null,
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  cost_cad numeric(10, 6) not null,
  latency_ms int not null,
  status call_status not null,
  error_message text,
  created_at timestamptz not null default now()
);

-- usage_counts
create table usage_counts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  period_start date not null,
  count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_start)
);

-- subscriptions
create type sub_status as enum ('active', 'cancelled', 'expired');

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan plan_tier not null,
  status sub_status not null,
  lemonsqueezy_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table profiles enable row level security;
alter table listings enable row level security;
alter table ai_calls enable row level security;
alter table usage_counts enable row level security;
alter table subscriptions enable row level security;

create policy "users view own profile" on profiles
  for select using (auth.uid() = id);
create policy "users update own profile" on profiles
  for update using (auth.uid() = id);

create policy "users CRUD own listings" on listings
  for all using (auth.uid() = user_id);

create policy "users view own ai_calls" on ai_calls
  for select using (auth.uid() = user_id);

create policy "users view own usage_counts" on usage_counts
  for select using (auth.uid() = user_id);

create policy "users view own subscriptions" on subscriptions
  for select using (auth.uid() = user_id);
```

- [ ] All 5 tables visible in Supabase Table Editor
- [ ] RLS badge appears on each table (green shield icon)

Enable Google OAuth:
- Supabase Authentication → Providers → Google → enable with OAuth client ID/secret from Google Cloud Console

### 4.7 Supabase Client Wiring

Create `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts` following the `@supabase/ssr` pattern. Typed with generated types from Supabase CLI.

- [ ] `pnpm dlx supabase gen types typescript --project-id <id>` generates `src/types/supabase.ts`
- [ ] Smoke test: Server Component calls `supabase.from('profiles').select('id').limit(1)` without error (empty result is fine)

### 4.8 Auth Middleware

Create `src/middleware.ts` protecting `/create` and `/result/*`. Unauthenticated users redirect to `/auth/login`.

- [ ] Visiting `/create` while logged out redirects to `/auth/login`
- [ ] Visiting `/auth/login` while logged in redirects to `/create`

### 4.9 Vercel Deployment Pipeline

- [ ] Connect the `syshindev/listing-ai` repo to Vercel (one-click import)
- [ ] Production env vars set in Vercel dashboard (all of the ones in `src/env.ts`)
- [ ] First deploy succeeds; `https://jindo-*.vercel.app` shows the empty shell
- [ ] Custom domain (optional, $15/year): configure DNS if purchasing

### 4.10 End-of-Week-1 Verification

- [ ] Running `pnpm build` locally succeeds with no type errors
- [ ] Deployed URL accessible; auth pages render; Supabase health-check endpoint returns 200
- [ ] `src/env.ts` catches a deliberately removed env var at build time (manually test once)
- [ ] Commit history on `main` is clean and each commit has a Conventional Commit message

### 4.11 Deliverables Committed

By end of Week 1, `main` branch contains:
- Scaffolded Next.js app with `src/` + feature-based skeleton
- `src/env.ts` with typed env schema
- `src/lib/supabase/` with typed client
- `src/middleware.ts` protecting routes
- Placeholder pages rendering
- Updated `README.md` status section ("Week 1 complete — empty shell deployed")

---

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

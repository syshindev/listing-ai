# <img src="assets/favicon.svg" width="40" align="center" alt="JINDO logo"/> JINDO — AI Listing Generator for Secondhand Marketplaces

Upload photos of an item and receive a complete, ready-to-post Korean listing (title, description, price range, tags) in seconds.

Targeted at the Korean community in Vancouver — UvanU, VanJoseon, HelloVancouver and similar Korean-language marketplaces.

## Status

Early planning. Implementation has not started yet.

## Documentation

- [`docs/planning/`](./docs/planning/) — working engineering plans (in progress)
- [`docs/decisions/`](./docs/decisions/) — polished ADRs, populated as planning sections solidify
- [`docs/research/`](./docs/research/) — experiments, benchmarks, prompt iteration notes

Start with [`docs/planning/001-vlm-and-cost.md`](./docs/planning/001-vlm-and-cost.md) for the current state of the plan.

## Planned Stack

- **Framework**: Next.js 15 (App Router) + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **AI**: Vercel AI SDK — Gemini 3 Flash (free tier) / Claude Haiku 4.5 (Pro tier)
- **Backend**: Supabase (Postgres, Auth)
- **Hosting**: Vercel
- **Package manager**: pnpm

Rationale for each choice lives in `docs/planning/` and will graduate to `docs/decisions/` as decisions solidify.

## Language

Repository artifacts (docs, code, commits, PRs) are in English. Product UI and AI-generated listings are in Korean (the target audience).

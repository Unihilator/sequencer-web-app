# Roman Derkach — portfolio & online sequencer

Personal portfolio of an iOS developer, built as an end-to-end learning
project: code, hosting, domain, DNS, CI/CD, SEO, analytics and launch.

## What's inside

- **Home** — portfolio with scroll-driven animations and a 3D/shader hero.
- **/sequencer** — browser step sequencer (drum machine + simple synth) with
  audio-reactive visuals and pattern sharing via URL.
- **/projects** — iOS apps.
- **/blog** — articles written in MDX.

Status and roadmap: [docs/PLAN.md](docs/PLAN.md).

## Stack

Next.js (App Router) · TypeScript (strict) · Tailwind CSS · Motion ·
GSAP + ScrollTrigger · Lenis · Three.js + React Three Fiber · Tone.js ·
Zustand · MDX · Vitest · Playwright · ESLint + Prettier.
Hosted on Vercel, DNS on Cloudflare, CI on GitHub Actions.

## Getting started

Requirements: Node.js 24+ (see `.nvmrc`) and pnpm (version pinned in
`package.json` → `packageManager`).

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000.

## Scripts

| Command          | What it does                                    |
| ---------------- | ----------------------------------------------- |
| `pnpm dev`       | Start the dev server                            |
| `pnpm build`     | Production build                                |
| `pnpm start`     | Serve the production build                      |
| `pnpm lint`      | ESLint                                          |
| `pnpm typecheck` | TypeScript type check                           |
| `pnpm format`    | Format with Prettier (`format:check` for CI)    |
| `pnpm test`      | Unit tests (Vitest); `test:watch` for watch     |
| `pnpm test:e2e`  | E2E tests (Playwright: Chromium, mobile WebKit) |

First e2e run needs browsers: `pnpm exec playwright install chromium webkit`.

## Project structure

```
src/app         routes (App Router)
src/audio       audio engine (framework-agnostic, no React)
src/components  UI components; src/components/three for 3D scenes
src/lib         utilities, SEO helpers, analytics
src/store       Zustand stores
content/blog    MDX articles
e2e             Playwright tests
docs            plan and documentation
```

Directories appear as the corresponding features are built.

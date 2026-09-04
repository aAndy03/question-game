# 03 — Stack

## This file owns

The tools named in the notes for building the app.

This is a builder file. The operator never has to know these names.

## Core

- RUST
- Tauri 2
- Typescript@latest
- React@latest
- Tailwind@Latest
- HeroUi@latest

HeroUI install named in the notes:

- `npm i @heroui/styles @heroui/react`

React: follow the API / docs pattern. React uses Providers and other documented pieces. Follow **React 19** API docs.

## Charts

- `npm install echarts`
- notes also mention: `npx shadcn@latest add @evilcharts/echarts-{chart-name}`
- Use for charts
- Must not conflict with the rest of the app UI that uses HeroUI

## Motion, drawing, layout, icons

Named in the notes:

- `npm install motion` — `import { motion } from "motion/react"`
- `npm install @web-kits/audio` — open question: can it create sounds for the game, or only UI of the app? Can it load custom sound files?
- `npm install calligraph`
- `npm install matter-js`
- `npm install dialkit motion` — handy in many areas of the app
- `npm install gsap` and `@gsap/react` — Stage screens, transitions, overlay animations only. 2D physical feel via `Physics2DPlugin` / `InertiaPlugin`.
- `npm install motion` — Studio chrome only.
- `npm install @dnd-kit/react`
- Default Studio icons: `@iconify/react` with Gravity UI (`icon="gravity-ui:…"`), which is what HeroUI v3 uses.
- `npm i @phosphor-icons/react` — supplement (`weight="duotone"`) when Gravity UI has no fit.
- `npm i @base-ui/react` — unstyled primitives only if HeroUI has no fit; skin with `@heroui/styles` tokens.

**Dropped:** `@svgdotjs/svg.js`, `matter-js`. No haptics track (desktop only).

EvilCharts stays isolated to Statistics until a later decision.

## Search

Use **Tantivy** for Rust so search is not built from zero.

The search component can be reused in Questions, Teams, Game, Screens, Operator tabs, and similar.

## Skills / agents notes (builder context)

- `npx skills add https://github.com/anthropics/skills --skill frontend-design`
- `npx heroui-cli@latest agents-md --react`

## Quality bar

The app has to stay optimized while offering fullstack quality.

Screens / Slides on Stage:

- Built like a game
- Run like a presentation
- Designed like a game using 2D / layered Stage motion, animation, and sounds (desktop; no haptics)

## What goes where (direction only)

Full split lives in [16-open-questions-and-proposals.md](16-open-questions-and-proposals.md).

Direction already in the notes:

- Logic of backend in Rust
- Visual versions of components live in Typescript + React + other libraries
- For those visual versions to surface, they need to be caused by the backend, or surface because something changed in the backend

## What this file does not own

Product rules, tab layout, or engine ownership.

## Depends on

- [02-platform-and-health.md](02-platform-and-health.md) — Tauri packaging, OS integration

## Talks to

- [04-layered-engines.md](04-layered-engines.md)
- [09-screens-tab.md](09-screens-tab.md) — dnd-kit, dialkit motion, layout
- [11-transitions-and-reveals.md](11-transitions-and-reveals.md) — GSAP
- [14-statistics.md](14-statistics.md) — echarts

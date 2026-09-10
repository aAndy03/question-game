# questiongame Design System

## Source
Figma file: "question game" — https://www.figma.com/design/rrPkXXNDZKyr5YX1A7Q0o5/question-game (mounted read-only for this build; 1 page, 16 frames, 542 nodes).
No codebase was attached. No logo file exists in the source — the wordmark "question\ngame" set in Space Mono Bold IS the brand mark (see idle-screen).

## What this is
questiongame is a live trivia/quiz game presented on a shared screen (projector/TV) for teams competing head-to-head — built for "HOPE CHALLENGE x AMiCUS" as the observed tournament instance. It is a presentation deck, not a website or app: every screen is a 1920×1080 full-bleed slide driven by a host, moving through a fixed sequence:

idle → team-order → domain-selection → question → answer result (4 variants) → scoreboard → (repeat) → final-leaderboard

A same-team "current team" interstitial appears if a team needs a domain-not-chosen / domain-not-changed nudge (built as overlay animations in Figma — out of scope per instructions, but the static "current team" frame is included as a screen).

## Content fundamentals
- **Voice**: terse, systems/HUD language, not conversational. Labels read like console output: `AWAITING_GAME_START...`, `DOMAIN // TECHNOLOGY`, `TIMER // REMAINING`, `RESULT // ALL CORRECT`, `[ 00:12:20 ]`, `SESSION // 2026 - 2027`.
- **Casing**: small metadata labels are set in UPPERCASE letters but the CSS applies `text-transform: lowercase` on top of them for a stylized broken-case effect (e.g. source string "DOMAIN // TECHNOLOGY" renders lowercase) — mixed with true uppercase where no transform is applied (e.g. team names "TEAM ALPHA"). Big headline/question text is normal sentence case.
- **Punctuation as structure**: the `//` slash pair is the recurring delimiter between a category and its value (`DOMAIN // TECHNOLOGY`, `CURRENT STANDINGS //`, `SELECT CATEGORY // TEam alpha`). Brackets wrap the running clock: `[ 00:12:20 ]`.
- **No emoji, no exclamation-heavy copy.** The one "!" and "?" marks that appear are giant graphic glyphs (icon.svg), not inline punctuation in text.
- **Numbers as identity**: category codes look like part numbers (`TEC_881`, `GEO_105`, `SPT_512`, `HST_102`, `ART_980`) — three letters + three digits, monospaced.
- **Result copy** is blunt and scoring-first: `RESULT // ALL CORRECT` / `RESULT // INCORRECT` / `RESULT // EXTRA SELECTION` (partial-correct case), each paired with a big `+N PTS` (or `+0 PTS`).

## Visual foundations
- **Base palette**: near-black ink `rgb(25,25,25)` for nearly all strokes/text/borders, true black `rgb(0,0,0)` reserved for the biggest display headlines, white `rgb(255,255,255)` page background. No grays used for surfaces — only `rgb(142,142,142)` (dimmed/unselected text) and `rgb(224,224,224)` (dimmed card stroke).
- **Signal colors**: mint green `rgb(131,255,178)` = correct/positive, coral red `rgb(255,131,131)` = incorrect/negative, sky blue `rgb(131,218,255)` = informational/neutral accent, pale gold `rgb(255,236,131)` = "leader" / standings highlight, warm yellow `rgb(255,213,79)` = decorative accent shapes. Max 1–2 signal colors active per screen.
- **Type**: Space Grotesk (display/headline, bold weight, tight negative letter-spacing at large sizes e.g. -6px at 160px, -2px at 56px) is the "human" voice for questions, team names, and hero numbers. Space Mono (bold, wide positive letter-spacing on small labels e.g. +2px–4px) is the "system" voice for HUD labels, timers, and category tags. Nothing else is used.
- **Borders over shadows**: there is no drop-shadow or blur anywhere. Structure comes from solid `inset` box-shadows acting as crisp borders (1px/2px/3px), not `border` properties with radius — this is intentional: the game separates "frame" (0 radius, hairline-to-heavy inset borders) from "card" (a slight 8px radius + heavy 3px inset border, used only on interactive/result surfaces like answer options and result widgets). Small tag pills (SELECTED, LEADER) get 0 radius and solid fill, no border.
- **Header bar**: a consistent thin-top/thin-sides/thick-bottom (1px/1px/2px) rule sits under every in-game screen's header — asymmetric border weight is a repeated motif (thick bottom, thin elsewhere) also seen on full-width dividers (2px inset line) between a slide's header zone and content zone.
- **Corner radii**: 0px is the default (frames, dividers, tag pills, header). 4px is used only for small avatar/letter boxes ("Label-Box"). 8px is used only for answer-option cards and result widgets — the ONLY rounded surfaces in the system.
- **Layout**: fixed 1920×1080 canvas — a *design* canvas, fitted to whatever display Stage is sent to (`templates/StageFit.tsx`) and never reflowed — 64px outer padding on all sides, 40px vertical gap between header/body zones, generous 24–64px gaps between siblings. Two-column layouts are typical: content-heavy column (grows) + a fixed-width decorative/graphic column on the right (398–600px).
- **Decorative geometry ("2D physics elements")**: hand-cut angular shapes (a 12-point burst "+", a triangular "-", diamond outlines, a rotated giant "?" or "!" glyph) scattered at odd rotations (matrix transforms, not simple `rotate()`) around the edges of a screen, always in a signal color, sometimes at reduced opacity (0.12–0.35) as background texture, sometimes at full opacity as commentary (a green burst near a correct answer, a red triangle near an incorrect one). These represent the physics-driven pieces described in the brief — treat them as loose, independently-positioned bodies that could tumble/settle, not as fixed decorative icons.
- **No gradients, no photography, no blur/glass effects, no drop shadows.** Everything is flat fills and hairline-to-heavy strokes. The aesthetic is "printed scoreboard / broadsheet" rather than "screen glow."
- **States**: selected/correct = filled ink-black chip or mint-green card + heavy 3px border; unselected/other options = white card at 50% opacity with a 1px light-gray border, text dims to `rgb(142,142,142)`. There is no hover/press state in a presentation deck — the only "interaction" state is the reveal (dim → highlighted).

## Iconography
- No icon font, no SVG icon set, no emoji. The system's only "icons" are (a) giant oversized punctuation glyphs (`?`, `!`) used as full-bleed decorative graphics, cut from custom vector paths, and (b) the angular burst/triangle/diamond shapes described above. Both are copied into `assets/` as SVGs — never redraw these. There is no small-scale UI icon (no chevrons, no nav glyphs) anywhere in the source.

## Index

This file is the written design system. The build artefacts it describes live in the monorepo (moved out of this folder at P0, 2026-09-04) — there is no second copy here.

| Original index entry | Where it lives now |
| --- | --- |
| `styles.css` — root stylesheet | `packages/design-stage/stage.css` (also carries the HeroUI variable remap, spec §2.30) |
| `tokens/colors.css`, `typography.css`, `spacing.css` | `packages/design-stage/tokens/` |
| `assets/` — decorative shape SVGs | `packages/design-stage/assets/` (plus `decorative_idle_screen/` — the filled `?` and digits `1`–`5` — and `arrow-right.svg`, exported 2026-09-04; `hulls.json` here is generated by `npm run decor:hulls` — never edit it) |
| fonts (were a Google Fonts `@import`) | `packages/design-stage/fonts/` — self-hosted woff2, because Stage must render offline |
| `components/core/` — Header, ResultWidget, AnswerOption, TimerPanel, ScoreRow, TeamChip, DecorShape | **not yet built.** Due at P2 as `apps/stage/src/{atoms,molecules,organisms}/` — see `docs/v1/04_ROADMAP.md` |
| `ui_kits/questiongame/` — 13 in-scope screens | **not in this repo.** If a click-through recreation exists elsewhere, it is most of P2 already built |
| `guidelines/` — specimen cards | **not in this repo.** |
| `thumbnail.html` | **not in this repo.** |
| `SKILL.md` | **not in this repo.** |

## Intentional additions
- `Icon` wrapper component was NOT added — the source has no icon system to wrap.
- `DecorShape` component is an addition: the source has no reusable "shape" component per se (each burst/triangle/diamond is a one-off vector in Figma), but recreating 6+ near-identical inline SVGs across screens would be unmaintainable; `DecorShape` renders the 4 copied SVGs at configurable position/rotation/opacity.

## Caveats
- Animation/overlay frames (`if-the-answer-is-correct-overlay-animation`, `if-the-answer-is-incorrect-overlay-animation`, `multiple-question-entry-animation-or-overlay-animation`, `handout-change-between-two-teams-entry-animation-or-overlay`) were intentionally excluded per instructions (screens + answer variants only).
- No font files were in the .fig; Space Grotesk / Space Mono are loaded from Google Fonts (exact match — these ARE Google Fonts, not a substitution).
- No logo file exists in the source; the wordmark IS the logo (rendered in type).

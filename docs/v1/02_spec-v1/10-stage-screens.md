# 10 — Stage Screens / Slides

## This file owns

The Screens / Slides that appear on Stage / Presentation.

The notes say these will be detailed in another prompt. This file only records what is already specified.

## Character of Stage

Built like a game.

Runs like a presentation.

Beautifully designed like a game using 3D / 2D, animation, physics, haptics, and sounds.

Stage opens full screen on a secondary display.

Stage never shows:

- the operator’s mouse as a control tool
- Viewer overlays
- Action Panel, Strips, Game panel, Timeline, or other Control chrome

## Named Screens / Slides

Screens / Slides that would go on Stage / Presentation:

0. Idle
1. Order of teams
2. Choose Domain for question
3. Question Screen
4. Scoreboard
5. Final Leaderboard

The operator can decide what screen to show on Stage. The game engine still owns the truth of the game. Showing a Screen does not skip the rules; it only chooses what the audience sees right now.

## How Screens connect to the rules (interdependence)

| Moment in the game | Screen that usually shows it |
| --- | --- |
| Nothing playing yet | Idle |
| Whose turn, team order | Order of teams |
| Team chooses a domain | Choose Domain for question |
| A question is in play | Question Screen |
| Scores during the game | Scoreboard |
| No questions left | Final Leaderboard |

The operator may open these in a different order. Transitions and complementary animations for that case live in [11-transitions-and-reveals.md](11-transitions-and-reveals.md).

## Question Screen — extra control layer

Once the transition from the previous screen is completed:

- The Question and the answers are **not** shown automatically
- The operator chooses to reveal each individually
- First the Question, then each answer individually
- Time starts when the operator starts it from the Action Panel

The operator can choose, from Control tab in the Game panel, if these appear automatically or wait for the operator’s decision.

## Leaderboard — extra control layer

The same level of control:

- From the lowest team first, to the first one

Same automatic-or-wait choice in the Game panel.

## Default look vs modified look

Defaults are built into the Screens.

Modifications from Screens tab are stored on the Game and used when that Game is played.

## What this file does not own

GSAP transition rules, Control overlays, or canvas editing tools.

## Depends on

- [05-questiongame-rules.md](05-questiongame-rules.md)
- [09-screens-tab.md](09-screens-tab.md)
- [01-product-context.md](01-product-context.md)

## Talks to

- [11-transitions-and-reveals.md](11-transitions-and-reveals.md)
- [12-control-tab.md](12-control-tab.md)
- [04-layered-engines.md](04-layered-engines.md) — Screens engine, Animation engine

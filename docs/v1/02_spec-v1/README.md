# QuestionGame spec v1 — map

This folder is the organized version of `first_spec.txt`.

The notes in `first_spec.txt` stay the source. These files do not invent a new product. They only split the same ideas so each part of the system has a home.

Working specs outside this folder: `optimized_first_spec.md` is the durable decision file and **wins** if this folder disagrees. Unique text from files 01–16 was absorbed into optimized §1 / §12 / §17 (2026-09-03). This folder stays a reading split of `first_spec.txt`.

You are not expected to be a developer to read this. Technical words are used only when they already appear in the notes, or when a later file needs a clear name for something you already described.

## How to read this

Start here, then follow the numbers.

1. What the app is, who uses it, where it is used
2. Install, files, health, Windows and Mac, offline
3. Tools the app is built with (the stack)
4. Layered Engines — who owns what
5. How QuestionGame itself plays
6. Settings that change how a game plays
7. Libraries: Teams, Domains + Questions, Games, Operators, metadata, archive
8. The app as a studio (shell, tabs, first-time flow)
9. Screens tab (canvas, modify what will appear on Stage)
10. Stage Screens / Slides (what the audience sees)
11. Transitions, complementary animations, operator reveals
12. Control tab (operator room while a game is playing)
13. Play, restart, replay, versions
14. Statistics
15. State (when something changes, everything that uses it updates)
16. Open questions and careful proposals (marked as proposals, not decisions)

## Separation is not isolation

These files are separate so ownership is clear. The product is still one system.

Typical links:

- A **Game** in the Game tab is a prepared setup. A **Play** is one actual run of that setup.
- The **Game engine** owns the rules. The **Stage** only presents. The **Control tab** only commands.
- A question that was answered (correct or wrong) expires for the **current Play**, not forever in the library.
- Screen modifications in the Screens tab are saved onto the loaded Game, then shown on Stage when that Game is played.
- Operator overrides in the Viewer or Action Panel must stay in sync with the default team order.

Each file ends with **This file owns**, **Depends on**, and **Talks to**.

## Words used the same way everywhere

| Word | Meaning in this spec |
| --- | --- |
| App / studio | The whole program the operator uses |
| Stage / Presentation | Full-screen show on an external display, TV, monitor, or projector |
| Screens / Slides | The designed views that appear on Stage |
| Operator | Person who controls Stage from the app |
| Moderator | Person with the teams; may watch Stage |
| Teams | Competing groups |
| Domain | A group of questions (example: History) |
| Question | One item inside a Domain, with difficulty and answers |
| Difficulty | Number from 1 to 100; inside a Domain it goes easy to hard |
| Points / Award | What a team receives for a correct answer |
| Game | A prepared setup in the Game tab (teams, domains, settings, screen changes) |
| Play | One actual run of a Game, with its own metadata |
| Control tab | Operator room while playing |
| Viewer | Centre of Control; shows Stage plus operator-only overlays |
| Engine | A part of the system that owns one concern |
| Layered Engines | Single engines, then engines that bind other engines |
| Archive / soft delete | Delete hides in archive; it is not destroyed |
| Metadata | History and technical facts attached to a thing |

## Files

- [01-product-context.md](01-product-context.md)
- [02-platform-and-health.md](02-platform-and-health.md)
- [03-stack.md](03-stack.md)
- [04-layered-engines.md](04-layered-engines.md)
- [05-questiongame-rules.md](05-questiongame-rules.md)
- [06-game-settings.md](06-game-settings.md)
- [07-libraries-and-metadata.md](07-libraries-and-metadata.md)
- [08-app-studio.md](08-app-studio.md)
- [09-screens-tab.md](09-screens-tab.md)
- [10-stage-screens.md](10-stage-screens.md)
- [11-transitions-and-reveals.md](11-transitions-and-reveals.md)
- [12-control-tab.md](12-control-tab.md)
- [13-play-restart-replay.md](13-play-restart-replay.md)
- [14-statistics.md](14-statistics.md)
- [15-state.md](15-state.md)
- [16-open-questions-and-proposals.md](16-open-questions-and-proposals.md)

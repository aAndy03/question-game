# 04 — Layered Engines

## This file owns

How ownership is split so each part of the system does one job, and how those parts are bound together.

## Why engines exist

The engines work layered.

To ensure everything works correctly, concerns are separated into different engines. Every engine owns what it has to do.

## Layers

**(Layer 1)** A single engine that owns its own concerns.

**(Layer 2)** An engine that owns / manages / binds / operates two single engines. These facilitate the talking between the two engines.

**(Layer 3)** An engine that owns / manages / binds / operates combinations such as:

- (Layer 1) + (Layer 2) + (Layer 2)
- or (Layer 2) + (Layer 2) + (Layer 2) + (Layer 1)
- or similar combinations

**(Layer 4)** and so on.

Layer 2, Layer 3, Layer 4 and so on have to **also** manage their own states and metadata.

## Engines named in the source notes

- Question Engine
- Award engine
- Domain engine
- Teams engine
- Settings engine
- Screens engine
- Animation engine

The source also asks what other engines are needed. Suggested extras are listed as proposals in [16-open-questions-and-proposals.md](16-open-questions-and-proposals.md). They are not decided by this file.

## What “owns” means here

If an engine owns a thing:

- It is the source of truth for that thing
- Other engines ask it or send it a command
- They do not secretly keep a second copy that can drift

Example:

- Domain engine owns which domains exist and which questions sit in which domain
- Question Engine owns one question’s text, answers, difficulty, single vs multiple answer, and whether that question is still available in the current Play
- Award engine owns how points are calculated from the chosen settings
- Screens engine owns which Screen / Slide is current and how it is laid out
- Animation engine owns base transitions and complementary animations

## Binding examples (Layer 2 and up)

These are examples of talking, not extra product features:

- Domain + Question — choosing a domain plays the next unexpired question in that domain
- Teams + order of turns — default order, operator override, “all teams play their turn before anyone gets the next turn”
- Game + Settings — a Play uses the settings saved on that Game
- Screens + Animation — leaving one Screen and entering another
- Stage + Display — which physical screen shows Stage
- Control + Game — operator presses Play / Pause / Resume / Restart
- Question + Award — a correct answer becomes points only through Award

## Engines and the operator

Most engines work in the background.

The operator sees engines only as:

- the game behaving correctly
- errors / warnings / necessary info when something is wrong
- suggestions next to those messages

## What this file does not own

The actual game rules, the list of Screens, or Control panel chrome.

## Depends on

- [01-product-context.md](01-product-context.md)
- [05-questiongame-rules.md](05-questiongame-rules.md)
- [06-game-settings.md](06-game-settings.md)

## Talks to

Every other spec file. Engines are the binding idea for the whole system.

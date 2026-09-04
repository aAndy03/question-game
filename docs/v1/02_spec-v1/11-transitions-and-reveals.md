# 11 — Transitions and reveals

## This file owns

How Stage moves from one Screen / Slide to another, including base transitions, complementary animations, and operator-timed reveals.

## Base / default transitions

If using GSAP, the screens need to transition seamlessly. That is the **base / default** transitions.

All screens need to have transitions between each of them, because the operator can decide what screen to show on Stage.

## Overlay animations (handoff / complementary)

Turn-handoff animations drawn **on top of** the current Stage screen.

They do **not** remount the screen and they do **not** reset reveal state. If Question already shows the stem and two answers, an override overlay plays on that same state.

After a wrong answer the app does **not** auto-advance Stage. The operator may override from the Action Panel while still on Question.

If an overlay is already playing and the operator overrides again: let the current overlay **finish**, then play the overlay for the latest override. Do not stack two overlays. One pending override at most.

### Example A — Idle to Domains

If from Idle Screen → Domains screen, that means the team order screen was passed.

Going from Idle to Domains will have a complementary animation showing the team that has the current turn.

If the order was Idle → Order of teams → Domain, only the base transition is played.

### Example B — wrong answer, next team, operator skips Order of teams

Team 1 answers wrongly. Team 2 is next.

If the operator shows the Domains screen, stepping over team order screen, the entry animation on the Domain screen will first show an animation that shows the turn change from Team 1 to Team 2.

If instead the operator shows Order of teams, only the default transition plays (what GSAP does). Then going to Domain plays the default transition between those screens. Then going to Question Screen still plays the default transition between those screens.

### Example C — operator overrides the next team while opening Domains

Default order: Team 1 → Team 2 → Team 3 → Team 4.

Team 2 answered wrong. The operator opens Domain screen. Because they entered Domain directly, the animation between Team 2 and Team 3 is played.

If the operator then overrides to Team 4 while that overlay is playing: wait for the current overlay to finish, then play Team 2 → Team 4. Domain content already shown is not reset.

## Reveal layer (not a screen-to-screen transition)

Another layer of animations lives **inside** a Screen after the transition from the previous screen has completed.

### Question Screen

- Question and answers are not shown automatically
- Operator reveals each individually
- First the Question, then each answer individually
- Time starts when the operator starts it from the Action Panel

### Leaderboard

- Same level of control
- From the lowest team first, to the first one

### Automatic or wait

For these reveals, the operator can choose from Control tab in the Game panel:

- appear automatically
- or wait for the operator’s decision

## Operator can pick any next Screen

Because of that, every pair of Screens needs a base transition.

Complementary animations exist so skipped information (especially whose turn it is) can still be told on the Screen that actually appears.

## What this file does not own

The content of each Screen, or how Viewer overlays work.

## Depends on

- [10-stage-screens.md](10-stage-screens.md)
- [05-questiongame-rules.md](05-questiongame-rules.md)
- [03-stack.md](03-stack.md) — GSAP

## Talks to

- [12-control-tab.md](12-control-tab.md) — operator chooses next Screen and reveal timing
- [04-layered-engines.md](04-layered-engines.md) — Animation engine bound to Screens engine and turn / order

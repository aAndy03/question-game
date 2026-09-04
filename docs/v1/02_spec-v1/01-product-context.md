# 01 — What this app is

## This file owns

Who the app is for, where it is used, and what “playing the game” looks like in the room.

## Short description

A game of questions and answers.

Competing teams and the game moderator can see the game on an external display, TV, monitor, projector, or similar. That display is the **Stage** (also called the **Presentation**).

The Stage is controlled by an **operator** inside the app. The operator decides what is next on Stage.

There is a game engine that owns the game itself. The Stage presents the game through custom-built **Screens / Slides**.

## Two uses, one app

1. **Recorded show (current target)**  
   Teams and moderator are in a studio room, or outside. An operator controls the Stage. The show is recorded and later goes through post production. The app does **not** need to work as a live stream product.

2. **Anybody later**  
   The same app can be downloaded by a person who only wants to play with friends or at school. They should not have to deal with studio hassle.

For now, build for the recorded-show case.

## Where it plays

The game is played anywhere: studio, room, and similar places. Not a live-streaming environment.

The Stage needs to open full screen on a **secondary display**.

## Who is in the room

- **Teams** — play the game
- **Moderator** — with the teams; watches Stage
- **Operator** — uses the app; controls what Stage shows
- **Audience / cameras** — see only Stage, never operator overlays

The operator and the Stage are different jobs. The app is the studio. Stage is only the show.

## What “the app as a studio” means

Through the app, the operator (or any end-user) manages all the variables: teams, domains, questions, games, settings, screen look, and the live Control of Stage.

Details of tabs live in [08-app-studio.md](08-app-studio.md).

## What this file does not own

Game rules, settings options, engine list, Control panel layout, or how Screens are drawn.

## Depends on

Nothing. This is the starting picture.

## Talks to

- [02-platform-and-health.md](02-platform-and-health.md) — real displays, install, files
- [08-app-studio.md](08-app-studio.md) — how the operator works day to day
- [10-stage-screens.md](10-stage-screens.md) — what Stage shows
- [12-control-tab.md](12-control-tab.md) — how the operator commands Stage

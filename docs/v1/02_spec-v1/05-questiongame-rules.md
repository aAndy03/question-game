# 05 — QuestionGame rules

## This file owns

How the game plays once settings are already chosen. Variables, turn flow, domain choice, expiry of questions, end of game, ties.

Settings that change these rules live in [06-game-settings.md](06-game-settings.md).

## Variables named in spec v1

1. Teams — n number of teams
2. Questions — each with difficulty
3. Answers
4. Domains — hold questions
5. Points — a number

Other variables may be introduced later. They are set before the game plays.

## Before play

The game settings, names, domains, questions, difficulty, answers, points, and other variables are changed / set **before** the game plays.

## Teams and order

The game is played in teams.

The game follows a **predictable order** of the teams.

That default order is set on the Game (Game tab). While a Play is running, the operator can override who has the turn. Override rules live in [12-control-tab.md](12-control-tab.md). After an override, the default order continues, unless the operator overrides again.

## Domains and questions

Domains can be n number.

A domain can hold n number of questions.

Each question has its own set difficulty (a number between **1 and 100**).

Per domain, the difficulty progresses from **easy to hard**.

All the domains of questions (all four shapes are valid; a recipe may mix them):

- (a) they can have different number of questions
- (b) the questions can have different difficulty progressions
- (c) the domains can have the same number of questions
- (d) the progression of difficulty can be the same across domains

The second (c) in the source notes is (d).

Questions can be **multiple answer** or **single answer**.

## Choosing a domain — not a question

The team in order can choose **any domain** that still has questions.

They **cannot** choose their question or difficulty.

The questions and difficulty progress **automatically** per domain.

## Expiry

Once a question has been played by a team and the outcome was either correct or wrong, the question is **not reused in that Play**.

It does **not** expire from the library or from the Game tab recipe. Day 2 a new Play of the same recipe can use the exact same questions.

Read with [13-play-restart-replay.md](13-play-restart-replay.md).

## Keeping the turn

A team’s turn is available until they answer **wrong**.

If they answer **correct**:

- they keep the turn
- they can continue with the same domain, if that domain still has questions
- or they can choose another domain

There can be examples where a team never answers wrong and they continue with their turn as long as there are questions. They can finish the game. That is why the engine accepts settings (for example a cap on consecutive correct turns). Those settings are in [06-game-settings.md](06-game-settings.md).

## When the game finishes

A game finishes when there are no more questions in any domain.

The game accepts **ties** between any team place.

## Walked example from the notes

Teams in order: Team 1, Team 2, Team 3

Domains:

- History — [q1, 10], [q2, 20], [q3, 30]
- Geography — [q1, 10], [q2, 20], [q3, 30]

Play:

1. Team 1 chooses History. q1 is played. Correct. q1 is never played again in the current game. Team 1 continues.
2. Team 1 can change domain, but continues in History. q2 is played. Wrong. q2 is never played again in the current game.
3. Team 2 is next. Available domains: History and Geography. They choose History. q3 is played. Wrong. q3 is never played again in the current game.
4. Team 3 is next. Available domain: Geography. They choose Geography. q1 is played. Correct. Team 3 can choose to change domain.
5. And so on. The game ends when there are no more questions.

## What this file does not own

How points are calculated, Control overrides, Stage look, or library CRUD.

## Depends on

- [06-game-settings.md](06-game-settings.md) — scoring mode, consecutive-turn cap, bonus
- [07-libraries-and-metadata.md](07-libraries-and-metadata.md) — teams, domains, questions that were added to the Game

## Talks to

- [04-layered-engines.md](04-layered-engines.md) — Question, Domain, Teams, Award
- [10-stage-screens.md](10-stage-screens.md) — which Screen matches which moment
- [12-control-tab.md](12-control-tab.md) — operator can change who has the turn
- [13-play-restart-replay.md](13-play-restart-replay.md) — what “current game” means

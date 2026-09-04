# 02 — Platform, files, and health

## This file owns

How the app lives on a computer: Windows and Mac, displays, install and uninstall, file places, background health, offline.

## Operating systems

The app needs to integrate with **Windows** and **Mac OS** correctly.

## Real data from the computer

The app has to use real data. Examples:

- Know from the OS when an external display is connected to the device the app is on
- Know real permissions

Many of these do not have to be shown on screen. The engines of the app handle them in the background.

If there are errors the user of the app needs to know about, surface them as **errors** or **warnings**, together with **suggestions**.

## Install, processes, uninstall

The app has to respect how to install and how to uninstall.

It has to respect how to create processes that can be seen in Task Manager on Windows and in the matching place on Mac OS.

Most of this may be done by **Tauri 2** when everything is packaged. The spec does not ask to rebuild that by hand.

The uninstallation screen has to provide options to:

- delete app files
- and / or delete generated user files

## Paths and stored files

The app has to respect paths of installation.

The app has to respect where to store all of the files once the user starts to use the app.

User content (teams, questions, games, screen modifications, plays, statistics) lives in the user-files place, not mixed into the install place without a rule.

## Health in the background

The app has to have engines that handle the **health of the app in the background**.

No surfacing until there is an error, a warning, or necessary info.

No memory leaks.

## Atomic

Changes that belong together must complete together. The notes mark this as **Atomic**.

Example of the idea: saving a Game with its teams, domains, and settings should not leave a half-saved Game if something fails.

## Offline first

No need for internet now. The app works offline.

## License and repo (context only)

Full-stack monorepo managed by git. Opensource, license GNU v3 and so on.

**The app does not need to hassle with these.** This is context for people building it, not a screen the operator must manage.

## What this file does not own

Game rules, UI tabs, animations, or which engine talks to which engine.

## Depends on

- [01-product-context.md](01-product-context.md) — recorded show needs a real secondary display
- [03-stack.md](03-stack.md) — Tauri 2 packaging

## Talks to

- [04-layered-engines.md](04-layered-engines.md) — Health engine, Display / OS engine, files engine
- [08-app-studio.md](08-app-studio.md) — Installation screen, First time setup
- [12-control-tab.md](12-control-tab.md) — Stage target: External Display 1, 2, 3
- [15-state.md](15-state.md) — health warnings must update the Status bar

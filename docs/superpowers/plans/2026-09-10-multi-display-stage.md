# P11.11 — Stage on several displays at once: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator show the identical Stage picture on two or more displays at once — a software HDMI splitter.

**Architecture:** One **pacer** (the existing webview labelled `stage`) plus N **mirrors** (`stage-2`, `stage-3`, … created with `?mirror` on the URL). Mirrors receive the same emissions and render the same tree; they differ in exactly two ways — they make no sound and they do not acknowledge overlay animations, so `PresentationService` stays a single writer of the overlay queue.

**Tech Stack:** Rust (Tauri 2, serde), TypeScript/React 19, vitest, cargo test.

**Spec:** `docs/superpowers/specs/2026-09-10-multi-display-stage-design.md`

## Global Constraints

- **The host never picks a display** (§9). Every display a Stage stands on was chosen by the operator; a remembered one that reappears is taken, nothing else.
- **Nothing on the monitor path may reach a Play.** Unplugging a display moves or closes a window and raises a notice; the Play keeps playing.
- **Never touch a window or the display list while the host lock is held.** `state::assert_unlocked` panics in dev if you do. `windows::refresh` reads the OS, decides under one short lock, then acts — keep that shape.
- **`guard::allow` is the §5.7 boundary.** A Stage label may call `STAGE_COMMANDS` and nothing else. Keep the list identical to `packages/contract`.
- **Vocabulary** (`docs/v1/03_CONTEXT.md`): Play, Recipe, Stage, Studio, Viewer, Screen. A mirror is a *Stage display*, never a "clone" or "duplicate".
- **Deviation from the spec, agreed before implementation:** the spec proposed replacing `control.stage_monitor_id: Option<String>` with `stage_monitor_ids: Vec<String>`. This plan **adds `control.stage_mirror_ids: Vec<String>` beside it** instead. `stage_monitor_id` keeps its exact meaning — where the pacer goes — so there is no settings migration, `stage_set_monitor` is untouched, and every existing `monitor.rs` test keeps passing unchanged rather than becoming a one-element case. Same behaviour, far smaller blast radius. Everything else in the spec stands.

---

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `crates/host/tests/stage_mirrors.rs` | The mirror rules, against `StageDisplay` |

**Modified**

| File | Change |
| --- | --- |
| `crates/host/src/flags.rs` | `ControlSettings.stage_mirror_ids`, `GlobalSetting::StageMirrorIds` |
| `crates/host/src/monitor.rs` | `StageDisplay` tracks mirrors; `add_mirror`, `remove_mirror`, `mirrors`, `wanted_mirrors` |
| `crates/app/src/guard.rs` | `is_stage_label`; `allow` accepts any Stage label |
| `crates/app/src/emit.rs` | emit to every live Stage label |
| `crates/app/src/windows.rs` | `stage_labels`, `mirror_label`, `reconcile_mirrors`; `refresh` reconciles |
| `crates/app/src/commands/presentation.rs` | `stage_add_mirror`, `stage_remove_mirror`; ack only from the pacer |
| `crates/app/src/lib.rs` | register the two new commands |
| `packages/contract/src/commands.ts` | the two command names; `MonitorsChanged.stageMirrors` |
| `apps/stage/src/host/host.ts` | `isMirrorMode`; a mirror's `animComplete` is a no-op |
| `apps/stage/src/App.tsx` | a mirror mounts `silentAudio` |
| `apps/studio/src/host/types.ts` | `stage_mirror_ids`, the new commands |
| `apps/studio/src/host/fake.ts` | the same, in the in-memory host |
| `apps/studio/src/molecules/MonitorCard.tsx` | `mirror` state and a Remove action |
| `apps/studio/src/organisms/MonitorsSettings.tsx` | per-card toggle |
| `apps/studio/src/organisms/ControlTopBar.tsx` | the picker reports the count |
| `apps/studio/src/copy/settings.ts`, `copy/index.ts` | new strings |

---

## Task 1: The `stage.mirror_ids` setting

**Files:**
- Modify: `crates/host/src/flags.rs`
- Test: `crates/host/tests/flag_service.rs`

**Interfaces:**
- Produces: `ControlSettings.stage_mirror_ids: Vec<String>`; `GlobalSetting::StageMirrorIds(Vec<String>)` whose `key()` is `"stage.mirror_ids"`.

- [ ] **Step 1: Write the failing test**

Append to `crates/host/tests/flag_service.rs`:

```rust
/// P11.11. Mirrors are remembered beside the pacer's display, not instead of
/// it: `stage_monitor_id` keeps meaning "where the pacer goes", so a settings
/// document written by an older build reads back with no mirrors and behaves
/// exactly as it did.
#[test]
fn mirror_displays_are_remembered_and_default_to_none() {
    let mut flags = FlagService::new();
    assert!(
        flags.control().stage_mirror_ids.is_empty(),
        "a fresh install mirrors nowhere"
    );

    flags
        .settings_set_global(GlobalSetting::StageMirrorIds(vec![
            "\\\\.\\DISPLAY3@1920x1080".to_owned(),
        ]))
        .expect("a mirror list is a control-behaviour write");
    assert_eq!(
        flags.control().stage_mirror_ids,
        vec!["\\\\.\\DISPLAY3@1920x1080".to_owned()]
    );
    assert_eq!(
        GlobalSetting::StageMirrorIds(Vec::new()).key(),
        "stage.mirror_ids"
    );
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cargo test --manifest-path crates/host/Cargo.toml --test flag_service mirror_displays`
Expected: FAIL — `no variant named StageMirrorIds`.

- [ ] **Step 3: Add the field and the variant**

In `crates/host/src/flags.rs`, inside `pub struct ControlSettings`, directly after `stage_monitor_id`:

```rust
    /// The displays that mirror the pacer, by OS monitor key (§9, P11.11).
    ///
    /// Beside `stage_monitor_id`, not instead of it: that field keeps meaning
    /// "where the pacer goes", so an older settings document reads back with
    /// no mirrors and behaves exactly as it did. Empty is the default and the
    /// whole of today's behaviour.
    #[serde(default)]
    pub stage_mirror_ids: Vec<String>,
```

Add to the `GlobalSetting` enum, after `StageMonitorId`:

```rust
    StageMirrorIds(Vec<String>),
```

Add to the `key()` match, after the `StageMonitorId` arm:

```rust
            GlobalSetting::StageMirrorIds(_) => "stage.mirror_ids",
```

Add to the apply match, after the `StageMonitorId` arm:

```rust
            GlobalSetting::StageMirrorIds(v) => {
                globals.control.stage_mirror_ids.clone_from(&v);
                control.stage_mirror_ids = v;
            }
```

- [ ] **Step 4: Run the whole host suite**

Run: `npm run test:host`
Expected: PASS, including every existing `flag_service` test.

- [ ] **Step 5: Clippy, then commit**

```bash
npm run lint:host
git add crates/host/src/flags.rs crates/host/tests/flag_service.rs
git commit -m "P11.11: remember which displays mirror Stage"
```

---

## Task 2: `StageDisplay` tracks mirrors

**Files:**
- Modify: `crates/host/src/monitor.rs`
- Test: `crates/host/tests/stage_mirrors.rs` (create)

**Interfaces:**
- Consumes: `MonitorKey`, `MonitorInfo`, `MonitorError`, `StageDisplay` from Task 0 (existing).
- Produces:
  - `StageDisplay::add_mirror(&mut self, key: MonitorKey) -> Result<Vec<MonitorKey>, MonitorError>` — the new wanted list.
  - `StageDisplay::remove_mirror(&mut self, key: &MonitorKey) -> Vec<MonitorKey>` — the new wanted list.
  - `StageDisplay::set_wanted_mirrors(&mut self, wanted: Vec<MonitorKey>)`
  - `StageDisplay::live_mirrors(&self) -> Vec<MonitorKey>` — the wanted mirrors that are connected **and** are not the pacer's display, in order. **This is the whole contract with the app crate: the host says which displays should carry a mirror right now, and the app crate makes the windows match. Declarative and idempotent — no open/close diff to get wrong.**

- [ ] **Step 1: Write the failing test**

Create `crates/host/tests/stage_mirrors.rs`:

```rust
//! P11.11: several displays showing the same Stage.
//!
//! `StageDisplay` answers one question for the app crate — **which connected
//! displays should carry a mirror right now** — and the app crate makes the
//! windows match. Declarative rather than a diff: reconciling to a set cannot
//! drift, and a missed open/close cannot leave a window on a dead display.

use questiongame_host::{MonitorInfo, MonitorKey, StageDisplay, StageReattach};

fn monitor(name: &str, primary: bool, size: (u32, u32)) -> MonitorInfo {
    MonitorInfo {
        key: MonitorKey::derive(Some(name), size.0, size.1),
        name: Some(name.to_owned()),
        primary,
        position: (0, 0),
        size,
        physical_size: size,
        scale_factor: 1.0,
    }
}

fn key(name: &str, size: (u32, u32)) -> MonitorKey {
    MonitorKey::derive(Some(name), size.0, size.1)
}

/// The operator's desk: a laptop and two audience displays.
fn desk() -> Vec<MonitorInfo> {
    vec![
        monitor("built-in", true, (1920, 1080)),
        monitor("tv-left", false, (1366, 768)),
        monitor("tv-right", false, (1920, 1080)),
    ]
}

fn loaded() -> StageDisplay {
    let mut display = StageDisplay::new();
    display.monitors_changed(desk(), None, StageReattach::default(), false);
    display
}

#[test]
fn a_fresh_display_mirrors_nowhere() {
    assert!(loaded().live_mirrors().is_empty());
}

#[test]
fn a_mirror_is_added_and_removed_by_key() {
    let mut display = loaded();
    let left = key("tv-left", (1366, 768));

    let wanted = display.add_mirror(left.clone()).expect("connected");
    assert_eq!(wanted, vec![left.clone()]);
    assert_eq!(display.live_mirrors(), vec![left.clone()]);

    let wanted = display.remove_mirror(&left);
    assert!(wanted.is_empty());
    assert!(display.live_mirrors().is_empty());
}

#[test]
fn two_mirrors_keep_the_order_they_were_added_in() {
    let mut display = loaded();
    let left = key("tv-left", (1366, 768));
    let right = key("tv-right", (1920, 1080));
    display.add_mirror(right.clone()).unwrap();
    display.add_mirror(left.clone()).unwrap();
    assert_eq!(display.live_mirrors(), vec![right, left]);
}

#[test]
fn a_display_that_is_not_connected_is_refused() {
    let mut display = loaded();
    assert!(display.add_mirror(key("projector", (1024, 768))).is_err());
    assert!(display.live_mirrors().is_empty(), "and nothing is remembered");
}

#[test]
fn the_pacers_own_display_cannot_also_mirror() {
    let mut display = loaded();
    let left = key("tv-left", (1366, 768));
    display.set_monitor(Some(left.clone())).unwrap();
    assert!(
        display.add_mirror(left).is_err(),
        "one pane per display, or two windows fight over one screen"
    );
}

#[test]
fn the_same_display_twice_is_refused() {
    let mut display = loaded();
    let left = key("tv-left", (1366, 768));
    display.add_mirror(left.clone()).unwrap();
    assert!(display.add_mirror(left).is_err());
}

/// §9 preserved, per pane: unplugging a mirror's display takes that mirror
/// away and leaves everything else alone. Nothing here can reach a Play.
#[test]
fn unplugging_a_mirrors_display_drops_only_that_mirror() {
    let mut display = loaded();
    let left = key("tv-left", (1366, 768));
    let right = key("tv-right", (1920, 1080));
    display.add_mirror(left.clone()).unwrap();
    display.add_mirror(right.clone()).unwrap();

    let without_left = vec![
        monitor("built-in", true, (1920, 1080)),
        monitor("tv-right", false, (1920, 1080)),
    ];
    display.monitors_changed(without_left, None, StageReattach::default(), true);
    assert_eq!(display.live_mirrors(), vec![right.clone()]);

    // And it comes back when the cable does — the pick was remembered.
    display.monitors_changed(desk(), None, StageReattach::default(), true);
    assert_eq!(display.live_mirrors(), vec![left, right]);
}

/// Sending the pacer to a display that is mirroring takes the mirror off it:
/// the operator asked for Stage there, and one pane per display is the rule.
#[test]
fn sending_the_pacer_to_a_mirrored_display_retires_that_mirror() {
    let mut display = loaded();
    let left = key("tv-left", (1366, 768));
    let right = key("tv-right", (1920, 1080));
    display.add_mirror(left.clone()).unwrap();
    display.add_mirror(right.clone()).unwrap();

    display.set_monitor(Some(left)).unwrap();
    assert_eq!(display.live_mirrors(), vec![right]);
}

/// The wanted list survives a settings load, so `live_mirrors` is a function
/// of (wanted, connected, pacer) and nothing else.
#[test]
fn a_remembered_list_is_restored_wholesale() {
    let mut display = loaded();
    let left = key("tv-left", (1366, 768));
    display.set_wanted_mirrors(vec![left.clone(), key("gone", (800, 600))]);
    assert_eq!(
        display.live_mirrors(),
        vec![left],
        "a remembered display that is not here yet is waited for, not dropped"
    );
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cargo test --manifest-path crates/host/Cargo.toml --test stage_mirrors`
Expected: FAIL — `no method named add_mirror`.

- [ ] **Step 3: Implement**

In `crates/host/src/monitor.rs`, add the field to `StageDisplay`:

```rust
pub struct StageDisplay {
    monitors: Vec<MonitorInfo>,
    /// Where the pacer is. `None` is primary — including "primary because the
    /// remembered display is unplugged".
    on: Option<MonitorKey>,
    /// The displays the operator asked to mirror the pacer, in the order they
    /// were asked for (§9, P11.11). Remembered whether or not they are
    /// connected: a cable coming back should restore the mirror, exactly as it
    /// restores the pacer.
    wanted_mirrors: Vec<MonitorKey>,
}
```

Add the methods inside `impl StageDisplay`:

```rust
    /// The mirrors the operator has asked for, connected or not.
    pub fn wanted_mirrors(&self) -> &[MonitorKey] {
        &self.wanted_mirrors
    }

    /// Replace the wanted list — what a settings load does.
    pub fn set_wanted_mirrors(&mut self, wanted: Vec<MonitorKey>) {
        self.wanted_mirrors = wanted;
    }

    /// **Which connected displays should carry a mirror right now.**
    ///
    /// The whole contract with the app crate: the host answers this, and the
    /// app crate makes the windows match. Declarative rather than a diff of
    /// opens and closes — reconciling to a set cannot drift, and a missed
    /// close cannot leave a window on a display that is gone.
    ///
    /// A display that is not connected is skipped, not forgotten: the pick is
    /// remembered so the cable coming back restores the mirror.
    pub fn live_mirrors(&self) -> Vec<MonitorKey> {
        self.wanted_mirrors
            .iter()
            .filter(|key| self.on.as_ref() != Some(*key))
            .filter(|key| self.monitors.iter().any(|m| m.matches(key)))
            .cloned()
            .collect()
    }

    /// Ask for another mirror. Refuses for the same reasons `set_monitor`
    /// does, plus the two that are particular to a second pane.
    pub fn add_mirror(&mut self, key: MonitorKey) -> Result<Vec<MonitorKey>, MonitorError> {
        match self.monitors.iter().filter(|m| m.matches(&key)).count() {
            0 => return Err(MonitorError::NotConnected(key)),
            1 => {}
            _ => return Err(MonitorError::Ambiguous(key)),
        }
        if self.on.as_ref() == Some(&key) || self.wanted_mirrors.contains(&key) {
            // One pane per display: two Stage windows on one screen is two
            // windows fighting over it, and the operator sees whichever won.
            return Err(MonitorError::AlreadyShowingStage(key));
        }
        self.wanted_mirrors.push(key);
        Ok(self.wanted_mirrors.clone())
    }

    /// Stop mirroring on a display. Removing one that is not there is not an
    /// error — the operator's intent is already true.
    pub fn remove_mirror(&mut self, key: &MonitorKey) -> Vec<MonitorKey> {
        self.wanted_mirrors.retain(|k| k != key);
        self.wanted_mirrors.clone()
    }
```

In `set_monitor`, after `self.on = key.clone();`, take the mirror off the display the pacer just claimed:

```rust
        // One pane per display. The operator asked for the pacer here, so the
        // mirror that was here stands down rather than fighting for the screen.
        if let Some(key) = &key {
            self.wanted_mirrors.retain(|k| k != key);
        }
```

Add the error variant to `MonitorError`:

```rust
    #[error("{0} is already showing Stage")]
    AlreadyShowingStage(MonitorKey),
```

- [ ] **Step 4: Run and confirm green**

Run: `cargo test --manifest-path crates/host/Cargo.toml --test stage_mirrors && npm run test:host`
Expected: PASS, and **every existing `monitor.rs` test still passes untouched** — that is the check that single-display behaviour did not move.

- [ ] **Step 5: Clippy, then commit**

```bash
npm run lint:host
git add crates/host/src/monitor.rs crates/host/tests/stage_mirrors.rs
git commit -m "P11.11: StageDisplay says which displays carry a mirror"
```

---

## Task 3: Any Stage label passes the guard

**Files:**
- Modify: `crates/app/src/guard.rs`

**Interfaces:**
- Produces: `guard::is_stage_label(label: &str) -> bool`.

- [ ] **Step 1: Write the failing test**

Append inside the existing `mod tests` in `crates/app/src/guard.rs`:

```rust
    /// P11.11: a mirror is a Stage window and is held to a Stage window's
    /// list. It may say what it did to itself and nothing else.
    #[test]
    fn a_mirror_label_is_a_stage_label() {
        assert!(is_stage_label(STAGE));
        assert!(is_stage_label("stage-2"));
        assert!(is_stage_label("stage-17"));
        assert!(!is_stage_label(MAIN));
        assert!(!is_stage_label(STATS));

        assert!(allow("stage-2", "stage_ready").is_ok());
        assert!(allow("stage-2", "client_log").is_ok());
        assert!(
            allow("stage-2", "lock_selection").is_err(),
            "a mirror is a projection, not a controller (§5.7)"
        );
    }
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cargo test -p questiongame-app --lib guard`
Expected: FAIL — `cannot find function is_stage_label`.

- [ ] **Step 3: Implement**

In `crates/app/src/guard.rs`, after the label constants:

```rust
/// Is this one of the Stage windows?
///
/// `stage` is the pacer and `stage-2`, `stage-3`, … are its mirrors (§9,
/// P11.11). Used both here and by `emit`, so "which windows are Stage" is
/// answered in one place — a mirror that the guard admitted but the emission
/// loop skipped would be a black screen on an audience display.
pub fn is_stage_label(label: &str) -> bool {
    label == STAGE || label.strip_prefix("stage-").is_some_and(|n| !n.is_empty())
}
```

Then in `allow`, replace the `label == STAGE` comparison with `is_stage_label(label)`. Leave the "unknown label is treated as Stage" default exactly as it is — it fails safe.

- [ ] **Step 4: Run and confirm**

Run: `cargo test -p questiongame-app --lib guard && npm run lint:app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/app/src/guard.rs
git commit -m "P11.11: a mirror is a Stage label"
```

---

## Task 4: Emit to every Stage window

**Files:**
- Modify: `crates/app/src/emit.rs`

**Interfaces:**
- Consumes: `guard::is_stage_label` (Task 3).
- Produces: `emit::stage_labels(app: &AppHandle) -> Vec<String>`.

- [ ] **Step 1: Write the failing test**

Append inside `mod tests` in `crates/app/src/emit.rs` (create the module if there is none):

```rust
#[cfg(test)]
mod tests {
    use crate::guard::is_stage_label;

    /// P11.11. The emission loop and the guard must agree on what a Stage
    /// window is: one admitted by the guard but skipped by the loop is a
    /// black screen on an audience display.
    #[test]
    fn every_label_the_guard_calls_stage_is_a_label_we_emit_to() {
        for label in ["stage", "stage-2", "stage-3"] {
            assert!(is_stage_label(label));
        }
        for label in ["main", "stats"] {
            assert!(!is_stage_label(label));
        }
    }
}
```

- [ ] **Step 2: Run it**

Run: `cargo test -p questiongame-app --lib emit`
Expected: PASS (it pins the shared predicate; the behaviour change is next).

- [ ] **Step 3: Implement the loop**

In `crates/app/src/emit.rs`, add near the top:

```rust
/// Every Stage window that exists right now — the pacer and its mirrors.
///
/// Read from the window map rather than from settings: a mirror whose display
/// was just unplugged is gone from here the moment its window closes, and an
/// emission to a label with no window is silently dropped by Tauri anyway.
fn stage_labels(app: &AppHandle) -> Vec<String> {
    app.webview_windows()
        .keys()
        .filter(|label| crate::guard::is_stage_label(label))
        .cloned()
        .collect()
}
```

In `play_state`, replace `let _ = app.emit_to(STAGE, "play-state", &stage);` with:

```rust
    for label in stage_labels(app) {
        let _ = app.emit_to(label, "play-state", &stage);
    }
```

In `play_tick`, replace `let _ = app.emit_to(STAGE, "play-tick", &tick);` with:

```rust
    for label in stage_labels(app) {
        let _ = app.emit_to(label, "play-tick", &tick);
    }
```

`emit_bytes` counts one Stage payload regardless of how many windows receive it; leave it, and note why in a comment: the JSON is serialised once by Tauri per `emit_to`, but the *content* on the wire is what the number is for.

- [ ] **Step 4: Run and confirm**

Run: `npm run test:app && npm run lint:app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/app/src/emit.rs
git commit -m "P11.11: emit to every Stage window"
```

---

## Task 5: Create, place and retire the mirror windows

**Files:**
- Modify: `crates/app/src/windows.rs`

**Interfaces:**
- Consumes: `StageDisplay::live_mirrors` (Task 2), `guard::is_stage_label` (Task 3).
- Produces:
  - `windows::mirror_label(index: usize) -> String` — `"stage-2"` for index 0.
  - `windows::reconcile_mirrors(app: &AppHandle, wanted: &[MonitorKey]) -> AppResult<()>`.

- [ ] **Step 1: Write the failing test**

Append inside `mod tests` in `crates/app/src/windows.rs`:

```rust
    /// P11.11: mirror labels are positional and start at 2, so the pacer keeps
    /// the bare `stage` label that `emit`, `guard` and every doc name.
    #[test]
    fn mirror_labels_start_after_the_pacer() {
        assert_eq!(mirror_label(0), "stage-2");
        assert_eq!(mirror_label(1), "stage-3");
        assert!(crate::guard::is_stage_label(&mirror_label(0)));
        assert_ne!(mirror_label(0), crate::guard::STAGE);
    }
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cargo test -p questiongame-app --lib windows`
Expected: FAIL — `cannot find function mirror_label`.

- [ ] **Step 3: Implement**

In `crates/app/src/windows.rs`, add:

```rust
/// Studio again, told by its query string to render Statistics alone.
/// (existing constant above)

/// A mirror of the Stage window: the same bundle, told it is a mirror.
///
/// `?mirror` rather than reading the label at runtime, the way `?viewer`
/// already works: a webview knows what it is **synchronously**, on the first
/// render, with no async label fetch to sequence against mounting the audio.
const MIRROR_PATH: &str = "stage/index.html?mirror";

/// Positional, starting at 2, so the pacer keeps the bare `stage` label that
/// `emit`, `guard`, `capabilities` and every doc name.
pub fn mirror_label(index: usize) -> String {
    format!("stage-{}", index + 2)
}

/// Make the mirror windows match `wanted`, which is
/// [`StageDisplay::live_mirrors`] — the connected displays that should carry
/// one right now.
///
/// Idempotent by construction: it opens what is missing, moves what is in the
/// wrong place, and closes anything past the end of the list. Calling it twice
/// changes nothing the second time, which is what lets the monitor watch call
/// it on every display change without tracking what it did last time.
///
/// **The caller must not hold the host lock.** Building and moving a webview
/// pumps the Windows message loop, and that dispatches whatever IPC the new
/// window has queued — with the lock held, that is a wait on ourselves
/// (`state::assert_unlocked`, 2026-09-08).
pub fn reconcile_mirrors(app: &AppHandle, wanted: &[MonitorKey]) -> AppResult<()> {
    crate::state::assert_unlocked("windows::reconcile_mirrors");

    for (index, key) in wanted.iter().enumerate() {
        let label = mirror_label(index);
        let window = match app.get_webview_window(&label) {
            Some(existing) => existing,
            None => debuggable(
                WebviewWindowBuilder::new(app, &label, WebviewUrl::App(MIRROR_PATH.into()))
                    .title("questiongame Stage")
                    .decorations(false)
                    .fullscreen(true)
                    // Nobody clicks a mirror either; a focus steal mid-question
                    // is a lost lock.
                    .focused(false),
            )
            .build()?,
        };
        move_to(app, &window, Some(key))?;
    }

    // Anything past the end of the list is a mirror the operator removed, or
    // one whose display went away.
    let mut index = wanted.len();
    while let Some(extra) = app.get_webview_window(&mirror_label(index)) {
        extra.close()?;
        index += 1;
    }
    Ok(())
}
```

In `refresh`, read the wanted mirrors under the same short lock that already reads `stage_monitor_id`:

```rust
    let (mv, mirrors, stats_monitor_id, stats_fullscreen) = {
        let mut host = state.lock();
        let control = host.flags.control();
        let wanted = control.stage_monitor_id.clone().map(MonitorKey::new);
        let wanted_mirrors: Vec<MonitorKey> = control
            .stage_mirror_ids
            .iter()
            .cloned()
            .map(MonitorKey::new)
            .collect();
        let reattach = control.stage_reattach;
        let stats_monitor_id = control.stats_monitor_id.clone();
        let stats_fullscreen = control.stats_fullscreen;
        let play_is_open = host.runtime().play_is_open();
        host.display.set_wanted_mirrors(wanted_mirrors);
        let mv =
            host.display
                .monitors_changed(list.clone(), wanted.as_ref(), reattach, play_is_open);
        let mirrors = host.display.live_mirrors();
        (mv, mirrors, stats_monitor_id, stats_fullscreen)
    };

    apply(app, &mv)?;
    reconcile_mirrors(app, &mirrors)?;
```

- [ ] **Step 4: Run and confirm**

Run: `npm run test:app && npm run lint:app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/app/src/windows.rs
git commit -m "P11.11: open, place and retire the mirror windows"
```

---

## Task 6: The two commands, and the ack only from the pacer

**Files:**
- Modify: `crates/app/src/commands/presentation.rs`, `crates/app/src/lib.rs`
- Test: `crates/app/tests/host_wiring.rs`

**Interfaces:**
- Consumes: `StageDisplay::add_mirror` / `remove_mirror` (Task 2), `windows::reconcile_mirrors` (Task 5).
- Produces: commands `stage_add_mirror { monitorId }`, `stage_remove_mirror { monitorId }`.

- [ ] **Step 1: Write the failing test**

Append to `crates/app/tests/host_wiring.rs`:

```rust
/// P11.11: only the pacer's ack advances the overlay queue.
///
/// The queue advances on an ack and never on a clock (§2.6). With several
/// Stage windows there are several acks for one animation, so exactly one
/// window is in charge — otherwise the second ack retires an overlay the
/// operator has not seen finish, or promotes a pending one twice.
#[test]
fn only_the_pacer_may_acknowledge_an_animation() {
    assert!(questiongame_app::guard::allow("stage", "overlay_ack_complete").is_ok());
    assert!(
        questiongame_app::guard::allow("stage-2", "overlay_ack_complete").is_ok(),
        "the guard lets it through: the refusal is the command's, and it is silent"
    );
    assert!(questiongame_app::guard::is_stage_label("stage-2"));
}
```

- [ ] **Step 2: Run it**

Run: `cargo test -p questiongame-app --test host_wiring only_the_pacer`
Expected: PASS once `is_stage_label` is public (Task 3). If it fails to compile, make `guard` and its items `pub` as the other tests need.

- [ ] **Step 3: Drop a mirror's ack**

In `crates/app/src/commands/presentation.rs`, at the top of `overlay_ack_complete`, after `guard::allow(...)`:

```rust
    // **Only the pacer's ack advances the queue** (P11.11). Every Stage window
    // plays the same timeline and reports it, so a mirror's ack would retire
    // an overlay a second time — and promote the pending one twice. Dropped
    // rather than refused: the mirror is behaving correctly, and a notice for
    // it would be noise during a show. Belt to the webview's braces, which
    // does not send one either.
    if window.label() != guard::STAGE {
        return Ok(());
    }
```

- [ ] **Step 4: Add the commands**

In the same file:

```rust
/// Mirror the pacer on another display (§9, P11.11).
#[tauri::command(async)]
pub fn stage_add_mirror(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    monitor_id: String,
) -> AppResult<()> {
    guard::allow(window.label(), "stage_add_mirror")?;
    // Refresh first: the picker may be seconds stale, and mirroring onto a
    // display that just left should say so rather than remember a wish.
    windows::refresh(&app, &state)?;

    // The decision under the lock; the windows after it. Building a webview
    // pumps the message loop, and with the lock held that is a wait on
    // ourselves (`state::assert_unlocked`).
    let mirrors = {
        let mut host = state.lock();
        host.display.add_mirror(MonitorKey::new(monitor_id))?;
        host.display.live_mirrors()
    };
    windows::reconcile_mirrors(&app, &mirrors)?;
    remember_mirrors(&app, &state)?;
    Ok(())
}

/// Stop mirroring on a display. Removing one that is not mirroring is not an
/// error: the operator's intent is already true.
#[tauri::command(async)]
pub fn stage_remove_mirror(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    monitor_id: String,
) -> AppResult<()> {
    guard::allow(window.label(), "stage_remove_mirror")?;
    let mirrors = {
        let mut host = state.lock();
        host.display.remove_mirror(&MonitorKey::new(monitor_id));
        host.display.live_mirrors()
    };
    windows::reconcile_mirrors(&app, &mirrors)?;
    remember_mirrors(&app, &state)?;
    Ok(())
}

/// Persist the wanted list and tell Studio, so a mirror survives a restart the
/// way the pacer's display does.
fn remember_mirrors(app: &AppHandle, state: &State<'_, AppState>) -> AppResult<()> {
    let stats_open = windows::stats_is_open(app);
    let mut host = state.lock();
    let ids: Vec<String> = host
        .display
        .wanted_mirrors()
        .iter()
        .map(|k| k.as_str().to_owned())
        .collect();
    host.flags
        .settings_set_global(questiongame_host::flags::GlobalSetting::StageMirrorIds(ids))?;
    crate::emit::monitors_changed(app, &host, stats_open);
    Ok(())
}
```

Register both in `crates/app/src/lib.rs`'s `generate_handler!` list, next to `stage_set_monitor`.

Add both to `guard::STAGE_COMMANDS`? **No** — they are Studio's, like `stage_set_monitor`, so they need no entry; `allow` admits `main` for anything not on the Stage or Stats lists. Verify by running the guard tests.

- [ ] **Step 5: Run everything, then commit**

```bash
npm run test:app && npm run lint:app
git add crates/app/src/commands/presentation.rs crates/app/src/lib.rs crates/app/tests/host_wiring.rs
git commit -m "P11.11: add and remove a mirror; only the pacer acks"
```

---

## Task 7: A mirror is silent and says nothing

**Files:**
- Modify: `apps/stage/src/host/host.ts`, `apps/stage/src/App.tsx`
- Test: `apps/stage/src/host/mirror.test.tsx` (create)

**Interfaces:**
- Produces: `isMirrorMode(): boolean` from `@/host/host`.

- [ ] **Step 1: Write the failing test**

Create `apps/stage/src/host/mirror.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { isMirrorMode } from './host'

/**
 * P11.11. A mirror is the same bundle fed the same emission, and differs in
 * exactly two behaviours: it makes no sound, and it does not acknowledge an
 * animation. Both are load-bearing — three windows playing every cue is a
 * flam, and a second ack advances the overlay queue twice.
 */
const setSearch = (search: string) => {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search },
    configurable: true,
  })
}

afterEach(() => {
  setSearch('')
  vi.restoreAllMocks()
  cleanup()
})

describe('mirror mode', () => {
  it('is decided by the URL, synchronously', () => {
    setSearch('')
    expect(isMirrorMode()).toBe(false)
    setSearch('?mirror')
    expect(isMirrorMode()).toBe(true)
  })

  it('is not the Viewer, which is a different thing again', () => {
    setSearch('?viewer')
    expect(isMirrorMode()).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --project stage apps/stage/src/host/mirror.test.tsx`
Expected: FAIL — `isMirrorMode is not a function`.

- [ ] **Step 3: Implement**

In `apps/stage/src/host/host.ts`, beside `isViewerMode`:

```ts
/**
 * Is this Stage window a mirror (§9, P11.11)?
 *
 * Mirrors show the identical picture on another display — a software HDMI
 * splitter. They differ from the pacer in exactly two behaviours: no audio,
 * and no `anim-complete`. Read from the URL rather than the window label so
 * the answer is available on the **first render**, before the async label
 * fetch resolves — mounting Howler and then unmounting it would load the pack
 * only to throw it away, and P11.8 is about what that reports.
 */
export function isMirrorMode(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mirror')
}
```

In `tauriHost()`'s returned object, make the ack conditional:

```ts
    animComplete(key) {
      // The pacer owns the overlay queue. A mirror plays the same timeline and
      // would report the same key, which would retire the overlay twice.
      if (isMirrorMode()) return
      void call('overlay_ack_complete', { key })
    },
```

In `apps/stage/src/App.tsx`'s `HostFed`, choose the port:

```tsx
  const audio = useMemo(
    () =>
      isMirrorMode()
        ? silentAudio()
        : howlerAudio(host.snapshot().audio.cues, CUE_PACK_BASE, (code, detail) => host.report(code, detail)),
    [host],
  )
```

Import `silentAudio` from `@/audio/port` and `isMirrorMode` from `@/host/host`.

- [ ] **Step 4: Run the Stage suite**

Run: `npx vitest run --project stage && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/stage/src/host/host.ts apps/stage/src/App.tsx apps/stage/src/host/mirror.test.tsx
git commit -m "P11.11: a mirror is silent and does not ack"
```

---

## Task 8: Studio — the contract, the fake, and the two surfaces

**Files:**
- Modify: `packages/contract/src/commands.ts`, `apps/studio/src/host/types.ts`, `apps/studio/src/host/fake.ts`, `apps/studio/src/molecules/MonitorCard.tsx`, `apps/studio/src/organisms/MonitorsSettings.tsx`, `apps/studio/src/organisms/ControlTopBar.tsx`, `apps/studio/src/copy/settings.ts`
- Test: `apps/studio/src/organisms/MonitorsSettings.test.tsx` (create)

**Interfaces:**
- Consumes: commands `stage_add_mirror`, `stage_remove_mirror` (Task 6).
- Produces: `MonitorCardState` gains `'mirror'`; `MonitorsChanged.stageMirrors: readonly string[]`.

- [ ] **Step 1: Write the failing test**

Create `apps/studio/src/organisms/MonitorsSettings.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'

/**
 * P11.11. Two audience displays, one picture. The card is where a display is
 * turned into a Stage display and back.
 */
describe('Settings ▸ Monitors, with several displays', () => {
  let fake: FakeHost

  beforeEach(() => {
    fake = createFakeHost()
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  })
  afterEach(() => setHostTransport(null))

  it('offers a free display as a mirror and reports it once it is one', async () => {
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'monitors' })
    })
    const tv = await screen.findByText('Living-room TV')
    expect(tv).toBeTruthy()

    const send = screen.getAllByRole('button', { name: 'Send Stage here' })
    expect(send.length).toBeGreaterThan(0)
    await act(async () => send[0]!.click())

    expect(
      fake.calls.some((c) => c.name === 'stage_add_mirror' || c.name === 'stage_set_monitor'),
      'the card asks the host, it does not decide',
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --project studio apps/studio/src/organisms/MonitorsSettings.test.tsx`
Expected: FAIL — the fake refuses `stage_add_mirror`.

- [ ] **Step 3: Contract and types**

In `packages/contract/src/commands.ts`, add to the command list beside `stage_set_monitor`:

```ts
  /** Mirror Stage on another display; the pacer keeps its own (§9, P11.11). */
  'stage_add_mirror',
  'stage_remove_mirror',
```

and in `MonitorsChanged`:

```ts
  /**
   * The displays mirroring the pacer right now, in the order they were added.
   * `stageOn` is still the pacer's, so a card knows which of the three it is.
   */
  readonly stageMirrors: readonly string[]
```

In `crates/app/src/emit.rs`'s `MonitorsChanged` struct, add the matching field and fill it from `host.display.live_mirrors()`.

In `apps/studio/src/host/types.ts`, add `readonly stage_mirror_ids: readonly string[]` to `ControlSettings` and the two commands to the `Command` union.

- [ ] **Step 4: The fake host**

In `apps/studio/src/host/fake.ts`, add `stage_mirror_ids: []` to `DEFAULT_CONTROL`, return it from `settings_get`, and handle both commands:

```ts
      case 'stage_add_mirror': {
        const id = a.monitorId as string
        if (control.stage_monitor_id === id || control.stage_mirror_ids.includes(id)) {
          refuse('monitor.already_showing_stage', `${id} is already showing Stage`)
        }
        control = { ...control, stage_mirror_ids: [...control.stage_mirror_ids, id] }
        emit('monitors-changed', monitorsChanged())
        return undefined as T
      }
      case 'stage_remove_mirror': {
        const id = a.monitorId as string
        control = { ...control, stage_mirror_ids: control.stage_mirror_ids.filter((k) => k !== id) }
        emit('monitors-changed', monitorsChanged())
        return undefined as T
      }
```

- [ ] **Step 5: The card**

In `apps/studio/src/molecules/MonitorCard.tsx`, widen the state and add the action:

```tsx
export type MonitorCardState = 'stage' | 'mirror' | 'remembered' | 'free'
```

`mirror` borders like `stage` and carries a `MeaningChip` reading `SETTINGS.monitors.mirror`; its button is `SETTINGS.monitors.removeStage` calling a new `onRemoveStage` prop.

In `apps/studio/src/copy/settings.ts`, beside the existing monitor strings:

```ts
    mirror: 'Mirroring',
    removeStage: 'Remove Stage',
    mirrorHint: 'The same picture as the Stage display. Audio plays on the Stage display only.',
```

In `MonitorsSettings.tsx`, compute the state per card from `stageOn` and `stageMirrors`, and wire `onSendStage` → `stage_add_mirror` when a Stage already stands somewhere else, `stage_set_monitor` when there is none.

- [ ] **Step 6: The picker**

In `ControlTopBar.tsx`, keep `DisplayPicker` bound to the pacer, and put the count beside it:

```tsx
{mirrors.length > 0 ? <MeaningChip meaning="stage">{CONTROL.stageDisplayCount(mirrors.length + 1)}</MeaningChip> : null}
```

with `stageDisplayCount: (n: number) => `${n} displays`` in `copy/index.ts`.

- [ ] **Step 7: Run everything, then commit**

```bash
npm run typecheck && npm run lint && npm test
git add -A
git commit -m "P11.11: choose Stage displays from Settings and Control"
```

---

## Task 9: Docs, and verify on the real displays

**Files:**
- Modify: `CLAUDE.md`, `docs/v1/04_ROADMAP.md`, `docs/v1/05_STUDIO_DESIGN.md`

- [ ] **Step 1: Run the whole suite**

```bash
npm run typecheck && npm run lint && npm test && npm run test:host && npm run test:app && npm run lint:host && npm run lint:app
```

Expected: all green.

- [ ] **Step 2: Write the durable record**

`CLAUDE.md` gains a "Stage on several displays (P11.11)" block under the Stage sections: the pacer/mirror split, the ack rule, the audio rule, `live_mirrors` as the declarative contract, and **that `StageFit` (P11.6) is what makes three different CSS viewports work**.

`docs/v1/04_ROADMAP.md` gains a `## P11.11` section with the exit criteria below.

`docs/v1/05_STUDIO_DESIGN.md` §12.2.1 gains the `mirror` card state.

- [ ] **Step 3: Verify on the operator's own displays**

Run `npm run dev:app`, load a game into Control, then from Settings ▸ Monitors send Stage to `\\.\DISPLAY2` and add `\\.\DISPLAY3` as a mirror. Confirm:

1. Both displays show the identical screen, each correctly fitted (1366×768 and 1280×720 CSS viewports — the P11.6 property).
2. A cue plays **once**, not twice.
3. An overlay animation runs on both and the queue advances once — issue a question, give a token, and watch the Timeline for a single event.
4. Unplugging the mirror's display closes that window and leaves the Play playing.
5. A restart of the app restores both displays.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "P11.11: Stage on several displays at once"
```

---

## Exit criteria

- ☐ Two displays show the identical Stage picture, each fitted to its own CSS viewport.
- ☐ A cue plays once regardless of how many displays are showing.
- ☐ Only the pacer's `overlay_ack_complete` advances the queue; a mirror's is dropped.
- ☐ `stage-2` may call `STAGE_COMMANDS` and nothing else.
- ☐ Unplugging a mirror's display closes that window, warns, and leaves the Play playing; unplugging the pacer's pulls it to primary as before.
- ☐ A mirror is remembered across a restart.
- ☐ Every existing `monitor.rs` test passes unchanged — single-display behaviour did not move.

# P11.11 — Stage on several displays at once

**Status:** design, approved 2026-09-10. Implementation not started.

**Where this ends up:** this file is working material for one phase. When P11.11
ships, the durable record goes where this repo keeps it — a `## P11.11` section
in `docs/v1/04_ROADMAP.md` and the rules a later phase must not undo in
`CLAUDE.md`, per the document precedence in that file. Nothing here overrules
`optimized_first_spec.md`.

---

## 1. The problem

The operator has three displays and no HDMI splitter:

| | resolution | scaling | CSS viewport |
| --- | --- | --- | --- |
| `\\.\DISPLAY1` | 1920×1080 | 100% | 1920×1080 |
| `\\.\DISPLAY2` | 1366×768 | 100% | 1366×768 |
| `\\.\DISPLAY3` | 1920×1080 | 150% | 1280×720 |

Stage can stand on exactly one of them. The audience displays need the **same
picture** on two of them at once. This is a software HDMI splitter, not a
second surface: no display shows anything the others do not.

## 2. What exists today, and what each piece assumes

| Piece | Today | Assumption to break |
| --- | --- | --- |
| `crates/app/src/windows.rs` | `ensure_stage` builds one webview labelled `stage` | one window |
| `crates/app/src/emit.rs` | `app.emit_to(STAGE, …)` | one target label |
| `crates/app/src/guard.rs` | `allow` compares `label == STAGE` | one label |
| `crates/host/src/flags.rs` | `control.stage_monitor_id: Option<String>` | one remembered display |
| `crates/host/src/monitor.rs` | `StageDisplay.on: Option<MonitorKey>` | one pane |
| `crates/host/src/presentation.rs` | `ack_overlay` retires on the first matching key | one acking window |
| `apps/stage/src/App.tsx` | `HostFed` mounts `howlerAudio` | one window making sound |

Two of those are not merely "one" but **load-bearing**: the ack is what makes
`PresentationService` a single writer of the overlay queue, and the audio is
what makes a cue a cue rather than a flam.

## 3. Decisions

### 3.1 One pacer, N mirrors

Stage becomes several webviews:

```text
stage      the pacer. Created on first Control Load, exists until the app
           quits, always the window whose acks count and the only one that
           makes a sound.
stage-2    a mirror. Created when the operator sends Stage to a second
stage-3    display, closed when that display goes away or they remove it.
…
```

A mirror is created with **`?mirror` on its URL**, the way the Viewer already
uses `?viewer`. That makes "am I a mirror" a synchronous URL read in the
webview, with no async label fetch to sequence against the first render.

**The pacer is never promoted or demoted.** If its display is unplugged the
window returns to primary and stays the pacer — §9's behaviour, unchanged. A
mirror is never promoted in its place. *Rationale:* who paces the show must not
be a moving target mid-show, and the alternative buys nothing — the pacer on
primary is still pacing correctly.

### 3.2 The overlay ack: the pacer's, and only the pacer's

`overlay_ack_complete` is **dropped unless the caller is the pacer**. A mirror
does not send one at all (its host adapter drops `animComplete` locally, as
`viewerHost` does), and the command refuses it if one ever arrives.

Considered and rejected:

- *First ack wins.* Cannot stall, but which display is in charge changes moment
  to moment, and a slower display gets cut off mid-animation when the next
  overlay is promoted.
- *Wait for all.* Perfectly in step, but one slow or hung window stalls the
  show. That is a new failure mode during a live event, and it would need a
  timeout — a clock in the presentation path, which §2.6 spent effort removing.

The mirrors stay within a frame or two of the pacer regardless: they receive the
same emission at the same instant and run the same timeline.

### 3.3 Audio: the pacer only

Mirrors mount `silentAudio` — the adapter that already exists for the Viewer.
Three windows playing every cue is a flam, and the OS mixes them to one output
device anyway, so there is nothing to gain.

### 3.4 Everything else is identical

Same bundle, same emission, same tree, same `StageFit`, same decor, same
reveals, same GSAP. A mirror differs in exactly two behaviours (§3.2, §3.3).

## 4. The host

### 4.1 Settings

```text
stage.monitor_id : Option<String>   →   stage.monitor_ids : Vec<String>
```

Ordered. Index 0 is the pacer's remembered display; the rest are mirrors.
`[]` means "pacer on primary, no mirrors", which is today's default, so an
untouched install behaves as it does now.

**Migration:** a stored `stage_monitor_id` of `Some(k)` reads as `[k]`; `None`
reads as `[]`. The settings document is validated whole on every write
(`FlagService`), so the migration belongs in the deserialiser, not in a command.

`GlobalSetting::StageMonitorId(Option<String>)` becomes
`StageMonitorIds(Vec<String>)`. `stage_set_monitor { monitorId }` gains a
sibling rather than changing shape:

```text
stage_set_monitor  { monitorId: string | null }   the pacer's display (unchanged)
stage_add_mirror   { monitorId: string }          add a mirror
stage_remove_mirror{ monitorId: string }          remove one
```

*Rationale for three commands rather than one `set_monitors(list)`:* each is a
single operator act with its own refusal, and a list-setter would have to diff
its argument against the stored list to say which part failed. The multi-select
in §7 knows which entry the operator just toggled, so it calls the one command
that matches; it never posts a whole list.

**Refusals**, all of them leaving the stored list untouched:

| Case | Answer |
| --- | --- |
| the key is not connected | `MonitorError::NotConnected` |
| the key matches two displays | `MonitorError::Ambiguous` |
| `stage_add_mirror` names the pacer's display | refused — one pane per display |
| `stage_add_mirror` names a display already mirroring | refused, same reason |
| `stage_remove_mirror` names the pacer's display | refused — the pacer is *moved* with `stage_set_monitor`, never removed; `stage_set_monitor(null)` parks it on primary |

### 4.2 `monitor.rs`

`StageDisplay` generalises from one pane to a vector:

```rust
on: Option<MonitorKey>        →  on: Vec<Option<MonitorKey>>   // by pane, 0 = pacer
placement(Option<&MonitorKey>) →  placements(&[MonitorKey]) -> Vec<StagePlacement>
monitors_changed(…) -> StageMove →  monitors_changed(…) -> StageMoves
```

`StageMoves` is `{ moves: Vec<PaneMove>, notices: Vec<Notice> }` where a
`PaneMove` is today's `StageMove` plus the pane index and an `Open`/`Close`
variant a mirror needs and the pacer does not.

Every existing test in that module becomes the one-element case, which is the
check that the generalisation did not change single-display behaviour.

**Ambiguity is unchanged.** `MonitorKey` is name + physical resolution, and
Windows and macOS both give distinct names, so two identical panels still
collide only in the case `StagePlacement::Ambiguous` already refuses to guess
at. Nothing about several panes makes that worse.

### 4.3 Unplug, per pane (§9 preserved)

| Event | Pacer | Mirror |
| --- | --- | --- |
| its display disappears | pull to primary, `stage.monitor_lost` warn | close the window, warn |
| its remembered display returns | outside a Play, go; inside, `stage.reattach` decides | same rule |
| its key matches two displays | `stage.monitor_ambiguous`, move nothing | same |

**Nothing on this path can reach a Play**, which is the property `monitor.rs`
already has and must keep.

## 5. The app crate

- **`windows.rs`** — `ensure_stage` becomes `ensure_stage_panes(&[MonitorKey])`:
  creates the pacer if absent, creates or closes mirrors to match the list, and
  places each. `apply` takes `StageMoves`. `refresh` reads
  `control.stage_monitor_ids` instead of the single key, and keeps its current
  shape: **read the OS, decide under one short lock, then act**, because every
  window call pumps the message loop (the 2026-09-08 deadlock).
- **`emit.rs`** — `emit_to(STAGE, …)` becomes a loop over the live Stage labels.
  Cost is negligible after P11.9: a `play-tick` is ~90 bytes, so a third display
  is ~270 bytes a second.
- **`guard.rs`** — `is_stage_label(l)` = `l == "stage" || l.starts_with("stage-")`,
  used by both `allow` and the emission loop. Unknown labels keep defaulting to
  Stage, which is the safe direction.
- **`commands/presentation.rs`** — `overlay_ack_complete` returns early unless
  `window.label() == STAGE`. `stage_report` and `stage_ready` accept any Stage
  label: a mirror built against the wrong contract version is still a mismatch
  worth a health item.

## 6. The Stage webview

- `isMirrorMode()` beside `isViewerMode()`, reading `?mirror`.
- `App.tsx`: `howlerAudio` when not a mirror, `silentAudio` when it is.
- `tauriHost()`: a mirror's `animComplete` is a no-op, with the comment saying
  the pacer owns the queue.

Nothing else in `apps/stage` changes. **`StageFit` (P11.6) is what makes this
work at all** — the three displays are three different CSS viewports, and each
window scales the fixed canvas into its own.

## 7. Studio

- **Settings ▸ Monitors** (`MonitorsSettings`, `MonitorCard`): the card's action
  becomes a toggle — *Send Stage here* on a free display, *Remove Stage* on a
  display showing a mirror. The **pacer's card offers neither**: it is marked
  as the pacer, and the way to move it is the display picker
  (`stage_set_monitor`), which is what that control already does. So the
  operator can never end up with no Stage at all.
- **Control top bar** (`ControlTopBar`, `DisplayPicker`): multi-select, reading
  "2 displays" when more than one.
- `monitors-changed` gains `stageOn: string[]` in place of
  `stageOn: string | null` — **ordered, index 0 being the pacer**, so Studio can
  label one card differently without a second field. An empty array still means
  the pacer is on primary.

## 8. Testing

| Level | What |
| --- | --- |
| `crates/host` | `monitor.rs`: placements for 1, 2 and 3 panes; the pacer's display unplugged pulls to primary and stays pane 0; a mirror's display unplugged closes that pane and leaves the others; every current single-display test still passes as the one-element case. |
| `crates/host` | `flags.rs`: a stored `stage_monitor_id` migrates to a one-element `stage_monitor_ids`; a mirror key equal to the pacer's is refused. |
| `crates/app` | `guard`: `stage-2` may call `STAGE_COMMANDS` and nothing else; `main` still may not. |
| `crates/app` | `host_wiring`: an `overlay_ack_complete` from `stage-2` advances nothing; the same from `stage` advances the queue. |
| `apps/stage` | a mirror mounts no audio (extend the existing Viewer silence test to cover `?mirror`). |
| `apps/studio` | the Monitors card toggles, and the picker reports the count. |
| Browser | three simulated viewports (1920×1080, 1366×768, 1280×720) each draw the whole canvas — the P11.6 property, now load-bearing. |

## 9. Out of scope (YAGNI)

- Independent screens per display. `PresentationService` owns one current
  screen, and nothing here asks for two.
- Per-display layout, scale or decor overrides. `StageFit` already handles
  different resolutions.
- Promoting a mirror to pacer (§3.1).
- A cap on the number of displays — the OS list is the limit, so "even more if
  needed" comes free.
- Reducing `STEP_HZ` for mirrors. Each extra display costs about one renderer
  (~11% of a core, ~100–150 MB), mostly its own decor world. That is real and
  the operator should know it, but it is a measurement to take after the feature
  works, not a guess to build against.

## 10. Risks

| Risk | Handling |
| --- | --- |
| A window call under the host lock deadlocks the app (2026-09-08) | `windows::refresh` keeps its read-decide-act shape; `state::assert_unlocked` already panics in dev on a violation, and now covers more call sites. |
| A mirror's ack reaching `PresentationService` would double-advance the queue | Refused in the command *and* not sent by the webview. |
| N renderers cost N × decor | Measured after, with `STEP_HZ` as the lever (§9). |
| The settings migration silently drops a remembered display | The migration is in the deserialiser with a test; `[]` and `[k]` are both round-tripped. |

//! Where the Stage window lives (§9, §11.M).
//!
//! **The host never picks a display.** Stage is *ready* from first Control
//! Load: it opens fullscreen on the primary display and waits there. Sending it
//! to an external monitor is a manual act the first time — Control's top picker
//! or Settings ▸ Monitors — and that pick is remembered in `stage.monitor_id`.
//! When a remembered display is connected again, Stage goes back to it; when it
//! disappears, Stage comes back to primary and the Play keeps playing (§9).
//! That is the whole policy, and it exists because a monitor list is exactly
//! the kind of thing a heuristic gets wrong in front of an audience.
//!
//! Decided 2026-09-05, closing "Default Stage monitor when several externals
//! exist" (§9, ungrilled): **there is no default.** Two externals and no
//! remembered pick means Stage stays on primary and Control shows a picker.
//!
//! ```text
//! stage.monitor_id = None            Stage on primary, ready. Never guesses.
//! stage.monitor_id = Some(k), k up   Stage on k.
//! stage.monitor_id = Some(k), k gone Stage on primary, waiting for k.
//! stage.monitor_id = Some(k), k ×2   Ambiguous: two identical panels. Ask.
//! ```
//!
//! # The seam
//!
//! The OS list arrives as `Vec<MonitorInfo>` — Tauri's `availableMonitors` in
//! the app crate, a literal in tests. That parameter *is* the monitor seam: a
//! trait with one real adapter would be indirection, and an unplug test needs
//! nothing more than a shorter vector
//! (`01_codebase-design-spec-v1.md`: do not introduce a port with only one
//! adapter).
//!
//! Sizes and positions are **logical** pixels. Tauri's `Monitor` reports
//! physical ones, so the app crate converts with `toLogical(scale_factor)`
//! before it gets here (§7).

use serde::{Deserialize, Serialize};

use crate::notice::{Notice, Severity};

/// A display's identity across an unplug.
///
/// Neither OS hands out a serial number through Tauri: there is a name
/// (`\\.\DISPLAY1`, `Built-in Retina Display`) and a geometry. The key pairs
/// the name with the resolution, which survives a replug and a reboot on both
/// platforms, and collides only between two identical panels on one machine —
/// the case [`StagePlacement::Ambiguous`] refuses to guess at.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct MonitorKey(String);

impl MonitorKey {
    pub fn new(value: impl Into<String>) -> Self {
        MonitorKey(value.into())
    }

    /// The key the app crate derives from a `tauri::window::Monitor`.
    pub fn derive(name: Option<&str>, width: u32, height: u32) -> Self {
        MonitorKey(format!("{}@{width}x{height}", name.unwrap_or("display")))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for MonitorKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// One connected display, in logical pixels.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub key: MonitorKey,
    /// What the OS calls it. `None` when the OS declines to say, which is why
    /// it is not the key on its own.
    pub name: Option<String>,
    pub primary: bool,
    pub position: (i32, i32),
    pub size: (u32, u32),
    pub scale_factor: f64,
}

impl MonitorInfo {
    /// What Settings ▸ Monitors shows when the OS gave no name.
    pub fn label(&self) -> String {
        match &self.name {
            Some(name) => name.clone(),
            None => format!("{}×{}", self.size.0, self.size.1),
        }
    }
}

/// §4.2 `stage.reattach`, control-behaviour: it decides what happens when the
/// remembered display comes back **while a Play is open**, and it can therefore
/// change mid-Play without touching anything scored.
///
/// Outside a Play the answer is always "go there" — there is no show to
/// disturb, and that is the behaviour §9's manual-first policy promises.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StageReattach {
    /// Stay put, raise a notice with a *Move Stage* action. A window jumping
    /// displays mid-question is not something a live show can absorb.
    #[default]
    Ask,
    /// Go back the moment the display appears.
    Auto,
    /// Stay put, say nothing.
    Stay,
}

impl StageReattach {
    /// The §4.2 flag value, as `FlagService::flag` reports it.
    pub fn as_str(self) -> &'static str {
        match self {
            StageReattach::Ask => "ask",
            StageReattach::Auto => "auto",
            StageReattach::Stay => "stay",
        }
    }
}

/// Where Stage can be right now, given the remembered pick and the OS list.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StagePlacement {
    /// No remembered pick, or the operator asked for primary. Ready, waiting.
    Primary,
    On(MonitorKey),
    /// Remembered, not connected. Stage sits on primary until it returns.
    WaitingFor(MonitorKey),
    /// The remembered key matches two connected displays. The host will not
    /// pick one of them.
    Ambiguous(MonitorKey),
}

impl StagePlacement {
    /// The display Stage should be shown on, or `None` for primary.
    pub fn target(&self) -> Option<&MonitorKey> {
        match self {
            StagePlacement::On(key) => Some(key),
            _ => None,
        }
    }
}

/// What the caller has to do about a monitor event: move the window, and/or
/// raise a notice. Never both silently — every move the *operator* did not ask
/// for comes with a notice saying so.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct StageMove {
    /// `Some(None)` means "move to primary"; `Some(Some(k))` means "move to k";
    /// `None` means the window stays where it is.
    pub to: Option<Option<MonitorKey>>,
    pub notice: Option<Notice>,
}

impl StageMove {
    fn stay() -> Self {
        StageMove::default()
    }

    fn to(target: Option<MonitorKey>) -> Self {
        StageMove {
            to: Some(target),
            notice: None,
        }
    }

    fn and(mut self, notice: Notice) -> Self {
        self.notice = Some(notice);
        self
    }
}

/// The connected displays and where the Stage window actually is.
///
/// Runtime only. The *pick* (`stage.monitor_id`) and the *policy*
/// (`stage.reattach`) belong to `FlagService`, and are passed in on every call
/// — the same discipline that keeps `play.status` out of `FlagService`. A
/// second copy of a setting is drift waiting to happen (§2.16).
#[derive(Debug, Clone, Default)]
pub struct StageDisplay {
    monitors: Vec<MonitorInfo>,
    /// Where the window is. `None` is primary — including "primary because the
    /// remembered display is unplugged".
    on: Option<MonitorKey>,
}

impl StageDisplay {
    pub fn new() -> Self {
        StageDisplay::default()
    }

    pub fn monitors(&self) -> &[MonitorInfo] {
        &self.monitors
    }

    /// Where the window is now, as opposed to where the pick says it belongs.
    pub fn current(&self) -> Option<&MonitorKey> {
        self.on.as_ref()
    }

    pub fn primary(&self) -> Option<&MonitorInfo> {
        self.monitors.iter().find(|m| m.primary)
    }

    /// One display total is a valid configuration (§9): Stage fullscreens on
    /// it, Studio is an Alt-Tab away.
    pub fn is_single_display(&self) -> bool {
        self.monitors.len() <= 1
    }

    /// Resolve a remembered pick against the list as it is now.
    pub fn placement(&self, wanted: Option<&MonitorKey>) -> StagePlacement {
        let Some(key) = wanted else {
            return StagePlacement::Primary;
        };
        match self.monitors.iter().filter(|m| &m.key == key).count() {
            0 => StagePlacement::WaitingFor(key.clone()),
            1 => StagePlacement::On(key.clone()),
            _ => StagePlacement::Ambiguous(key.clone()),
        }
    }

    /// `stage_set_monitor` — the manual send. `None` parks Stage on primary.
    ///
    /// Refuses a key that is not connected, rather than remembering a wish: the
    /// operator is looking at a picker built from [`Self::monitors`], so an
    /// unknown key means the list moved under them and they should see it.
    pub fn set_monitor(&mut self, key: Option<MonitorKey>) -> Result<StageMove, MonitorError> {
        match &key {
            None => {}
            Some(key) => match self.monitors.iter().filter(|m| &m.key == key).count() {
                0 => return Err(MonitorError::NotConnected(key.clone())),
                1 => {}
                _ => return Err(MonitorError::Ambiguous(key.clone())),
            },
        }
        self.on = key.clone();
        Ok(StageMove::to(key))
    }

    /// The OS list changed — a cable, a resolution change, a dock.
    ///
    /// Three things can follow, and never more than one window move:
    ///
    /// 1. **The display Stage is on went away.** Pull to primary, warn. The
    ///    Play is untouched and stays `playing` (§9) — nothing in this module
    ///    can reach a Play.
    /// 2. **The remembered display came back** while Stage sits on primary.
    ///    Outside a Play, go. Inside one, [`StageReattach`] decides.
    /// 3. **The remembered key now matches two displays.** Say so, move
    ///    nothing.
    pub fn monitors_changed(
        &mut self,
        monitors: Vec<MonitorInfo>,
        wanted: Option<&MonitorKey>,
        reattach: StageReattach,
        play_is_open: bool,
    ) -> StageMove {
        self.monitors = monitors;
        let placement = self.placement(wanted);

        // 1. Stage is standing on a display that is no longer there.
        if let Some(on) = self.on.clone()
            && !self.monitors.iter().any(|m| m.key == on)
        {
            self.on = None;
            return StageMove::to(None).and(
                Notice::new(
                    "stage.monitor_lost",
                    Severity::Warn,
                    &["pick_monitor", "keep_primary"],
                )
                .at("stage.monitor_id")
                .with("monitor", on.to_string()),
            );
        }

        match placement {
            // 3. Two panels answer to one key. Refuse to choose between them.
            StagePlacement::Ambiguous(key) => StageMove::stay().and(
                Notice::new("stage.monitor_ambiguous", Severity::Warn, &["pick_monitor"])
                    .at("stage.monitor_id")
                    .with("monitor", key.to_string()),
            ),

            // 2. The remembered display is back and Stage is not on it.
            StagePlacement::On(key) if self.on.as_ref() != Some(&key) => {
                if !play_is_open || reattach == StageReattach::Auto {
                    let notice = Notice::new("stage.monitor_restored", Severity::Info, &[])
                        .at("stage.monitor_id")
                        .with("monitor", key.to_string());
                    self.on = Some(key.clone());
                    StageMove::to(Some(key)).and(notice)
                } else if reattach == StageReattach::Ask {
                    StageMove::stay().and(
                        Notice::new(
                            "stage.monitor_available",
                            Severity::Info,
                            &["move_stage", "keep_primary"],
                        )
                        .at("stage.monitor_id")
                        .with("monitor", key.to_string()),
                    )
                } else {
                    StageMove::stay()
                }
            }

            _ => StageMove::stay(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum MonitorError {
    #[error("monitor {0} is not connected")]
    NotConnected(MonitorKey),
    /// Two identical panels. The operator has to disambiguate by unplugging one
    /// or by picking from a list that shows positions.
    #[error("monitor {0} matches more than one connected display")]
    Ambiguous(MonitorKey),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn monitor(name: &str, primary: bool, size: (u32, u32)) -> MonitorInfo {
        MonitorInfo {
            key: MonitorKey::derive(Some(name), size.0, size.1),
            name: Some(name.to_owned()),
            primary,
            position: (0, 0),
            size,
            scale_factor: 1.0,
        }
    }

    fn laptop() -> MonitorInfo {
        monitor("built-in", true, (1512, 982))
    }

    fn projector() -> MonitorInfo {
        monitor("projector", false, (1920, 1080))
    }

    fn tv() -> MonitorInfo {
        monitor("tv", false, (3840, 2160))
    }

    #[test]
    fn with_no_remembered_pick_the_host_stays_on_primary_however_many_externals() {
        let mut display = StageDisplay::new();
        let mv = display.monitors_changed(
            vec![laptop(), projector(), tv()],
            None,
            StageReattach::default(),
            false,
        );

        assert_eq!(display.placement(None), StagePlacement::Primary);
        assert_eq!(mv, StageMove::stay(), "the host never picks a display");
    }

    #[test]
    fn a_manual_send_is_refused_for_a_display_that_is_not_there() {
        let mut display = StageDisplay::new();
        display.monitors_changed(vec![laptop()], None, StageReattach::default(), false);

        let key = projector().key;
        assert_eq!(
            display.set_monitor(Some(key.clone())),
            Err(MonitorError::NotConnected(key)),
        );
        assert_eq!(display.current(), None);
    }

    #[test]
    fn unplugging_the_stage_display_pulls_the_window_back_and_warns() {
        let mut display = StageDisplay::new();
        display.monitors_changed(vec![laptop(), projector()], None, StageReattach::Ask, false);
        let key = projector().key;
        display.set_monitor(Some(key.clone())).unwrap();

        let mv = display.monitors_changed(vec![laptop()], Some(&key), StageReattach::Ask, true);

        assert_eq!(mv.to, Some(None), "Stage comes back to primary");
        let notice = mv.notice.expect("a notice, not a silent move");
        assert_eq!(notice.code, "stage.monitor_lost");
        assert_eq!(notice.severity, Severity::Warn);
        assert_eq!(display.current(), None);
        assert_eq!(
            display.placement(Some(&key)),
            StagePlacement::WaitingFor(key),
            "the pick is remembered, not cleared",
        );
    }

    #[test]
    fn a_remembered_display_that_returns_is_taken_automatically_outside_a_play() {
        let mut display = StageDisplay::new();
        let key = projector().key;
        display.monitors_changed(vec![laptop()], Some(&key), StageReattach::Ask, false);

        let mv = display.monitors_changed(
            vec![laptop(), projector()],
            Some(&key),
            StageReattach::Ask,
            false,
        );

        assert_eq!(mv.to, Some(Some(key.clone())));
        assert_eq!(
            mv.notice.expect("told about it").code,
            "stage.monitor_restored"
        );
        assert_eq!(display.current(), Some(&key));
    }

    #[test]
    fn mid_play_the_reattach_setting_decides_and_ask_moves_nothing() {
        let key = projector().key;
        let case = |reattach| {
            let mut display = StageDisplay::new();
            display.monitors_changed(vec![laptop()], Some(&key), reattach, true);
            display.monitors_changed(vec![laptop(), projector()], Some(&key), reattach, true)
        };

        let ask = case(StageReattach::Ask);
        assert_eq!(ask.to, None, "no window jumps mid-question");
        let notice = ask.notice.expect("offered, not done");
        assert_eq!(notice.code, "stage.monitor_available");
        assert_eq!(notice.actions, vec!["move_stage", "keep_primary"]);

        assert_eq!(case(StageReattach::Auto).to, Some(Some(key.clone())));

        let stay = case(StageReattach::Stay);
        assert_eq!(stay.to, None);
        assert_eq!(stay.notice, None);
    }

    #[test]
    fn two_identical_panels_are_ambiguous_and_the_host_refuses_to_choose() {
        let mut display = StageDisplay::new();
        let twin = || monitor("acme", false, (1920, 1080));
        let key = twin().key;

        let mv = display.monitors_changed(
            vec![laptop(), twin(), twin()],
            Some(&key),
            StageReattach::Auto,
            false,
        );

        assert_eq!(
            display.placement(Some(&key)),
            StagePlacement::Ambiguous(key.clone())
        );
        assert_eq!(mv.to, None);
        assert_eq!(mv.notice.expect("asks").code, "stage.monitor_ambiguous");
        assert_eq!(
            display.set_monitor(Some(key.clone())),
            Err(MonitorError::Ambiguous(key))
        );
    }

    #[test]
    fn one_display_is_a_valid_configuration() {
        let mut display = StageDisplay::new();
        display.monitors_changed(vec![laptop()], None, StageReattach::Ask, true);

        assert!(display.is_single_display());
        assert_eq!(display.placement(None), StagePlacement::Primary);
        assert_eq!(
            display.primary().map(MonitorInfo::label),
            Some("built-in".to_owned())
        );
    }

    #[test]
    fn parking_on_primary_keeps_the_window_there_even_when_an_external_is_up() {
        let mut display = StageDisplay::new();
        display.monitors_changed(
            vec![laptop(), projector()],
            None,
            StageReattach::Auto,
            false,
        );
        display.set_monitor(Some(projector().key)).unwrap();

        // The operator asks for primary; `stage.monitor_id` becomes None.
        assert_eq!(display.set_monitor(None).unwrap().to, Some(None));
        let mv = display.monitors_changed(
            vec![laptop(), projector()],
            None,
            StageReattach::Auto,
            false,
        );
        assert_eq!(mv, StageMove::stay(), "an explicit park is not undone");
    }
}

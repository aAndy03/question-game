//! Health (§11.J, `05_STUDIO_DESIGN.md` §12.6): silent until there is
//! something to say, and every message paired with a suggestion.
//!
//! The host does not measure anything here. Free bytes, whether the Stage
//! window exists, what Stage reported — those are facts the app crate has and
//! this library does not, so they arrive as [`HealthInputs`] and the report
//! is a pure function of them. The inputs are a value, not a trait: a test
//! hands in a struct and gets a report, which is the same discipline as the
//! monitor seam.
//!
//! Every item is a §14 [`Notice`] with at least one action, because a health
//! message the operator cannot act on is noise on a status bar during a show.

use serde::Serialize;

use crate::flags::CueKey;
use crate::notice::{Notice, Severity};

/// Below this the data volume is a problem worth a notice: one show's worth
/// of Plays and a search index fit in a fraction of it, so the warning arrives
/// long before a save can fail.
pub const DISK_LOW_BYTES: u64 = 500 * 1024 * 1024;

/// What the app crate can see and the host cannot.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct HealthInputs {
    /// Free bytes on the volume holding the user-data directory. `None` when
    /// the OS would not say, which is not itself a finding.
    pub free_bytes: Option<u64>,
    /// The last `play_persist` or catalog write that failed, until one succeeds.
    pub last_persist_error: Option<String>,
    /// Whether the Tantivy index is in step with the catalog.
    pub search_ok: bool,
    pub stage_window_exists: bool,
    /// Stage called `stage_ready`.
    pub stage_ready: bool,
    /// The contract version Stage announced, when it did.
    pub stage_contract_version: Option<u32>,
    /// Cue files Stage reported it could not load: `(key, file)`.
    pub missing_cues: Vec<(CueKey, String)>,
    /// Cue files that are **present** and would not sound: `(key, file)`.
    ///
    /// A different fault with a different remedy. Reporting it as a missing
    /// file told the operator to go looking for something that was there all
    /// along (P11.9).
    pub failed_cues: Vec<(CueKey, String)>,
    /// Panels that are plugged in and that the OS is **not using** — a Windows
    /// display set to "Show only on 1", or one that never got a mode. The app
    /// cannot send Stage to a display the OS does not offer, so the fix is in
    /// the OS's display settings, and the operator has to be told which panel
    /// it is (an Atomos recorder arriving this way looked like the app
    /// ignoring it, 2026-09-11). Friendly names.
    pub unused_displays: Vec<String>,
    /// References in the library that point at nothing or at another
    /// workspace (beta.5): `CatalogService::library_check`.
    pub library_refs: u32,
}

/// The worst severity among the items. `Ok` is an empty report.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Ok,
    Warn,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub status: HealthStatus,
    pub items: Vec<Notice>,
}

impl HealthReport {
    pub fn ok() -> Self {
        HealthReport {
            status: HealthStatus::Ok,
            items: Vec::new(),
        }
    }
}

/// The report for a set of inputs. Pure, so the app crate can call it as often
/// as it likes and emit only when the result changed.
pub fn check(inputs: &HealthInputs) -> HealthReport {
    let mut items: Vec<Notice> = Vec::new();

    if let Some(free) = inputs.free_bytes
        && free < DISK_LOW_BYTES
    {
        items.push(
            Notice::new("health.disk_low", Severity::Warn, &["open_data_folder"])
                .with("freeMb", (free / (1024 * 1024)).to_string()),
        );
    }

    if let Some(message) = &inputs.last_persist_error {
        items.push(
            Notice::new(
                "health.persist_failed",
                Severity::Error,
                &["open_data_folder"],
            )
            .with("message", message.clone()),
        );
    }

    if inputs.library_refs > 0 {
        items.push(
            Notice::new("health.library_refs", Severity::Warn, &["repair_library"])
                .with("count", inputs.library_refs.to_string()),
        );
    }

    if !inputs.search_ok {
        items.push(Notice::new(
            "health.search_degraded",
            Severity::Warn,
            &["rebuild_search"],
        ));
    }

    if inputs.stage_window_exists && !inputs.stage_ready {
        items.push(Notice::new(
            "health.stage_not_ready",
            Severity::Warn,
            &["open_stage"],
        ));
    }

    if let Some(version) = inputs.stage_contract_version
        && version != crate::stage::CONTRACT_VERSION
    {
        items.push(
            Notice::new("health.contract_mismatch", Severity::Error, &["reinstall"])
                .with("stage", version.to_string())
                .with("host", crate::stage::CONTRACT_VERSION.to_string()),
        );
    }

    // A `collector` notice, not an inline one: there is no settings field it
    // belongs to, and the remedy is outside the app.
    for display in &inputs.unused_displays {
        items.push(
            Notice::new(
                "health.display_unused",
                Severity::Warn,
                &["open_display_settings"],
            )
            .with("display", display.clone()),
        );
    }

    for (cue, file) in &inputs.failed_cues {
        items.push(
            Notice::new("health.audio_cue_failed", Severity::Warn, &["open_stage"])
                .at("audio.cues")
                .with("cue", cue.as_str())
                .with("file", file.clone()),
        );
    }

    for (cue, file) in &inputs.missing_cues {
        items.push(
            Notice::new(
                "health.audio_missing_cue",
                Severity::Warn,
                &["open_cue_folder"],
            )
            .at("audio.cues")
            .with("cue", cue.as_str())
            .with("file", file.clone()),
        );
    }

    let status = items
        .iter()
        .map(|n| match n.severity {
            Severity::Error | Severity::Block => HealthStatus::Error,
            Severity::Warn => HealthStatus::Warn,
            Severity::Info => HealthStatus::Ok,
        })
        .max()
        .unwrap_or(HealthStatus::Ok);

    HealthReport { status, items }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn quiet() -> HealthInputs {
        HealthInputs {
            free_bytes: Some(50 * 1024 * 1024 * 1024),
            search_ok: true,
            ..HealthInputs::default()
        }
    }

    #[test]
    fn nothing_to_say_is_an_empty_ok_report() {
        let report = check(&quiet());
        assert_eq!(report.status, HealthStatus::Ok);
        assert!(report.items.is_empty());
    }

    #[test]
    fn every_item_carries_a_suggestion() {
        let loud = HealthInputs {
            free_bytes: Some(1024),
            last_persist_error: Some("disk full".to_owned()),
            search_ok: false,
            stage_window_exists: true,
            stage_ready: false,
            stage_contract_version: Some(1),
            missing_cues: vec![(CueKey::Lock, "lock.wav".to_owned())],
            failed_cues: vec![(CueKey::Correct, "correct.wav".to_owned())],
            unused_displays: vec!["Atomos Ninja V".to_owned()],
            library_refs: 3,
        };
        let report = check(&loud);
        assert_eq!(report.items.len(), 9, "one item per finding");
        let refs = report
            .items
            .iter()
            .find(|i| i.code == "health.library_refs")
            .expect("the library check");
        assert_eq!(refs.actions, ["repair_library"]);
        for item in &report.items {
            assert!(!item.actions.is_empty(), "{} has no suggestion", item.code);
            assert!(item.actions.len() <= crate::notice::MAX_ACTIONS);
        }
    }

    #[test]
    fn the_status_is_the_worst_item() {
        let warn = check(&HealthInputs {
            free_bytes: Some(1024),
            ..quiet()
        });
        assert_eq!(warn.status, HealthStatus::Warn);

        let error = check(&HealthInputs {
            free_bytes: Some(1024),
            last_persist_error: Some("x".to_owned()),
            ..quiet()
        });
        assert_eq!(error.status, HealthStatus::Error);
    }

    #[test]
    fn an_unknown_free_space_is_not_a_finding() {
        let report = check(&HealthInputs {
            free_bytes: None,
            ..quiet()
        });
        assert_eq!(report.status, HealthStatus::Ok);
    }

    #[test]
    fn a_missing_cue_points_at_the_cue_map() {
        let report = check(&HealthInputs {
            missing_cues: vec![(CueKey::Wrong, "wrong.wav".to_owned())],
            ..quiet()
        });
        let item = &report.items[0];
        assert_eq!(item.code, "health.audio_missing_cue");
        assert_eq!(item.target_path.as_deref(), Some("audio.cues"));
        assert_eq!(item.detail["cue"], "wrong");
    }

    #[test]
    fn a_cue_that_will_not_sound_is_not_a_cue_that_is_missing() {
        let report = check(&HealthInputs {
            failed_cues: vec![(CueKey::Lock, "lock.wav".to_owned())],
            ..quiet()
        });
        assert_eq!(report.items.len(), 1);
        let item = &report.items[0];
        assert_eq!(item.code, "health.audio_cue_failed");
        assert_eq!(item.target_path.as_deref(), Some("audio.cues"));
        // Showing Stage is the remedy: the window nobody clicks is the one
        // whose audio context is never unlocked.
        assert_eq!(item.actions, vec!["open_stage".to_owned()]);
    }
}

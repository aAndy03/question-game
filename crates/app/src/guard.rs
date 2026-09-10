//! Which webview may call which command.
//!
//! §5.7: **Stage is a projection, not a controller.** Tauri does not gate
//! app-defined commands behind capabilities — `generate_handler!` registers
//! them for every webview — so the boundary has to be here, one line at the top
//! of each command, rather than in `capabilities/audience.json` (which can only
//! narrow the *core* verbs, and does).
//!
//! The list mirrors `STAGE_COMMANDS` in `packages/contract/src/commands.ts`.
//! Stage acknowledges its own animations and nothing more.

use crate::error::{AppError, AppResult};

/// The label Tauri gives the Studio webview.
pub const MAIN: &str = "main";
/// The label Tauri gives the Stage webview.
pub const STAGE: &str = "stage";
/// The label of the optional Statistics window (§11.K, P11).
pub const STATS: &str = "stats";

/// Is this one of the Stage windows?
///
/// `stage` is the **pacer** and `stage-2`, `stage-3`, … are its **mirrors**:
/// the same picture on another display, because the operator has two audience
/// screens and no HDMI splitter (§9, P11.11).
///
/// `allow` does not need this — anything that is not `main` or `stats` is held
/// to the Stage list already, which fails safe. `emit` does: it decides which
/// windows receive a Play, and a window the guard admitted but the emission
/// skipped would be a black screen on an audience display. One predicate, so
/// the two cannot disagree.
pub fn is_stage_label(label: &str) -> bool {
    label == STAGE || label.strip_prefix("stage-").is_some_and(|n| !n.is_empty())
}

/// Mirrors `STAGE_COMMANDS` in `packages/contract`.
///
/// Two, and both are Stage reporting on itself: `stage_ready` says "I am
/// mounted, and this is the contract version I was built against";
/// `overlay_ack_complete` says "that timeline finished". Neither carries an
/// opinion about the Play.
pub const STAGE_COMMANDS: [&str; 5] = [
    "overlay_ack_complete",
    "stage_ready",
    "stage_report",
    // Reporting on itself, into the log. Writes nothing a Play can read.
    "client_log",
    // Its second's numbers, into the performance log. Same footing.
    "perf_report",
];

/// What the Statistics window may ask for: reads, and only reads.
///
/// §11.K — "reads projections, never writes rules". Statistics on a second
/// display is Studio's Statistics page in a window of its own, so it needs the
/// same reads that page makes and nothing else. A write reaching the host from
/// this label is a bug in Studio, and this is where it stops.
pub const STATS_COMMANDS: [&str; 11] = [
    "stats_query",
    "client_log",
    "perf_report",
    "get_state",
    "settings_get",
    "monitors_list",
    "play_list",
    "catalog_list",
    "catalog_get",
    "recipe_list",
    // The bridge asks for the health report on mount, the same as Studio's own
    // window does. Refusing it left a warning in the log on every open and a
    // window that had not finished starting up.
    "health_get",
];

pub fn stage_may_call(command: &str) -> bool {
    STAGE_COMMANDS.contains(&command)
}

pub fn stats_may_call(command: &str) -> bool {
    STATS_COMMANDS.contains(&command)
}

/// Refuse a command that reached the host from the wrong webview.
///
/// An unknown label is treated as Stage: a window this build did not create is
/// the last thing that should be allowed to move the token.
pub fn allow(label: &str, command: &'static str) -> AppResult<()> {
    if label == STATS {
        if stats_may_call(command) {
            accepted(label, command);
            return Ok(());
        }
        tracing::warn!(
            webview = label,
            command,
            "refused: statistics is a projector"
        );
        refused(command);
        return Err(AppError::NotForStage { command });
    }
    if label == MAIN || stage_may_call(command) {
        accepted(label, command);
        return Ok(());
    }
    tracing::warn!(webview = label, command, "refused: stage is a projection");
    refused(command);
    Err(AppError::NotForStage { command })
}

/// Every command passes through here, so this is the one place that can say
/// what the webviews are actually asking for — to the log (off unless asked
/// for: `RUST_LOG=questiongame_app=debug`) and to the performance log, which
/// also learns which command the next host lock on this thread belongs to.
fn accepted(label: &str, command: &'static str) {
    tracing::debug!(webview = label, command, "invoke");
    crate::perf::set_current(command);
    tracing::trace!(target: crate::perf::TARGET, kind = "command", name = command);
}

fn refused(command: &'static str) {
    tracing::trace!(target: crate::perf::TARGET, kind = "refused", name = command);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// P11 exit criterion: the Statistics window is never a second Stage, and
    /// it cannot write. It is Studio's page on another display — reads only.
    #[test]
    fn statistics_may_only_read() {
        for command in STATS_COMMANDS {
            assert!(allow(STATS, command).is_ok(), "{command} is a read");
        }
        for command in [
            "give_token",
            "play_start",
            "catalog_upsert",
            "settings_set_global",
            "show_screen",
            // A window of numbers does not open or close windows either — that
            // is the operator's, through Studio (§13.3).
            "stats_window",
            // Not a writer of the Play, but Stage's own handshake: this window
            // has no overlay queue to acknowledge.
            "overlay_ack_complete",
            "stage_ready",
        ] {
            assert!(
                allow(STATS, command).is_err(),
                "statistics called {command}"
            );
        }
    }

    #[test]
    fn stage_may_only_report_on_itself() {
        assert!(allow(STAGE, "overlay_ack_complete").is_ok());
        assert!(allow(STAGE, "stage_ready").is_ok());

        for command in [
            "give_token",
            "reveal_outcome",
            "play_start",
            "catalog_upsert",
            "settings_set_global",
            "show_screen",
        ] {
            assert!(
                allow(STAGE, command).is_err(),
                "{command} must not be reachable from Stage",
            );
        }
    }

    #[test]
    fn studio_may_call_everything() {
        for command in ["give_token", "overlay_ack_complete", "catalog_archive"] {
            assert!(allow(MAIN, command).is_ok());
        }
    }

    #[test]
    fn a_window_this_build_did_not_create_is_treated_as_stage() {
        assert!(allow("popup", "give_token").is_err());
        assert!(allow("", "play_start").is_err());
    }

    /// P11.11: a mirror is a Stage window and is held to a Stage window's
    /// list. It may say what it did to itself and nothing else.
    #[test]
    fn a_mirror_label_is_a_stage_label() {
        assert!(is_stage_label(STAGE));
        assert!(is_stage_label("stage-2"));
        assert!(is_stage_label("stage-17"));
        assert!(!is_stage_label(MAIN));
        assert!(!is_stage_label(STATS));
        assert!(!is_stage_label("stage-"), "an empty index is not a window");

        assert!(allow("stage-2", "stage_ready").is_ok());
        assert!(allow("stage-2", "client_log").is_ok());
        assert!(
            allow("stage-2", "lock_selection").is_err(),
            "a mirror is a projection, not a controller (§5.7)"
        );
    }

}

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

/// Mirrors `STAGE_COMMANDS` in `packages/contract`.
///
/// Two, and both are Stage reporting on itself: `stage_ready` says "I am
/// mounted, and this is the contract version I was built against";
/// `overlay_ack_complete` says "that timeline finished". Neither carries an
/// opinion about the Play.
pub const STAGE_COMMANDS: [&str; 2] = ["overlay_ack_complete", "stage_ready"];

pub fn stage_may_call(command: &str) -> bool {
    STAGE_COMMANDS.contains(&command)
}

/// Refuse a command that reached the host from the wrong webview.
///
/// An unknown label is treated as Stage: a window this build did not create is
/// the last thing that should be allowed to move the token.
pub fn allow(label: &str, command: &'static str) -> AppResult<()> {
    if label == MAIN || stage_may_call(command) {
        return Ok(());
    }
    Err(AppError::NotForStage { command })
}

#[cfg(test)]
mod tests {
    use super::*;

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
}

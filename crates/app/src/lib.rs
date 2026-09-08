//! `questiongame-app` — the Tauri shell around `questiongame-host`.
//!
//! This crate exists so that one does not have to. `crates/host` is a plain
//! library with zero `tauri::` imports — a test sweeps its whole `src` tree and
//! fails on a hit — and everything Tauri knows about lives here:
//!
//! ```text
//! state         the four services behind one lock, and the only clock
//! commands/     the §13 surface as `#[tauri::command]`, one file per service
//! emit          host → webview events; the only sender
//! guard         which webview may call what (§5.7)
//! windows       the two webviews, and where the Stage one stands
//! monitors      the real end of the monitor seam
//! tick          the 100ms show loop and the monitor watch
//! decor         `StageDecorSettings` out of the recipe's layout document
//! error         what a refused command looks like on the wire
//! ```
//!
//! Nothing here decides a game rule, resolves a settings cascade, or runs SQL.
//! When a function in this crate starts branching on the state of a Play, the
//! branch belongs in the host — that is the whole test for whether a change
//! goes above or below this line.

pub mod commands;
pub mod decor;
pub mod emit;
pub mod error;
pub mod guard;
pub mod monitors;
pub mod state;
pub mod tick;
pub mod windows;

use tauri::Manager;

use crate::state::{AppState, Host, catalog_location};

/// Build and run the desktop app.
///
/// Boot order matters and is short: open the library (migrations, projection
/// rebuild, search reindex — a boot cost, ~78 ms on a three-thousand-question
/// library), then show Studio. The **Stage window is not created here**: §9
/// says first Control Load, and an empty fullscreen window on the projector
/// while the operator is still choosing a game is worse than no window.
pub fn run() {
    tracing_logging();
    tauri::Builder::default()
        .invoke_handler(handlers())
        // Studio is the app. Stage and Statistics are surfaces it puts on
        // displays, so closing Studio ends the show rather than leaving a
        // window of numbers running with nothing behind it.
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. })
                && window.label() == guard::MAIN
            {
                window.app_handle().exit(0);
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let host = Host::open(catalog_location(&handle)?)?;
            app.manage(AppState::new(host));

            windows::open_studio(&handle)?;
            tick::health_once(&handle);
            tick::spawn(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the app runs");
}

/// The host has emitted `tracing` spans since P5 with nobody listening. This
/// is the subscriber — here rather than in the library, because a library must
/// not choose a global one for whoever embeds it.
///
/// `RUST_LOG` overrides; the default is quiet enough to leave on in a show and
/// loud enough to explain a boot.
fn tracing_logging() {
    use tracing_subscriber::{EnvFilter, fmt};

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("questiongame_host=info,questiongame_app=info,warn"));
    let _ = fmt().with_env_filter(filter).try_init();
}

/// The §13 surface. Grouped the way `COMMAND_GROUPS` in `packages/contract`
/// groups it, so the two lists can be read side by side.
fn handlers() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        // CatalogService
        commands::catalog::catalog_list,
        commands::catalog::catalog_get,
        commands::catalog::catalog_upsert,
        commands::catalog::catalog_upsert_many,
        commands::catalog::catalog_archive,
        commands::catalog::catalog_archive_many,
        commands::catalog::catalog_restore,
        commands::catalog::catalog_restore_many,
        commands::catalog::catalog_search,
        commands::catalog::referenced_by,
        commands::catalog::asset_put,
        commands::catalog::recipe_list,
        commands::catalog::recipe_get,
        commands::catalog::recipe_upsert,
        commands::catalog::recipe_archive,
        commands::catalog::recipe_restore,
        commands::catalog::recipe_duplicate,
        commands::catalog::recipe_set_membership,
        commands::catalog::recipe_set_settings,
        commands::catalog::recipe_set_layout,
        commands::catalog::recipe_set_overlay,
        commands::catalog::recipe_new,
        commands::catalog::catalog_seed_demo,
        commands::catalog::catalog_seed_status,
        commands::catalog::catalog_rebuild_search,
        commands::catalog::wipe_plays,
        // MatchService
        commands::play::play_load,
        commands::play::play_unload,
        commands::play::play_start,
        commands::play::pause,
        commands::play::resume,
        commands::play::restart,
        commands::play::abandon,
        commands::play::get_state,
        commands::play::choose_domain,
        commands::play::set_selection,
        commands::play::lock_selection,
        commands::play::start_timer,
        commands::play::pause_timer,
        commands::play::reveal_outcome,
        commands::play::give_token,
        commands::play::reveal_and_pass,
        commands::play::reorder_ring,
        commands::play::undo_turn,
        commands::play::redo_turn,
        commands::play::play_events,
        commands::play::play_list,
        // PresentationService
        commands::presentation::show_screen,
        commands::presentation::show_overlay,
        commands::presentation::overlay_ack_complete,
        commands::presentation::reveal_stem,
        commands::presentation::reveal_next_option,
        commands::presentation::reveal_leaderboard_rank,
        commands::presentation::stage_ready,
        commands::presentation::monitors_list,
        commands::presentation::stage_set_monitor,
        commands::presentation::stage_open,
        commands::presentation::stage_report,
        // FlagService
        commands::flags::settings_get,
        commands::flags::settings_set_global,
        commands::flags::settings_set_current_game,
        commands::flags::settings_set_shortcut,
        commands::flags::operator_set_pin,
        commands::flags::operator_activate,
        commands::flags::paths_get,
        commands::flags::paths_reveal,
        commands::flags::uninstall_data,
        commands::flags::health_get,
        // Statistics — read-only (§11.K)
        commands::stats::stats_query,
        commands::stats::stats_window,
    ]
}

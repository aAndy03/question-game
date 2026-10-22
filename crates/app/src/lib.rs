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
//! perf          the per-second performance log: OS, host and webview layers
//! decor         `StageDecorSettings` out of the recipe's layout document
//! error         what a refused command looks like on the wire
//! ```
//!
//! Nothing here decides a game rule, resolves a settings cascade, or runs SQL.
//! When a function in this crate starts branching on the state of a Play, the
//! branch belongs in the host — that is the whole test for whether a change
//! goes above or below this line.

pub mod boot;
pub mod commands;
pub mod decor;
pub mod emit;
pub mod error;
pub mod guard;
pub mod identity;
pub mod logfile;
pub mod monitors;
pub mod perf;
pub mod quit;
pub mod stable_copy;
pub mod state;
pub mod tick;
pub mod topology;
pub mod update;
pub mod whats_new;
pub mod windows;

use tauri::Manager;

use crate::state::{AppState, Host, catalog_path, open_options};

/// Build and run the desktop app.
///
/// Boot order matters and is short: open the library (migrations, projection
/// rebuild, search reindex — a boot cost, ~78 ms on a three-thousand-question
/// library), then show Studio. The **Stage window is not created here**: §9
/// says first Control Load, and an empty fullscreen window on the projector
/// while the operator is still choosing a game is worse than no window.
pub fn run() {
    tauri::Builder::default()
        // First, by the plugin's own rule: a second process must find the
        // first before it builds anything (P12.2). The file lock in `start`
        // stays as the library's own guard.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            windows::focus_studio(app);
        }))
        .invoke_handler(handlers())
        // Studio is the app. Stage and Statistics are surfaces it puts on
        // displays, so closing Studio ends the show — but not on one click:
        // the first press asks Studio, a second exits regardless (`quit`).
        .manage(quit::QuitState::default())
        .on_window_event(|window, event| {
            let tauri::WindowEvent::CloseRequested { api, .. } = event else {
                return;
            };
            if window.label() != guard::MAIN {
                return;
            }
            let app = window.app_handle();
            match app.state::<quit::QuitState>().on_close_requested() {
                quit::CloseDecision::Exit => app.exit(0),
                quit::CloseDecision::Ask => {
                    api.prevent_close();
                    emit::close_requested(app);
                }
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            // Before anything resolves a path — even the log's: the app must
            // know which set of folders is its own (P12.1, `identity`).
            if let Err(reason) = identity::check(tauri::is_dev(), &app.config().identifier) {
                boot::fail(&reason, None);
            }
            // Which product this is, decided once (`identity::channel`).
            let e2e_channel = std::env::var(identity::E2E_CHANNEL_ENV).ok();
            match identity::channel(&app.config().identifier, e2e_channel.as_deref()) {
                Ok(channel) => {
                    app.manage(channel);
                }
                Err(reason) => boot::fail(&reason, None),
            }
            // Logging first, and inside `setup`, because the log file lives in
            // the app-data directory and only Tauri can resolve it. The perf
            // layer is installed with the subscriber, so its counters exist
            // before the first command; the writer starts last (`start`).
            let perf_state = perf::PerfState::default();
            let perf_layer = perf::PerfLayer::new(perf_state.counters.clone());
            app.manage(perf_state);
            let data_dir = crate::state::user_data_dir(&handle).ok();
            tracing_logging(data_dir.as_deref(), perf_layer);
            // A release build has no console: from here on a panic is written
            // to the log, and a boot that fails says so in a box (P12.1).
            boot::install_panic_hook();
            // `setup` runs on the event loop, so this is where that thread is
            // identified — everything after it may be asserted against.
            crate::state::mark_main_thread();
            if let Err(error) = start(&handle, data_dir.clone()) {
                let log = data_dir.as_ref().map(|dir| dir.join(LOG_FILE));
                boot::fail(&error.to_string(), log.as_deref());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the app runs");
}

/// Everything after logging that can refuse to start: the one-process lock,
/// the library, Studio's window, the two loops. An error here is shown, not
/// swallowed (`boot::fail`).
///
/// The **Stage window is not created here**: §9 says first Control Load.
fn start(handle: &tauri::AppHandle, data_dir: Option<std::path::PathBuf>) -> error::AppResult<()> {
    // One library, one process — before anything opens the database.
    if let Some(dir) = &data_dir {
        crate::state::take_single_instance_lock(dir)?;
    }
    let library = catalog_path(handle)?;
    let options = open_options(library.parent().unwrap_or(std::path::Path::new(".")));
    let host = Host::open_installed(&library, &options)?;
    handle.manage(AppState::new(host));
    windows::open_studio(handle)?;
    // The first health report is the watch's own first tick: computing it
    // here would take the host lock on the event-loop thread.
    tick::spawn(handle.clone());
    // The performance log, one line a second (`perf`). It takes no lock.
    perf::spawn(handle.clone(), data_dir);
    Ok(())
}

/// The name of the log file, beside the library in the app-data directory.
pub const LOG_FILE: &str = "questiongame.log";

/// The host has emitted `tracing` spans since P5 with nobody listening. This
/// is the subscriber — here rather than in the library, because a library must
/// not choose a global one for whoever embeds it.
///
/// **Two sinks, two levels.** stderr keeps the quiet default: `RUST_LOG`
/// overrides it, and it is loud enough to explain a boot without narrating a
/// show. The **file** records `debug` for both crates, which includes
/// `guard::allow`'s line for every command the webviews ask for.
///
/// The file is not there because stderr is lost — `npm run dev:app` does print
/// it. It is there because the quiet default has *nothing* to say once the app
/// is up: every command goes through `guard::allow` at `debug`, so an operator
/// clicking around produces no output at all, and neither does an app that
/// stops responding. Asking for `RUST_LOG=…=debug` only works if you knew to
/// ask before the thing went wrong, and a window that has stopped responding
/// is usually killed rather than read.
///
/// **It appends; it does not truncate.** Two copies of the app can be running
/// at once — a dev launch that failed on a taken port still starts the binary,
/// and an orphan outlives the `tauri dev` that spawned it — and they share this
/// path. Truncating at boot meant the newer process silently erased the older
/// one's evidence, which is exactly the evidence anyone is here to read
/// (2026-09-08: it cost an evening of the operator's log going missing). Each
/// boot writes a banner with its pid instead, so runs interleave and none is
/// lost. It rotates at boot once past 10 MB, keeping three (`logfile`).
///
/// The third layer is the performance log's (`perf::PerfLayer`): it sees only
/// `target: "perf"` events and folds them into the current second. The two
/// text sinks never print those — their filters name the crates, not that
/// target — so attribution costs the log file nothing.
fn tracing_logging(dir: Option<&std::path::Path>, perf_layer: perf::PerfLayer) {
    use tracing_subscriber::layer::SubscriberExt;
    use tracing_subscriber::util::SubscriberInitExt;
    use tracing_subscriber::{EnvFilter, Layer, fmt};

    let console = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("questiongame_host=info,questiongame_app=info,warn"));
    // Per-layer filter, not `Layer::enabled`: a layer's `enabled` decides for
    // the whole subscriber, and one that says no to everything but `perf`
    // silences the log file.
    let perf_only = tracing_subscriber::filter::filter_fn(|m| m.target() == perf::TARGET);
    let registry = tracing_subscriber::registry()
        .with(perf_layer.with_filter(perf_only))
        .with(fmt::layer().with_filter(console));

    let file = dir.and_then(|dir| {
        std::fs::create_dir_all(dir).ok()?;
        // Bounded (P12.1). A rename that fails — another process holds the
        // file — is not an error; this run appends as before.
        let _ = logfile::rotate(dir, LOG_FILE, logfile::ROTATE_AT_BYTES, logfile::KEEP_ROTATED);
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join(LOG_FILE))
            .ok()
    });
    let Some(file) = file else {
        let _ = registry.try_init();
        return;
    };
    let path = dir.map(|d| d.join(LOG_FILE));
    let _ = registry
        .with(
            fmt::layer()
                .with_ansi(false)
                .with_writer(std::sync::Mutex::new(file))
                .with_filter(EnvFilter::new(
                    "questiongame_host=debug,questiongame_app=debug,info",
                )),
        )
        .try_init();
    if let Some(path) = path {
        // The banner is what tells two interleaved runs apart in one file.
        tracing::info!(
            path = %path.display(),
            pid = std::process::id(),
            "---- run start ----"
        );
    }
}

/// The §13 surface. Grouped the way `COMMAND_GROUPS` in `packages/contract`
/// groups it, so the two lists can be read side by side.
fn handlers() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        // The app itself (P12.2)
        commands::app::app_quit,
        commands::app::app_close_cancelled,
        commands::app::app_uninstall,
        commands::app::app_info,
        commands::app::update_check,
        commands::app::update_open_release,
        commands::app::whats_new_get,
        commands::app::whats_new_seen,
        // questiongame Beta's first launch (P13.1)
        commands::beta::beta_welcome_get,
        commands::beta::beta_welcome_done,
        commands::beta::beta_copy_stable_library,
        // Groups, tags, bulk edits (Beta, P15)
        commands::groups::catalog_bulk_edit,
        commands::groups::tag_list,
        commands::groups::tag_rename,
        commands::groups::tag_delete,
        commands::groups::domain_group_create,
        commands::groups::domain_group_rename,
        commands::groups::domain_group_reorder,
        commands::groups::domain_group_delete,
        // Workspaces (Beta 2.0)
        commands::workspace::workspace_list,
        commands::workspace::workspace_create,
        commands::workspace::workspace_rename,
        commands::workspace::workspace_set_group,
        commands::workspace::workspace_duplicate,
        commands::workspace::workspace_archive,
        commands::workspace::workspace_restore,
        commands::workspace::workspace_delete_preview,
        commands::workspace::workspace_delete,
        commands::workspace::workspace_switch,
        commands::workspace::workspace_group_create,
        commands::workspace::workspace_group_rename,
        commands::workspace::workspace_group_reorder,
        commands::workspace::workspace_group_delete,
        commands::workspace::transfer_preview,
        commands::workspace::catalog_copy_to,
        commands::workspace::catalog_move_to,
        commands::workspace::catalog_propagation_preview,
        commands::workspace::catalog_upsert_propagating,
        commands::workspace::catalog_unfollow,
        commands::workspace::catalog_family,
        commands::workspace::catalog_duplicate,
        commands::workspace::workspace_counts,
        commands::workspace::tags_unify,
        commands::catalog::library_repair,
        // CatalogService
        commands::catalog::catalog_list,
        commands::catalog::catalog_get,
        commands::catalog::catalog_upsert,
        commands::catalog::catalog_upsert_many,
        commands::catalog::catalog_archive,
        commands::catalog::catalog_archive_many,
        commands::catalog::catalog_restore,
        commands::catalog::catalog_restore_many,
        commands::catalog::catalog_import_questions,
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
        commands::catalog::recipe_bulk_edit,
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
        commands::presentation::stage_add_mirror,
        commands::presentation::stage_remove_mirror,
        commands::presentation::stage_open,
        commands::presentation::stage_report,
        // FlagService
        commands::flags::settings_get,
        commands::flags::rules_preview,
        commands::flags::settings_set_global,
        commands::flags::settings_set_current_game,
        commands::flags::settings_set_shortcut,
        commands::flags::operator_set_pin,
        commands::flags::operator_activate,
        commands::flags::paths_get,
        commands::flags::paths_reveal,
        commands::flags::uninstall_data,
        commands::flags::health_get,
        commands::flags::client_log,
        commands::flags::perf_report,
        // Statistics — read-only (§11.K)
        commands::stats::stats_query,
        commands::stats::stats_window,
    ]
}

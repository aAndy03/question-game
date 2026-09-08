//! `Host` — the four services and the one lock over them.
//!
//! `crates/host` is four in-process modules that compose in one direction. This
//! is where that composition is spelled once, so no command has to know the
//! order:
//!
//! ```text
//! FlagService::freeze  →  CatalogService::build_snapshot  →  MatchService::play_load
//!                                                                     ↓
//!                                                     CatalogService::play_persist
//! ```
//!
//! # One lock, not four
//!
//! Every service is a single-writer object and the operator is one human at one
//! keyboard, so there is no concurrency to win by splitting the lock — only the
//! chance of holding two of them in a different order in two commands. One
//! `Mutex<Host>` makes every command atomic against every other and makes the
//! lock order unspellable. Contention is a non-issue at human pace: the longest
//! write in the system is a ~2.5 ms fsync.
//!
//! # No clock inside the host
//!
//! `crates/host` takes `now_ms` on every command and never reads a clock. This
//! crate is where the clock is, and [`now_ms`] is the only place it is read —
//! which is also what makes the log replayable.

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use questiongame_host::catalog::{CatalogLocation, CatalogService};
use questiongame_host::flags::{CueKey, Disabled, FlagService, RuntimeContext};
use questiongame_host::health::{self, HealthInputs, HealthReport};
use questiongame_host::presentation::PresentationService;
use questiongame_host::settings::OverrideAfterLock;
use questiongame_host::stage::{PlayStateForStage, StageGameState, project};
use questiongame_host::{MatchService, Play, RecipeId, StageDisplay, TeamId};
use serde::Serialize;

use crate::error::{AppError, AppResult};

/// Epoch milliseconds. The one clock in the project.
///
/// A system clock that has been set behind 1970 is not a case worth a branch:
/// it saturates at zero, which is a Play whose events all happened at the same
/// instant — visibly wrong, rather than silently negative.
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Everything the host owns, behind one lock.
pub struct Host {
    pub catalog: CatalogService,
    pub flags: FlagService,
    pub play: MatchService,
    pub presentation: PresentationService,
    pub display: StageDisplay,
    /// The §12.6 inputs the app crate measures, and the last report it emitted.
    pub health: HealthState,
    /// What was last sent to `stage`. The 100ms tick emits only on a change, so
    /// an idle Play costs nothing on the wire.
    last_emitted: Option<PlayStateForStage>,
}

impl Host {
    /// Boot: open the catalog, load the globals, and take back whatever Play
    /// was open when the process last stopped.
    ///
    /// `CatalogService::open` does migrations, the projection rebuild and the
    /// search reindex — ~78 ms on a three-thousand-question library. That is a
    /// boot cost, not a per-command one, and it is why this runs before the
    /// first window is shown.
    pub fn open(location: CatalogLocation) -> AppResult<Host> {
        let catalog = CatalogService::open(location)?;
        let globals = catalog.settings_load()?.unwrap_or_default();
        let mut play = MatchService::new();

        if let Some(resumed) = catalog.resume_open_play()? {
            tracing::info!(play = %resumed.id(), "resuming the open play");
            play.adopt(resumed)?;
        }

        let flags = FlagService::new(globals);
        play.set_live_settings(flags.live());
        let mut health = HealthState::default();
        health.inputs.search_ok = true;

        Ok(Host {
            catalog,
            flags,
            play,
            presentation: PresentationService::new(),
            display: StageDisplay::new(),
            health,
            last_emitted: None,
        })
    }

    /// The §2.16 runtime flags, built fresh at the call site. `FlagService`
    /// stores none of them, because a stored copy is the drift §2.16 forbids.
    pub fn runtime(&self) -> RuntimeContext {
        RuntimeContext::of(&self.play, self.presentation.overlay_busy())
    }

    pub fn overlays_enabled(&self) -> bool {
        self.flags.control().overlay_animations_enabled
    }

    /// Run one Play-writing command and do everything that always follows it:
    /// let `PresentationService` see the cause, and persist if the log grew.
    ///
    /// Persist-if-grown is the whole reason the show loop never touches disk.
    /// The 100ms tick goes through here too, and appends nothing 999 times out
    /// of 1000 — the T=0 table is the exception, and that one *should* cost an
    /// fsync.
    pub fn write<T>(
        &mut self,
        now_ms: u64,
        command: impl FnOnce(&mut Host) -> AppResult<T>,
    ) -> AppResult<T> {
        let before = self.game_state(now_ms);
        let seq_before = self.event_count();

        let out = command(self)?;

        let after = self.game_state(now_ms);
        if let (Some(before), Some(after)) = (&before, &after) {
            let enabled = self.overlays_enabled();
            self.presentation.observe(before, after, enabled);
        }

        if self.event_count() > seq_before
            && let Some(play) = self.play.get_state()
        {
            // A failed save is a health finding until a save succeeds; the
            // command still fails so the operator hears about it now too.
            match self.catalog.play_persist(play) {
                Ok(()) => self.health.inputs.last_persist_error = None,
                Err(error) => {
                    self.health.inputs.last_persist_error = Some(error.to_string());
                    return Err(error.into());
                }
            }
        }
        Ok(out)
    }

    fn event_count(&self) -> usize {
        self.play.get_state().map_or(0, |p| p.events().len())
    }

    fn game_state(&self, now_ms: u64) -> Option<StageGameState> {
        self.play.get_state().map(|play| project(play, now_ms))
    }

    /// What `stage` receives: the game half plus the presentation half, and
    /// nothing else. A leak here is a leak on camera (§5.7).
    ///
    /// **Never optional.** With no Play loaded — before the first load, and
    /// after `play_unload` — the game half is `stage::empty_game()`: the idle
    /// screen with no roster and no board. Stage is a surface on a display,
    /// not a view of a Play; leaving it unaddressed between shows is what
    /// makes it go on drawing the game that ended.
    pub fn stage_state(&self, now_ms: u64) -> PlayStateForStage {
        let game = self
            .game_state(now_ms)
            .unwrap_or_else(questiongame_host::stage::empty_game);
        self.presentation.play_state(
            game,
            self.flags.reveal_modes(),
            self.overlays_enabled(),
            self.flags.audio(),
        )
    }

    /// What `main` receives: the same state plus the operator half — the
    /// affordances Control has to draw, none of which Stage may see.
    ///
    /// The event **log** is deliberately not in here. Timeline reads it with a
    /// command; shipping it ten times a second would put the whole history on
    /// the wire for a countdown.
    pub fn main_state(&self, now_ms: u64) -> Option<PlayStateForMain> {
        let play = self.play.get_state()?;
        let stage = self.stage_state(now_ms);
        Some(PlayStateForMain {
            operator: OperatorState::of(self, play),
            stage,
        })
    }

    /// True when the emission changed since the last one — the tick's gate.
    pub fn emission_changed(&mut self, next: &PlayStateForStage) -> bool {
        if self.last_emitted.as_ref() == Some(next) {
            return false;
        }
        self.last_emitted = Some(next.clone());
        true
    }
}

/// What the app crate knows about the machine and the Stage window, kept for
/// `health::check` (§12.6). Nothing here is Play state; a report is a pure
/// function of these inputs, emitted only when it changed.
#[derive(Debug, Default)]
pub struct HealthState {
    pub inputs: HealthInputs,
    last_report: Option<HealthReport>,
}

impl HealthState {
    /// Stage announced itself with a contract version.
    pub fn stage_ready(&mut self, contract_version: u32) {
        self.inputs.stage_ready = true;
        self.inputs.stage_contract_version = Some(contract_version);
    }

    /// Stage could not load a cue file. One entry per key.
    pub fn missing_cue(&mut self, cue: CueKey, file: String) {
        self.inputs.missing_cues.retain(|(k, _)| *k != cue);
        self.inputs.missing_cues.push((cue, file));
    }

    /// The current report, and whether it differs from the last one handed
    /// out — the tick emits only on a change, so an idle app is silent.
    pub fn report(
        &mut self,
        stage_window_exists: bool,
        free_bytes: Option<u64>,
    ) -> (HealthReport, bool) {
        self.inputs.stage_window_exists = stage_window_exists;
        self.inputs.free_bytes = free_bytes;
        let report = health::check(&self.inputs);
        let changed = self.last_report.as_ref() != Some(&report);
        self.last_report = Some(report.clone());
        (report, changed)
    }

    pub fn last(&self) -> Option<&HealthReport> {
        self.last_report.as_ref()
    }
}

/// The operator half of `play-state`. Everything here is derived from the Play
/// and the settings document; nothing is stored twice.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperatorState {
    /// The recipe this Play runs, so Studio can name it in the top bar and
    /// freeze its Game page. Snapshot truth, not a lookup.
    pub recipe_id: RecipeId,
    /// Who may receive the token right now (§5.4). The Action Panel greys the
    /// rest rather than letting the host refuse a click.
    pub legal_token_targets: Vec<TeamId>,
    /// What the Action Panel arms by default. A default, not a rule.
    pub default_next_team_id: Option<TeamId>,
    pub consecutive_correct: u32,
    /// One team: legal, and warned about (§4.3).
    pub is_rehearsal: bool,
    pub can_undo: bool,
    pub can_redo: bool,
    /// Timeline length, without the log itself.
    pub event_count: usize,
    /// §2.6: the setting decides the affordance, never whether the host obeys.
    pub show_give_token: bool,
    pub override_after_lock: OverrideAfterLock,
    /// §4.2 as data: every key that is frozen, inert or feature-off, with the
    /// reason. Computed once here instead of four times in Studio.
    pub disabled: Vec<Disabled>,
}

impl OperatorState {
    fn of(host: &Host, play: &Play) -> OperatorState {
        let ctx = host.runtime();
        OperatorState {
            recipe_id: play.snapshot().recipe_id.clone(),
            legal_token_targets: play.ring().legal_targets(),
            default_next_team_id: play.ring().default_next(),
            consecutive_correct: play.consecutive_correct(),
            is_rehearsal: play.is_rehearsal(),
            can_undo: host.play.can_undo(),
            can_redo: host.play.can_redo(),
            event_count: play.events().len(),
            show_give_token: host.flags.show_give_token(ctx),
            override_after_lock: host.play.live_settings().override_after_lock,
            disabled: host.flags.disabled(ctx),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayStateForMain {
    #[serde(flatten)]
    pub stage: PlayStateForStage,
    pub operator: OperatorState,
}

/// The Tauri-managed state. A newtype so `State<'_, AppState>` reads as one
/// thing at every call site.
pub struct AppState(Mutex<Host>);

thread_local! {
    /// How many host guards this thread is holding. Read by [`assert_unlocked`].
    static HOLDING: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };
}

/// The thread Tauri runs its event loop on, recorded once at boot.
static MAIN_THREAD: std::sync::OnceLock<std::thread::ThreadId> = std::sync::OnceLock::new();

/// Called once, from `run`'s `setup`, which Tauri runs on the event-loop thread.
pub fn mark_main_thread() {
    let _ = MAIN_THREAD.set(std::thread::current().id());
}

/// True on the thread that pumps the OS message loop.
pub fn on_main_thread() -> bool {
    MAIN_THREAD.get() == Some(&std::thread::current().id())
}

/// True while this thread holds the host lock.
pub fn host_lock_held() -> bool {
    HOLDING.with(|n| n.get() > 0)
}

/// Refuse, loudly and in dev only, to touch a window while the host lock is
/// held.
///
/// Every OS window call — creating a webview, `set_position`, `set_fullscreen`,
/// `available_monitors`, closing a window — pumps the platform message loop,
/// and pumping it dispatches whatever IPC the webview has queued. If that is
/// one of the **synchronous** commands (`get_state`, `settings_get`,
/// `health_get`, `monitors_list`, `catalog_seed_status`) it runs on this same
/// thread and calls `AppState::lock`, which is a plain non-reentrant `Mutex`.
/// The app then waits for a guard only this thread can release: no repaint, no
/// input, not even a reload, and no second thread to point at in a dump.
///
/// It cost a day to find by reading. In a debug build it is now a panic with
/// the call site on it; in release it compiles away, because a deadlock is
/// still better than killing a live show over an assertion.
#[track_caller]
pub fn assert_unlocked(what: &str) {
    debug_assert!(
        !host_lock_held(),
        "{what} was called while this thread holds the host lock —          touching a window pumps the message loop and re-enters a synchronous          command, which then waits for a lock only this thread can release.          Read the OS, drop the guard, then act."
    );
}

/// A host guard that counts itself, so [`assert_unlocked`] can tell.
pub struct HostGuard<'a>(MutexGuard<'a, Host>);

impl std::ops::Deref for HostGuard<'_> {
    type Target = Host;
    fn deref(&self) -> &Host {
        &self.0
    }
}

impl std::ops::DerefMut for HostGuard<'_> {
    fn deref_mut(&mut self) -> &mut Host {
        &mut self.0
    }
}

impl Drop for HostGuard<'_> {
    fn drop(&mut self) {
        HOLDING.with(|n| n.set(n.get().saturating_sub(1)));
    }
}

impl AppState {
    pub fn new(host: Host) -> AppState {
        AppState(Mutex::new(host))
    }

    /// A poisoned lock means a command panicked mid-write. Every write in the
    /// catalog is a transaction and every append is a whole event, so the data
    /// is consistent; recovering beats bricking the next click.
    ///
    /// # Never on the main thread
    ///
    /// The event-loop thread is the one that pumps window messages: while it
    /// waits, the app does not repaint, does not take input, and cannot even
    /// be reloaded. If it waits on *this* lock, every other command becomes a
    /// freeze of the whole application rather than a slow reply — and the
    /// operator sees a window that is still painted and completely dead.
    ///
    /// So every `#[tauri::command]` that reaches the host is `(async)`, and
    /// this asserts it: a plain command would run here on the event loop and
    /// panic in a debug build with its own name on the stack, instead of
    /// hanging the show months later. It is not about how cheap the command
    /// is — `get_state` is a projection over memory — it is about who is
    /// waiting.
    pub fn lock(&self) -> HostGuard<'_> {
        debug_assert!(
            !on_main_thread(),
            "the host lock was taken on the event-loop thread — make the              command `#[tauri::command(async)]`, or the next command to hold              this lock freezes the window instead of merely delaying a reply"
        );
        let guard = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        HOLDING.with(|n| n.set(n.get() + 1));
        HostGuard(guard)
    }
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("AppState")
    }
}

/// The lock that keeps one library to one process.
///
/// SQLite in WAL mode lets several processes open the same file, so nothing
/// stopped two copies of the app running at once — and a second `dev:app` on a
/// taken port still starts the binary, so it happens by accident. Both then run
/// migrations, both rebuild the projections and both reindex, and each sees a
/// snapshot the other is moving underneath it: on 2026-09-08 one instance
/// listed six teams the file did not contain and reported a play count the
/// other never saw. That is not a race to tune, it is two writers of one
/// document (§4.3's rule, one level up).
///
/// So the first process takes an exclusive OS lock on `questiongame.lock` and
/// holds it for its life; a second finds the lock held and says so. The handle
/// is deliberately leaked — dropping it would release the lock, and it should
/// last exactly as long as the process does.
pub fn take_single_instance_lock(dir: &std::path::Path) -> AppResult<()> {
    use fs4::fs_std::FileExt;

    std::fs::create_dir_all(dir).ok();
    let path = dir.join("questiongame.lock");
    let file = std::fs::OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(&path)
        .map_err(|e| AppError::Window(format!("cannot open {}: {e}", path.display())))?;

    match FileExt::try_lock_exclusive(&file) {
        Ok(true) => {
            // Held for the life of the process, on purpose.
            std::mem::forget(file);
            Ok(())
        }
        _ => Err(AppError::Window(format!(
            "questiongame is already running (its lock on {} is held).              Two copies share one library and would write over each other;              close the other window and start again.",
            path.display()
        ))),
    }
}

/// Where the catalog lives. Under the OS app-data directory, which Tauri
/// resolves — the host never builds a path.
pub fn catalog_location(app: &tauri::AppHandle) -> AppResult<CatalogLocation> {
    use tauri::Manager;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Window(format!("no app data directory: {e}")))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| AppError::Window(format!("cannot create {}: {e}", dir.display())))?;
    Ok(CatalogLocation::File(dir.join("questiongame.sqlite3")))
}

/// The user-data directory, where the catalog and everything generated live.
pub fn user_data_dir(app: &tauri::AppHandle) -> AppResult<std::path::PathBuf> {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map_err(|e| AppError::Window(format!("no app data directory: {e}")))
}

#[cfg(test)]
mod lock_discipline {
    use super::*;

    /// The counter is what `assert_unlocked` reads, so it has to be right at
    /// every depth and after every early return.
    #[test]
    fn the_guard_counts_itself_and_assert_unlocked_reads_it() {
        let state = AppState::new(Host::open(CatalogLocation::Memory).expect("in-memory host"));
        assert!(!host_lock_held());
        assert_unlocked("nothing is held");
        {
            let _guard = state.lock();
            assert!(host_lock_held(), "a guard is held and nobody noticed");
        }
        assert!(!host_lock_held(), "the guard did not release the count");
        // The assertion this whole mechanism exists for.
        let guard = state.lock();
        assert!(
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| assert_unlocked(
                "windows::ensure_stage"
            )))
            .is_err(),
            "touching a window under the lock has to be refused in a debug build"
        );
        drop(guard);
        assert!(!host_lock_held());
    }

    /// The invariant that keeps a slow command from becoming a frozen window:
    /// the event-loop thread never waits on the host lock. A plain
    /// `#[tauri::command]` would run there, so this is what catches one being
    /// added — in a test, rather than in a show.
    #[test]
    fn the_event_loop_thread_may_not_take_the_lock() {
        // A thread of our own stands in for the event loop; `ThreadId` is
        // never reused, so marking it cannot affect any other test.
        std::thread::spawn(|| {
            mark_main_thread();
            assert!(on_main_thread());
            let state =
                AppState::new(Host::open(CatalogLocation::Memory).expect("in-memory host"));
            let taken =
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| drop(state.lock())));
            assert!(
                taken.is_err(),
                "the event loop took the host lock and nothing stopped it"
            );
        })
        .join()
        .expect("the stand-in event loop");
    }
}

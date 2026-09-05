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
use questiongame_host::flags::{Disabled, FlagService, RuntimeContext};
use questiongame_host::presentation::PresentationService;
use questiongame_host::settings::OverrideAfterLock;
use questiongame_host::stage::{PlayStateForStage, StageGameState, project};
use questiongame_host::{MatchService, Play, StageDisplay, TeamId};
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

        Ok(Host {
            catalog,
            flags,
            play,
            presentation: PresentationService::new(),
            display: StageDisplay::new(),
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
            self.catalog.play_persist(play)?;
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
    pub fn stage_state(&self, now_ms: u64) -> Option<PlayStateForStage> {
        let game = self.game_state(now_ms)?;
        Some(
            self.presentation
                .play_state(game, self.flags.reveal_modes(), self.overlays_enabled()),
        )
    }

    /// What `main` receives: the same state plus the operator half — the
    /// affordances Control has to draw, none of which Stage may see.
    ///
    /// The event **log** is deliberately not in here. Timeline reads it with a
    /// command; shipping it ten times a second would put the whole history on
    /// the wire for a countdown.
    pub fn main_state(&self, now_ms: u64) -> Option<PlayStateForMain> {
        let stage = self.stage_state(now_ms)?;
        let play = self.play.get_state()?;
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

/// The operator half of `play-state`. Everything here is derived from the Play
/// and the settings document; nothing is stored twice.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperatorState {
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

impl AppState {
    pub fn new(host: Host) -> AppState {
        AppState(Mutex::new(host))
    }

    /// A poisoned lock means a command panicked mid-write. Every write in the
    /// catalog is a transaction and every append is a whole event, so the data
    /// is consistent; recovering beats bricking the next click.
    pub fn lock(&self) -> MutexGuard<'_, Host> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("AppState")
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

//! `MatchService` — the only writer of a Play (§13).
//!
//! Every command here is `(async)`: appending an event means persisting it, and
//! persisting means an fsync. The exception is `get_state`, which is a
//! projection over data already in memory.
//!
//! A Viewer click, an Action Panel button and a keyboard chord all land on the
//! same function. That is the point of the seam, not a coincidence.

use questiongame_host::{DomainId, OptionId, PlayId, RecipeId, RestartMode, TeamId};
use tauri::{AppHandle, State, WebviewWindow};

use super::play_write;
use crate::error::{AppError, AppResult};
use crate::state::{AppState, PlayStateForMain, now_ms};
use crate::{emit, guard, windows};

/// `play_load` — put a recipe into Control (§5.1).
///
/// This is where the three services compose, and the only place that order is
/// spelled: freeze the settings, build the snapshot from them, load the Play.
/// It is also **first Control Load**, which is when the Stage window is created
/// (§9) — not at boot, because there is nothing to show before this point.
#[tauri::command(async)]
pub fn play_load(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    recipe_id: RecipeId,
    play_id: PlayId,
) -> AppResult<()> {
    guard::allow(window.label(), "play_load")?;
    let now = now_ms();
    let mut host = state.lock();

    let recipe = host.catalog.recipe_get(&recipe_id)?;
    host.flags.load_recipe(recipe.settings.clone())?;
    let settings = host.flags.freeze()?;
    let snapshot = host.catalog.build_snapshot(&recipe_id, play_id, settings)?;

    host.play.play_load(snapshot, now)?;
    let live = host.flags.live();
    host.play.set_live_settings(live);
    host.presentation
        .set_decor(crate::decor::of(&recipe.layout));
    host.presentation
        .set_layout(questiongame_host::stage::StageLayoutNodes::of(&recipe.layout));

    windows::ensure_stage(&app)?;
    emit::play_state(&app, &mut host, now, true);
    Ok(())
}

#[tauri::command(async)]
pub fn play_start(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    play_write(&window, &app, &state, "play_start", |h, now| {
        Ok(h.play.play_start(now)?)
    })
}

#[tauri::command(async)]
pub fn pause(window: WebviewWindow, app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    play_write(&window, &app, &state, "pause", |h, now| {
        Ok(h.play.pause(now)?)
    })
}

#[tauri::command(async)]
pub fn resume(window: WebviewWindow, app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    play_write(&window, &app, &state, "resume", |h, now| {
        Ok(h.play.resume(now)?)
    })
}

#[tauri::command(async)]
pub fn abandon(window: WebviewWindow, app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    play_write(&window, &app, &state, "abandon", |h, now| {
        Ok(h.play.abandon(now)?)
    })
}

/// `restart` — a new Play now, on the same recipe (§2.7).
///
/// `same_questions = false` re-reads the recipe as it is now, which is the one
/// path where a catalog edit reaches a running show: by starting a new Play,
/// never by rebasing the old one (§4.3).
///
/// The closed Play is persisted before the new one opens, because it is a
/// record under the recipe (§2.8) and losing it to a crash three seconds later
/// would be losing a whole show.
#[tauri::command(async)]
pub fn restart(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    new_play_id: PlayId,
    same_questions: bool,
) -> AppResult<()> {
    guard::allow(window.label(), "restart")?;
    let now = now_ms();
    let mut host = state.lock();

    let mode = if same_questions {
        RestartMode::SameQuestions {
            new_play_id: new_play_id.clone(),
        }
    } else {
        let recipe_id = host
            .play
            .get_state()
            .map(|p| p.snapshot().recipe_id.clone())
            .ok_or(AppError::Match(questiongame_host::MatchError::NoPlay))?;
        let settings = host.flags.freeze()?;
        let snapshot = host
            .catalog
            .build_snapshot(&recipe_id, new_play_id.clone(), settings)?;
        RestartMode::DifferentQuestions {
            snapshot: Box::new(snapshot),
        }
    };

    // Through `Host::write` for the observer's sake: the play id changes, and
    // that is what empties the overlay queue — nothing enqueued for the old
    // Play should play over the new one. The two persists are explicit because
    // the new Play's log is *shorter* than the old one's, so "persist if the
    // log grew" cannot see either of them.
    host.write(now, |h| {
        let closed = h.play.restart(mode, now)?;
        h.catalog.play_persist(&closed)?;
        if let Some(open) = h.play.get_state() {
            h.catalog.play_persist(open)?;
        }
        Ok(())
    })?;
    emit::play_state(&app, &mut host, now, true);
    Ok(())
}

/// `get_state` — the projection every read surface renders. Synchronous: it is
/// a fold over data already in memory, and hopping threads would cost more than
/// the work.
#[tauri::command]
pub fn get_state(
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> AppResult<Option<PlayStateForMain>> {
    guard::allow(window.label(), "get_state")?;
    let host = state.lock();
    Ok(host.main_state(now_ms()))
}

#[tauri::command(async)]
pub fn choose_domain(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    domain_id: DomainId,
) -> AppResult<()> {
    play_write(&window, &app, &state, "choose_domain", |h, now| {
        Ok(h.play.choose_domain(&domain_id, now)?)
    })
}

/// `set_selection` — the working choice. Does not stop the timer, is not scored
/// (§2.4). It still appends an event, so it still persists: the operator's
/// clicks are part of the record.
#[tauri::command(async)]
pub fn set_selection(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    option_ids: Vec<OptionId>,
) -> AppResult<()> {
    play_write(&window, &app, &state, "set_selection", |h, now| {
        Ok(h.play.set_selection(&option_ids, now)?)
    })
}

#[tauri::command(async)]
pub fn lock_selection(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    play_write(&window, &app, &state, "lock_selection", |h, now| {
        Ok(h.play.lock_selection(now)?)
    })
}

#[tauri::command(async)]
pub fn start_timer(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    play_write(&window, &app, &state, "start_timer", |h, now| {
        Ok(h.play.start_timer(now)?)
    })
}

#[tauri::command(async)]
pub fn pause_timer(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    play_write(&window, &app, &state, "pause_timer", |h, now| {
        Ok(h.play.pause_timer(now)?)
    })
}

/// `reveal_outcome` — the only point that scores and consumes (§2.4).
#[tauri::command(async)]
pub fn reveal_outcome(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    play_write(&window, &app, &state, "reveal_outcome", |h, now| {
        Ok(h.play.reveal_outcome(now)?)
    })
}

#[tauri::command(async)]
pub fn give_token(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    team_id: TeamId,
) -> AppResult<()> {
    play_write(&window, &app, &state, "give_token", |h, now| {
        Ok(h.play.give_token(&team_id, now)?)
    })
}

/// §2.6's two-click **Reveal & pass**, atomic: an illegal target is refused
/// before anything is revealed.
#[tauri::command(async)]
pub fn reveal_and_pass(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    team_id: TeamId,
) -> AppResult<()> {
    play_write(&window, &app, &state, "reveal_and_pass", |h, now| {
        Ok(h.play.reveal_and_pass(&team_id, now)?)
    })
}

#[tauri::command(async)]
pub fn reorder_ring(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    order: Vec<TeamId>,
) -> AppResult<()> {
    play_write(&window, &app, &state, "reorder_ring", |h, now| {
        Ok(h.play.reorder_ring(order, now)?)
    })
}

#[tauri::command(async)]
pub fn undo_turn(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    play_write(&window, &app, &state, "undo_turn", |h, now| {
        Ok(h.play.undo_turn(now)?)
    })
}

#[tauri::command(async)]
pub fn redo_turn(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    play_write(&window, &app, &state, "redo_turn", |h, now| {
        Ok(h.play.redo_turn(now)?)
    })
}

/// The Timeline's rows (§5.8). A command rather than a field of `play-state`:
/// the log grows for the life of a show, and shipping it ten times a second
/// would put the whole history on the wire for a countdown.
#[tauri::command(async)]
pub fn play_events(
    window: WebviewWindow,
    state: State<'_, AppState>,
    play_id: PlayId,
) -> AppResult<Vec<questiongame_host::Event>> {
    guard::allow(window.label(), "play_events")?;
    let host = state.lock();
    Ok(host.catalog.play_events(&play_id)?)
}

/// Play records under a recipe (§2.8). `None` lists every Play.
#[tauri::command(async)]
pub fn play_list(
    window: WebviewWindow,
    state: State<'_, AppState>,
    recipe_id: Option<RecipeId>,
) -> AppResult<Vec<questiongame_host::catalog::PlayRecord>> {
    guard::allow(window.label(), "play_list")?;
    let host = state.lock();
    Ok(host.catalog.play_list(recipe_id.as_ref())?)
}

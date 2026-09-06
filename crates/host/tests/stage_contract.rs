//! The Rust projection against the TypeScript contract, using the P1 fixtures
//! as the shared reference.
//!
//! P6's exit criterion is "every P1 fixture is reproducible as a real
//! `play-state` emission". P4 bought most of it early by checking the game half
//! alone; now that `PresentationService` exists the **whole** emission is
//! checked, and there is no key either side may be missing.
//!
//! It compares **shape**, not values — the fixtures are authored scenarios, not
//! recordings of this engine. `PRESENTATION_KEYS` is still named here, because
//! [`project`] on its own must keep emitting exactly the game half: that split
//! is what lets the 100ms tick re-project without touching the overlay queue.

mod support;

use std::path::PathBuf;

use questiongame_host::presentation::PresentationService;
use questiongame_host::settings::{FrozenSettings, RevealSettings};
use questiongame_host::stage::{CONTRACT_VERSION, StageScreen, project};
use questiongame_host::{MatchService, OverlayRequest, PlayStatus};
use serde_json::Value;
use support::*;

/// Owned by `PresentationService`, merged into the emission.
const PRESENTATION_KEYS: [&str; 5] = ["currentScreen", "decor", "layout", "overlay", "revealModes"];

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures")
}

fn fixture(name: &str) -> Value {
    let path = fixtures_dir().join(format!("{name}.json"));
    let body = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("{} is readable: {e}", path.display()));
    serde_json::from_str(&body).expect("fixture is JSON")
}

fn fixture_names() -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(fixtures_dir())
        .expect("fixtures/ exists")
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            if path.extension()? != "json" {
                return None;
            }
            let stem = path.file_stem()?.to_str()?.to_owned();
            (stem != "index").then_some(stem)
        })
        .collect();
    names.sort();
    names
}

/// Same keys, same JSON kinds, recursively. A `null` on either side ends the
/// walk: nullable fields (`logoUrl`, `session`, `timer`, `outcome`) are legal
/// on both sides and carry no shape of their own.
fn assert_same_shape(ours: &Value, theirs: &Value, path: &str) {
    match (ours, theirs) {
        (Value::Null, _) | (_, Value::Null) => {}
        (Value::Object(a), Value::Object(b)) => {
            let mut ours_keys: Vec<&String> = a.keys().collect();
            let mut theirs_keys: Vec<&String> = b.keys().collect();
            ours_keys.sort();
            theirs_keys.sort();
            assert_eq!(ours_keys, theirs_keys, "keys differ at {path}");
            for (key, value) in a {
                assert_same_shape(value, &b[key], &format!("{path}.{key}"));
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            if let (Some(first_ours), Some(first_theirs)) = (a.first(), b.first()) {
                assert_same_shape(first_ours, first_theirs, &format!("{path}[]"));
            }
        }
        (Value::Number(_), Value::Number(_))
        | (Value::String(_), Value::String(_))
        | (Value::Bool(_), Value::Bool(_)) => {}
        _ => panic!("kind differs at {path}: host {ours:?} vs fixture {theirs:?}",),
    }
}

/// A Play driven far enough to exercise every nested shape at once.
fn played(with_session: bool) -> MatchService {
    let mut service = started(snapshot(4, 3, 3, FrozenSettings::default()));
    if with_session {
        service.choose_domain(&domain_id(0), 100).unwrap();
        service.reveal_stem(110).unwrap();
        service.reveal_next_option(120).unwrap();
        service.start_timer(130).unwrap();
        answer_correctly(&mut service, 5_000);
        service.reveal_leaderboard_rank(4, 6_000).unwrap();
    }
    service
}

/// The game half alone — what the 100ms tick re-projects.
fn projected(with_session: bool) -> Value {
    let service = played(with_session);
    let play = service.get_state().unwrap();
    serde_json::to_value(project(play, 10_000)).expect("the projection serializes")
}

/// The whole emission, exactly as the app crate builds it for `stage`.
fn emitted(with_session: bool) -> Value {
    let service = played(with_session);
    let mut presentation = PresentationService::new();
    presentation
        .show_screen(StageScreen::Question, Some(PlayStatus::Playing))
        .unwrap();
    let game = project(service.get_state().unwrap(), 10_000);
    let state = presentation.play_state(game, RevealSettings::default(), true);
    serde_json::to_value(state).expect("the emission serializes")
}

/// The P6 exit criterion as an assertion: no fixture carries a key the host
/// cannot produce, and the host produces no key a fixture does not know.
#[test]
fn every_fixture_is_reproducible_as_a_real_emission() {
    let ours = emitted(true);
    let ours = ours.as_object().expect("an object");

    for name in fixture_names() {
        let theirs = fixture(&name);
        let theirs = theirs.as_object().expect("an object");

        let mut missing: Vec<&str> = theirs
            .keys()
            .map(String::as_str)
            .filter(|key| !ours.contains_key(*key))
            .collect();
        missing.sort();
        assert!(
            missing.is_empty(),
            "{name}: the host cannot emit {missing:?}"
        );

        let extra: Vec<&str> = ours
            .keys()
            .map(String::as_str)
            .filter(|key| !theirs.contains_key(*key))
            .collect();
        assert!(
            extra.is_empty(),
            "{name}: the host emits unknown keys {extra:?}"
        );
    }
}

/// The overlay union is a wire format in both directions: `show_overlay` takes
/// one from Studio, and Stage reads one back out of every emission.
#[test]
fn the_presentation_half_matches_the_fixtures_shape_for_shape() {
    let ours = emitted(true);

    for name in fixture_names() {
        let theirs = fixture(&name);
        for key in ["currentScreen", "decor", "revealModes"] {
            assert_same_shape(&ours[key], &theirs[key], &format!("{name}.{key}"));
        }
        assert_same_shape(
            &ours["overlay"]["busy"],
            &theirs["overlay"]["busy"],
            &format!("{name}.overlay.busy"),
        );

        let active = &theirs["overlay"]["active"];
        if active.is_null() {
            continue;
        }
        let parsed: OverlayRequest = serde_json::from_value(active.clone())
            .unwrap_or_else(|e| panic!("{name}: the host cannot read its own overlay: {e}"));
        assert_eq!(
            serde_json::to_value(&parsed).unwrap(),
            *active,
            "{name}: the overlay union round-trips",
        );
    }
}

/// `project` alone stays the game half. The tick re-projects it a hundred times
/// a minute and must not go near the queue, so the split has to hold.
#[test]
fn the_game_projection_is_still_only_the_game_half() {
    let ours = projected(true);
    let ours = ours.as_object().expect("an object");

    for name in fixture_names() {
        let theirs = fixture(&name);
        let theirs = theirs.as_object().expect("an object");

        let mut missing: Vec<&str> = theirs
            .keys()
            .map(String::as_str)
            .filter(|key| !ours.contains_key(*key))
            .collect();
        missing.sort();
        assert_eq!(
            missing, PRESENTATION_KEYS,
            "{name}: `project` must emit every key except the presentation half",
        );

        let extra: Vec<&str> = ours
            .keys()
            .map(String::as_str)
            .filter(|key| !theirs.contains_key(*key))
            .collect();
        assert!(
            extra.is_empty(),
            "{name}: the host emits unknown keys {extra:?}"
        );
    }
}

#[test]
fn the_game_half_has_the_same_shape_as_the_fixtures() {
    // A fixture with a live session, a timer and an outcome exercises every
    // nested shape at once.
    let ours = projected(true);
    let theirs = fixture("question-outcome-correct");
    for (key, value) in ours.as_object().expect("an object") {
        assert_same_shape(value, &theirs[key], key);
    }

    // And one with no session at all, so `session: null` is legal both ways.
    let idle = projected(false);
    assert!(idle["session"].is_null());
    assert_same_shape(&idle["teams"], &fixture("idle")["teams"], "teams");
}

/// `StageScreen::key` and the serde name are one string in `packages/contract`,
/// and every fixture names a screen this host knows.
#[test]
fn the_screen_names_match_the_contract() {
    let screens: Vec<String> = StageScreen::ALL
        .iter()
        .map(|s| {
            serde_json::to_value(s)
                .unwrap()
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect();
    let keys: Vec<String> = StageScreen::ALL
        .iter()
        .map(|s| s.key().to_owned())
        .collect();
    assert_eq!(screens, keys);

    for name in fixture_names() {
        let screen = fixture(&name)["currentScreen"]
            .as_str()
            .expect("every fixture names a screen")
            .to_owned();
        assert!(screens.contains(&screen), "{name}: unknown screen {screen}");
    }
}

#[test]
fn the_contract_version_matches_every_fixture() {
    for name in fixture_names() {
        assert_eq!(
            fixture(&name)["contractVersion"].as_u64(),
            Some(u64::from(CONTRACT_VERSION)),
            "{name}: bump stage::CONTRACT_VERSION with packages/contract",
        );
    }
}

#[test]
fn the_status_and_verdict_words_match_the_contract() {
    let ours = projected(true);
    assert_eq!(ours["status"], Value::String("playing".into()));
    assert_eq!(
        ours["session"]["outcome"]["verdict"],
        Value::String("correct".into()),
    );
    assert_eq!(
        ours["session"]["answerMode"],
        Value::String("single".into()),
    );
}

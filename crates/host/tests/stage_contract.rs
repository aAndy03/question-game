//! The Rust projection against the TypeScript contract, using the P1 fixtures
//! as the shared reference.
//!
//! P6's exit criterion is "every P1 fixture is reproducible as a real
//! `play-state` emission". This test buys most of that early and cheaply: if a
//! field is renamed on either side, or `CONTRACT_VERSION` moves, a Rust test
//! fails now rather than a Stage screen going blank in three phases' time.
//!
//! It compares **shape**, not values — the fixtures are authored scenarios, not
//! recordings of this engine. The only keys the host is allowed to be missing
//! are the presentation half, which `PresentationService` merges at P6.

mod support;

use std::path::PathBuf;

use questiongame_host::settings::FrozenSettings;
use questiongame_host::stage::{CONTRACT_VERSION, project};
use serde_json::Value;
use support::*;

/// Owned by `PresentationService`, merged into the emission at P6.
const PRESENTATION_KEYS: [&str; 4] = ["currentScreen", "decor", "overlay", "revealModes"];

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

fn projected(with_session: bool) -> Value {
    let mut service = started(snapshot(4, 3, 3, FrozenSettings::default()));
    if with_session {
        service.choose_domain(&domain_id(0), 100).unwrap();
        service.reveal_stem(110).unwrap();
        service.reveal_next_option(120).unwrap();
        service.start_timer(130).unwrap();
        answer_correctly(&mut service, 5_000);
        service.reveal_leaderboard_rank(4, 6_000).unwrap();
    }
    let play = service.get_state().unwrap();
    serde_json::to_value(project(play, 10_000)).expect("the projection serializes")
}

#[test]
fn the_host_emits_every_game_key_the_fixtures_carry() {
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
            "{name}: the host must emit every key except the presentation half",
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

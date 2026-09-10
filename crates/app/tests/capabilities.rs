//! Every window this app creates must match a capability.
//!
//! Tauri gives a webview whose label matches **no** capability *no core
//! permissions at all* — and it does so silently. The window builds, renders,
//! and can still call this app's own commands (`generate_handler!` registers
//! those for every webview, which is why `guard::allow` exists). What it
//! cannot do is `listen`, so it never receives `play-state`, never receives
//! `play-tick`, and draws `EMPTY_PLAY_STATE` — the Idle screen — for the whole
//! show.
//!
//! That is not a hypothetical. `audience.json` scoped to the exact label
//! `"stage"`, so when P11.11 added `stage-2` the mirror displays sat on Idle
//! while the pacer played the game, and the `stats` window had never had a
//! capability at all. Both were found on a desk, not in a test, and the log
//! said it in one line: `stage_ready` twenty-two times from `stage` and zero
//! times from `stage-2`, because the call sits after `listen` in the same
//! block.
//!
//! So: the labels are enumerated here, and this fails if one is uncovered.

use std::collections::BTreeMap;

/// Every webview label `crates/app/src/windows.rs` can create.
///
/// `stage-2` and `stage-3` stand in for the mirrors — `mirror_label(n)` is
/// `stage-{n+2}` and there is no upper bound, so the glob is what has to
/// cover them, not an entry each.
const LABELS: [&str; 5] = ["main", "stage", "stage-2", "stage-3", "stats"];

#[derive(serde::Deserialize)]
struct Capability {
    identifier: String,
    windows: Vec<String>,
    permissions: Vec<String>,
}

fn capabilities() -> Vec<Capability> {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).expect("capabilities/ exists") {
        let path = entry.expect("readable entry").path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let text = std::fs::read_to_string(&path).expect("readable capability");
        out.push(
            serde_json::from_str::<Capability>(&text)
                .unwrap_or_else(|e| panic!("{} is not a capability: {e}", path.display())),
        );
    }
    assert!(!out.is_empty(), "capabilities/ has no capability in it");
    out
}

/// The same match Tauri makes: a glob over the label.
fn matches(pattern: &str, label: &str) -> bool {
    match pattern.split_once('*') {
        None => pattern == label,
        Some((head, tail)) => {
            label.len() >= head.len() + tail.len()
                && label.starts_with(head)
                && label.ends_with(tail)
        }
    }
}

#[test]
fn every_window_this_app_creates_matches_a_capability() {
    let caps = capabilities();
    let mut uncovered = Vec::new();
    for label in LABELS {
        if !caps
            .iter()
            .any(|c| c.windows.iter().any(|w| matches(w, label)))
        {
            uncovered.push(label);
        }
    }
    assert!(
        uncovered.is_empty(),
        "these labels match no capability, so Tauri gives them no core permissions \
         and their `listen` is denied silently: {uncovered:?}"
    );
}

/// A window that draws a Play has to be able to hear about one.
#[test]
fn every_window_that_draws_a_play_may_listen() {
    let caps = capabilities();
    for label in ["main", "stage", "stage-2", "stage-3", "stats"] {
        let permissions: Vec<&str> = caps
            .iter()
            .filter(|c| c.windows.iter().any(|w| matches(w, label)))
            .flat_map(|c| c.permissions.iter().map(String::as_str))
            .collect();
        assert!(
            permissions
                .iter()
                .any(|p| *p == "core:event:allow-listen" || *p == "core:default"),
            "{label} cannot listen, so it would draw the empty play-state for ever; it has {permissions:?}"
        );
    }
}

/// Stage is a projection (§5.7). The audience capability is the one place a
/// core verb could be handed to a surface nobody may touch, so it is pinned.
#[test]
fn the_audience_gets_events_and_nothing_else() {
    let caps = capabilities();
    let audience = caps
        .iter()
        .find(|c| c.identifier == "audience")
        .expect("an audience capability");
    assert_eq!(
        audience.permissions,
        ["core:event:allow-listen", "core:event:allow-unlisten"],
        "no window, path or webview verbs reach a surface the audience is looking at"
    );
    assert!(
        audience.windows.iter().any(|w| matches(w, "stage")),
        "the pacer"
    );
    assert!(
        audience.windows.iter().any(|w| matches(w, "stage-2")),
        "and its mirrors (P11.11)"
    );
    assert!(
        !audience.windows.iter().any(|w| matches(w, "main")),
        "never Studio: it has its own capability and its own permissions"
    );
}

/// One identifier per file, and no two capabilities claiming the same name —
/// Tauri takes the last one it reads, which is a silent way to lose a grant.
#[test]
fn identifiers_are_unique() {
    let mut seen: BTreeMap<String, usize> = BTreeMap::new();
    for cap in capabilities() {
        *seen.entry(cap.identifier).or_default() += 1;
    }
    let duplicated: Vec<_> = seen.iter().filter(|(_, n)| **n > 1).collect();
    assert!(duplicated.is_empty(), "duplicated identifiers: {duplicated:?}");
}

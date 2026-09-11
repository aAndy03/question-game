//! The two identities live in two config files and one constant module; this
//! holds the three together (P12.1).

use std::path::Path;

use questiongame_app::identity::{DEV_IDENTIFIER, RELEASE_IDENTIFIER};

fn json(rel: &str) -> serde_json::Value {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(rel);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

#[test]
fn the_base_config_is_the_installed_app() {
    assert_eq!(json("tauri.conf.json")["identifier"], RELEASE_IDENTIFIER);
}

#[test]
fn the_dev_overlay_changes_the_identity_and_nothing_else() {
    let overlay = json("tauri.dev.conf.json");
    let keys: Vec<&String> = overlay.as_object().expect("an object").keys().collect();
    assert_eq!(keys, vec!["identifier"]);
    assert_eq!(overlay["identifier"], DEV_IDENTIFIER);
}

#[test]
fn the_two_identities_are_two_sibling_folders() {
    assert_ne!(DEV_IDENTIFIER, RELEASE_IDENTIFIER);
    for id in [DEV_IDENTIFIER, RELEASE_IDENTIFIER] {
        assert!(!id.contains(['/', '\\']), "{id} is a folder name, not a path");
    }
}

#[test]
fn npm_run_dev_app_passes_the_overlay() {
    let pkg = json("../../package.json");
    let script = pkg["scripts"]["dev:app"].as_str().expect("a dev:app script");
    assert!(script.contains("--config crates/app/tauri.dev.conf.json"), "{script}");
}

//! The three identities live in three config files and one constant module;
//! this holds them together (P12.1, P12.14).

use std::path::Path;

use questiongame_app::identity::{DEV_IDENTIFIER, E2E_IDENTIFIER, RELEASE_IDENTIFIER};

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
fn the_identities_are_sibling_folders_that_never_meet() {
    assert_ne!(DEV_IDENTIFIER, RELEASE_IDENTIFIER);
    assert_ne!(E2E_IDENTIFIER, RELEASE_IDENTIFIER);
    assert_ne!(E2E_IDENTIFIER, DEV_IDENTIFIER);
    for id in [DEV_IDENTIFIER, RELEASE_IDENTIFIER, E2E_IDENTIFIER] {
        assert!(!id.contains(['/', '\\']), "{id} is a folder name, not a path");
    }
}

#[test]
fn npm_run_dev_app_passes_the_overlay() {
    let pkg = json("../../package.json");
    let script = pkg["scripts"]["dev:app"].as_str().expect("a dev:app script");
    assert!(script.contains("--config crates/app/tauri.dev.conf.json"), "{script}");
}

/// P12.14. The end-to-end suite drives a built app; its library, log and
/// WebView2 profile must be a folder no person's show lives in.
#[test]
fn the_e2e_overlay_changes_the_identity_and_nothing_else() {
    let overlay = json("tauri.e2e.conf.json");
    let keys: Vec<&String> = overlay.as_object().expect("an object").keys().collect();
    assert_eq!(keys, vec!["identifier"]);
    assert_eq!(overlay["identifier"], E2E_IDENTIFIER);
}

#[test]
fn npm_run_e2e_build_passes_the_e2e_overlay() {
    let pkg = json("../../package.json");
    let script = pkg["scripts"]["e2e:build"].as_str().expect("an e2e:build script");
    assert!(script.contains("--config crates/app/tauri.e2e.conf.json"), "{script}");
    assert!(script.contains("--no-bundle"), "an e2e build is never an installer: {script}");
}

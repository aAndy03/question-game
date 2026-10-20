//! The three identities live in three config files and one constant module;
//! this holds them together (P12.1, P12.14).

use std::path::Path;

use questiongame_app::identity::{BETA_IDENTIFIER, DEV_IDENTIFIER, E2E_IDENTIFIER, RELEASE_IDENTIFIER};

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

/// ID11, ID14, ID16 (P13.1): questiongame Beta changes who it is, what it is
/// called and its icons — nothing else, so it builds exactly as stable does.
#[test]
fn the_beta_overlay_changes_identity_name_and_icons_only() {
    let overlay = json("tauri.beta.conf.json");
    let mut keys: Vec<&String> = overlay.as_object().expect("an object").keys().collect();
    keys.sort();
    assert_eq!(keys, ["bundle", "identifier", "productName"]);
    let bundle: Vec<&String> = overlay["bundle"].as_object().expect("a bundle").keys().collect();
    assert_eq!(bundle, ["icon"]);
    assert_eq!(overlay["identifier"], BETA_IDENTIFIER);
    assert_eq!(overlay["productName"], "questiongame Beta");

    let dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let beta: Vec<&str> = overlay["bundle"]["icon"].as_array().unwrap().iter().filter_map(|v| v.as_str()).collect();
    let stable_config = json("tauri.conf.json");
    let stable: Vec<&str> = stable_config["bundle"]["icon"].as_array().unwrap().iter().filter_map(|v| v.as_str()).collect();
    assert_eq!(beta.len(), stable.len(), "one Beta icon per stable icon");
    for (b, s) in beta.iter().zip(&stable) {
        assert!(b.starts_with("icons/beta/"), "{b}");
        assert_eq!(Path::new(b).file_name(), Path::new(s).file_name(), "{b} replaces {s}");
        let (bb, sb) = (std::fs::read(dir.join(b)).expect(b), std::fs::read(dir.join(s)).expect(s));
        assert_ne!(bb, sb, "{b} carries the badge");
        if b.ends_with(".png") {
            assert_eq!(png_size(&bb), png_size(&sb), "{b} is the size of {s}");
        }
    }
    // ID16: nothing else in the base config names an icon the overlay would miss.
    let text = std::fs::read_to_string(dir.join("tauri.conf.json")).unwrap();
    for key in ["installerIcon", "sidebarImage", "headerImage"] {
        assert!(!text.contains(key), "{key} would keep the stable art in the Beta installer");
    }
}

/// ID15: the 32 px Beta icon is not blank.
#[test]
fn the_small_beta_icon_is_drawn() {
    let png = std::fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("icons/beta/32x32.png")).unwrap();
    assert_eq!(png_size(&png), (32, 32));
    assert!(png.len() > 400, "a 32 px icon with a badge is more than an empty frame");
}

fn png_size(png: &[u8]) -> (u32, u32) {
    assert_eq!(&png[1..4], b"PNG");
    (u32::from_be_bytes(png[16..20].try_into().unwrap()), u32::from_be_bytes(png[20..24].try_into().unwrap()))
}

/// ID17: the Beta installer has a command, and it is an installer.
#[test]
fn npm_run_build_beta_passes_the_beta_overlay() {
    let pkg = json("../../package.json");
    let script = pkg["scripts"]["build:beta"].as_str().expect("a build:beta script");
    assert!(script.contains("--config crates/app/tauri.beta.conf.json"), "{script}");
    assert!(!script.contains("--no-bundle"), "{script}");
}

/// ID20: macOS's overlay still decides nothing about who the app is.
#[test]
fn the_macos_overlay_names_no_identity() {
    let mac = json("tauri.macos.conf.json");
    assert!(mac.get("identifier").is_none() && mac.get("productName").is_none());
}

/// ID18, REG11: stable and Beta each hold their own lock, at the same time.
#[test]
fn stable_and_beta_lock_their_own_folders() {
    let base = std::env::temp_dir().join(format!("qg-locks-{}", std::process::id()));
    let stable = base.join(RELEASE_IDENTIFIER);
    let beta = base.join(BETA_IDENTIFIER);
    questiongame_app::state::take_single_instance_lock(&stable).expect("stable's lock");
    questiongame_app::state::take_single_instance_lock(&beta).expect("Beta's lock, while stable holds its own");
    assert!(questiongame_app::state::take_single_instance_lock(&beta).is_err(), "one process per folder");
}

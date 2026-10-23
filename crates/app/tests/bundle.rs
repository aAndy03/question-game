//! What `tauri build` ships (P12.2): one per-user Windows installer, a macOS
//! bundle prepared for later, and one version number in three files.

use std::path::Path;

fn json(rel: &str) -> serde_json::Value {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(rel);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

/// `[workspace.package] version = "…"` from the root manifest, without a TOML
/// crate: the table header, then its `version` line.
fn workspace_version() -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../Cargo.toml");
    let text = std::fs::read_to_string(path).expect("root Cargo.toml");
    let mut in_package = false;
    for line in text.lines().map(str::trim) {
        if line.starts_with('[') {
            in_package = line == "[workspace.package]";
            continue;
        }
        if in_package && let Some(rest) = line.strip_prefix("version") {
            return rest.trim_start().trim_start_matches('=').trim().trim_matches('"').to_string();
        }
    }
    panic!("no [workspace.package] version");
}

#[test]
fn one_version_in_three_files() {
    let version = workspace_version();
    assert_eq!(version, "2.0.0-beta.6");
    assert_eq!(env!("CARGO_PKG_VERSION"), version);
    assert_eq!(json("tauri.conf.json")["version"], version.as_str());
    assert_eq!(json("../../package.json")["version"], version.as_str());
}

#[test]
fn windows_ships_one_per_user_installer() {
    let config = json("tauri.conf.json");
    let bundle = &config["bundle"];
    assert_eq!(bundle["targets"], serde_json::json!(["nsis"]));
    assert_eq!(bundle["windows"]["nsis"]["installMode"], "currentUser");
    assert_eq!(bundle["licenseFile"], "installer/LICENSE.txt");
    assert!(bundle["publisher"].as_str().is_some_and(|s| !s.is_empty()));
    let copyright = bundle["copyright"].as_str().unwrap_or_default();
    assert!(copyright.contains("GPL-3.0-or-later"), "{copyright}");
    assert!(copyright.contains("Andy (aAndy03)") && copyright.contains("Darius"), "both co-founders: {copyright}");
}

/// The installer's licence page names the co-founders, then shows the GPL
/// exactly as `LICENSE` has it — the two cannot drift apart.
#[test]
fn the_installer_licence_credits_both_founders_and_carries_the_gpl_verbatim() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let page = std::fs::read_to_string(dir.join("installer/LICENSE.txt")).unwrap().replace("\r\n", "\n");
    let gpl = std::fs::read_to_string(dir.join("../../LICENSE")).unwrap().replace("\r\n", "\n");
    assert!(page.starts_with("questiongame\nCreated by Darius and Andy (aAndy03), co-founders."), "{}", &page[..80]);
    assert!(page.ends_with(&gpl), "the GPL text follows unchanged");
}

#[test]
fn macos_is_prepared_and_does_not_change_who_the_app_is() {
    let mac = json("tauri.macos.conf.json");
    assert_eq!(mac["bundle"]["targets"], serde_json::json!(["app", "dmg"]));
    assert_eq!(mac["bundle"]["macOS"]["minimumSystemVersion"], "13.0");
    assert_eq!(mac["bundle"]["macOS"]["signingIdentity"], "-");
    assert!(mac.get("identifier").is_none());
}

#[test]
fn every_listed_icon_exists() {
    let config = json("tauri.conf.json");
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let listed: Vec<&str> = config["bundle"]["icon"].as_array().expect("an icon list").iter().filter_map(|v| v.as_str()).collect();
    assert!(listed.contains(&"icons/icon.icns"), "macOS needs the .icns: {listed:?}");
    assert!(listed.contains(&"icons/icon.ico"), "Windows needs the .ico: {listed:?}");
    for icon in config["bundle"]["icon"].as_array().expect("an icon list") {
        let rel = icon.as_str().expect("a path");
        assert!(dir.join(rel).is_file(), "{rel} is listed but missing");
    }
}

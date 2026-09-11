//! Which app this binary is — the dev build or the installed one (P12.1).
//!
//! Tauri names every per-app folder after the identifier: the library, the
//! log, the lock, the WebView2 profile, and what the Windows uninstaller's
//! *Delete the application data* box removes. One identifier for both builds
//! meant an installed release would open the dev library, and uninstalling it
//! would delete it. So there are two, and a binary that carries the wrong one
//! for what it is refuses to start rather than open the other's folders.

/// `npm run dev:app` (`crates/app/tauri.dev.conf.json`). The folder the dev
/// library has lived in since P5, kept so nothing on disk moves.
pub const DEV_IDENTIFIER: &str = "org.questiongame.app";
/// The installed app (`crates/app/tauri.conf.json`).
pub const RELEASE_IDENTIFIER: &str = "org.questiongame.desktop";

/// `is_dev` is `tauri::is_dev()`: the frontend comes from `devUrl` rather than
/// being embedded — Tauri's own line between the two builds.
pub fn check(is_dev: bool, identifier: &str) -> Result<(), String> {
    match (is_dev, identifier) {
        (true, DEV_IDENTIFIER) | (false, RELEASE_IDENTIFIER) => Ok(()),
        (true, RELEASE_IDENTIFIER) => Err(format!(
            "This dev build carries the installed app's identity ({RELEASE_IDENTIFIER}), \
             so it would open the installed app's library. Start it with `npm run dev:app`."
        )),
        (false, DEV_IDENTIFIER) => Err(format!(
            "This release build carries the dev identity ({DEV_IDENTIFIER}), \
             so it would open the dev library. Build it with `npm run release`."
        )),
        (_, other) => Err(format!(
            "Unknown app identity `{other}`: expected {DEV_IDENTIFIER} (dev) or {RELEASE_IDENTIFIER} (release)."
        )),
    }
}

/// What the performance log and Settings ▸ About call this build.
pub fn build_label(is_dev: bool) -> &'static str {
    if is_dev { "dev" } else { "release" }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_build_runs_only_under_its_own_identity() {
        assert_eq!(check(true, DEV_IDENTIFIER), Ok(()));
        assert_eq!(check(false, RELEASE_IDENTIFIER), Ok(()));
        let dev_as_release = check(true, RELEASE_IDENTIFIER).unwrap_err();
        assert!(dev_as_release.contains("npm run dev:app"), "{dev_as_release}");
        let release_as_dev = check(false, DEV_IDENTIFIER).unwrap_err();
        assert!(release_as_dev.contains("npm run release"), "{release_as_dev}");
        assert!(check(false, "com.example.other").is_err());
    }

    #[test]
    fn the_build_label_is_what_the_log_and_about_call_it() {
        assert_eq!(build_label(true), "dev");
        assert_eq!(build_label(false), "release");
    }
}

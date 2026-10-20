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
/// The end-to-end suite's build (P12.14): a release-mode app with a folder of its
/// own, so driving it can never touch the installed or the dev library.
pub const E2E_IDENTIFIER: &str = "org.questiongame.e2e";

/// questiongame Beta (`crates/app/tauri.beta.conf.json`): the next major
/// version, installed beside the stable app with a library of its own.
pub const BETA_IDENTIFIER: &str = "org.questiongame.beta";

/// Which channel the e2e build plays (`stable` | `beta`). Read only by the e2e
/// identity, so nothing set on an operator's machine can change what an
/// installed app is.
pub const E2E_CHANNEL_ENV: &str = "QUESTIONGAME_E2E_CHANNEL";
/// Where an e2e build playing Beta finds the "stable" library it may copy.
/// Read only by the e2e identity.
pub const E2E_STABLE_DIR_ENV: &str = "QUESTIONGAME_E2E_STABLE_DIR";

/// The release line a build follows: what its update check reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Line {
    Stable,
    Beta,
}

/// Which product this binary is. Decided once at boot, by [`channel`], and
/// read by everything that behaves differently on Beta.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Channel {
    Stable,
    Beta,
    Dev,
    /// The e2e build, playing one of the two shipped products.
    E2e(Line),
}

impl Channel {
    /// Beta, or the e2e build playing it — the only builds the Beta paths
    /// admit.
    pub fn is_beta(self) -> bool {
        self.line() == Line::Beta
    }

    pub fn line(self) -> Line {
        match self {
            Channel::Beta | Channel::E2e(Line::Beta) => Line::Beta,
            Channel::Stable | Channel::Dev | Channel::E2e(Line::Stable) => Line::Stable,
        }
    }

    /// What Studio is told (`app_info.channel`). The e2e build answers as the
    /// product it plays, so Studio draws exactly what that product draws.
    pub fn wire(self) -> &'static str {
        match self {
            Channel::Dev => "dev",
            other if other.is_beta() => "beta",
            _ => "stable",
        }
    }
}

/// The one place the channel is decided. `e2e_channel` is
/// [`E2E_CHANNEL_ENV`]; every identity but the e2e one ignores it, and the
/// e2e one refuses a value it does not know rather than guess.
pub fn channel(identifier: &str, e2e_channel: Option<&str>) -> Result<Channel, String> {
    match identifier {
        RELEASE_IDENTIFIER => Ok(Channel::Stable),
        BETA_IDENTIFIER => Ok(Channel::Beta),
        E2E_IDENTIFIER => match e2e_channel {
            None | Some("stable") => Ok(Channel::E2e(Line::Stable)),
            Some("beta") => Ok(Channel::E2e(Line::Beta)),
            Some(other) => Err(format!("{E2E_CHANNEL_ENV} is `{other}`: expected `stable` or `beta`.")),
        },
        _ => Ok(Channel::Dev),
    }
}

/// `is_dev` is `tauri::is_dev()`: the frontend comes from `devUrl` rather than
/// being embedded — Tauri's own line between the two builds.
pub fn check(is_dev: bool, identifier: &str) -> Result<(), String> {
    match (is_dev, identifier) {
        (true, DEV_IDENTIFIER) | (false, RELEASE_IDENTIFIER) | (false, E2E_IDENTIFIER) => Ok(()),
        (true, E2E_IDENTIFIER) => Err(format!(
            "This dev build carries the end-to-end identity ({E2E_IDENTIFIER}). \
             Build it with `npm run e2e:build`."
        )),
        (true, RELEASE_IDENTIFIER) => Err(format!(
            "This dev build carries the installed app's identity ({RELEASE_IDENTIFIER}), \
             so it would open the installed app's library. Start it with `npm run dev:app`."
        )),
        (false, DEV_IDENTIFIER) => Err(format!(
            "This release build carries the dev identity ({DEV_IDENTIFIER}), \
             so it would open the dev library. Build it with `npm run release`."
        )),
        (_, other) => Err(format!(
            "Unknown app identity `{other}`: expected {DEV_IDENTIFIER} (dev), {RELEASE_IDENTIFIER} (release) or {E2E_IDENTIFIER} (end-to-end)."
        )),
    }
}

/// What the performance log and Settings ▸ About call this build.
pub fn build_label(is_dev: bool) -> &'static str {
    if is_dev { "dev" } else { "release" }
}

/// [`build_label`], naming the end-to-end build for what it is.
pub fn build_label_for(is_dev: bool, identifier: &str) -> &'static str {
    if identifier == E2E_IDENTIFIER { "e2e" } else { build_label(is_dev) }
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
    fn the_e2e_build_runs_only_as_itself() {
        assert_eq!(check(false, E2E_IDENTIFIER), Ok(()));
        assert!(check(true, E2E_IDENTIFIER).is_err(), "a dev server never runs the suite");
        assert_eq!(build_label_for(false, E2E_IDENTIFIER), "e2e");
        assert_eq!(build_label_for(false, RELEASE_IDENTIFIER), "release");
    }

    #[test]
    fn the_channel_comes_from_the_identifier() {
        assert_eq!(channel(RELEASE_IDENTIFIER, None), Ok(Channel::Stable));
        assert_eq!(channel(BETA_IDENTIFIER, None), Ok(Channel::Beta));
        assert_eq!(channel(DEV_IDENTIFIER, None), Ok(Channel::Dev));
        assert_eq!(channel(E2E_IDENTIFIER, None), Ok(Channel::E2e(Line::Stable)));
    }

    #[test]
    fn only_the_e2e_identity_reads_the_env_var() {
        assert_eq!(channel(E2E_IDENTIFIER, Some("beta")), Ok(Channel::E2e(Line::Beta)));
        assert_eq!(channel(E2E_IDENTIFIER, Some("stable")), Ok(Channel::E2e(Line::Stable)));
        assert_eq!(channel(RELEASE_IDENTIFIER, Some("beta")), Ok(Channel::Stable));
        assert_eq!(channel(DEV_IDENTIFIER, Some("beta")), Ok(Channel::Dev));
        assert_eq!(channel(BETA_IDENTIFIER, Some("stable")), Ok(Channel::Beta));
        // Anything else is a typo, and a typo must not run the stable specs green.
        for bad in ["BETA", "", " beta", "nightly"] {
            let err = channel(E2E_IDENTIFIER, Some(bad)).unwrap_err();
            assert!(err.contains(E2E_CHANNEL_ENV), "{err}");
        }
    }

    #[test]
    fn is_beta_line_and_wire() {
        for c in [Channel::Stable, Channel::Beta, Channel::Dev, Channel::E2e(Line::Stable), Channel::E2e(Line::Beta)] {
            let (beta, line, wire) = match c {
                Channel::Stable => (false, Line::Stable, "stable"),
                Channel::Beta => (true, Line::Beta, "beta"),
                Channel::Dev => (false, Line::Stable, "dev"),
                Channel::E2e(Line::Stable) => (false, Line::Stable, "stable"),
                Channel::E2e(Line::Beta) => (true, Line::Beta, "beta"),
            };
            assert_eq!(c.is_beta(), beta, "{c:?}");
            assert_eq!(c.line(), line, "{c:?}");
            assert_eq!(c.wire(), wire, "{c:?}");
        }
    }

    #[test]
    fn the_build_label_is_what_the_log_and_about_call_it() {
        assert_eq!(build_label(true), "dev");
        assert_eq!(build_label(false), "release");
    }
}

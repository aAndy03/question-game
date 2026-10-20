//! "Is there a newer release?" (P12.9).
//!
//! The app does not update itself. It asks GitHub, once, which release is the
//! latest, compares it with its own version, and says so; the operator takes
//! it by installing the new build over this one. This is the app's only
//! network call, it is made from Rust — the webviews fetch nothing
//! (`release:check`) — and every failure is silent: offline is normal.
//!
//! The fetch is a parameter of [`check`], so everything but the network is
//! tested. The release page is built here from a **parsed** version and never
//! taken from the response or from the webview: nothing a server or a page
//! says can choose what the OS opens.

use std::time::Duration;

use semver::Version;
use serde::{Deserialize, Serialize};

use crate::identity::Line;

/// The repository the releases are published to.
pub const REPOSITORY: &str = "aAndy03/question-game";
const TIMEOUT: Duration = Duration::from_secs(5);

/// The latest published release, as far as it matters here.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Release {
    pub version: Version,
}

/// What `update_check` answers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current: String,
    pub latest: Option<String>,
    /// The latest release's page, built from its version.
    pub url: Option<String>,
    pub newer: bool,
    /// Beta only, and only while Beta runs a prerelease: a **stable** release
    /// newer than this build — "questiongame 2.0.0 is out". Absent from the
    /// JSON otherwise, so a stable build answers exactly what 1.0.2 did.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stable_newer: Option<String>,
}

#[derive(Deserialize)]
struct Latest {
    tag_name: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

/// The release in a `/releases/latest` body. `None` for a draft, a
/// prerelease, a tag that is not `v<semver>`, or a body that is not one.
pub fn parse_latest(body: &str) -> Option<Release> {
    let latest: Latest = serde_json::from_str(body).ok()?;
    if latest.draft || latest.prerelease {
        return None;
    }
    let tag = latest.tag_name.strip_prefix('v').unwrap_or(&latest.tag_name);
    let version = Version::parse(tag).ok()?;
    version.pre.is_empty().then_some(Release { version })
}

/// Every readable release in a `/releases` body, prereleases kept: a
/// non-draft entry whose tag is `v<semver>` (or bare semver). What a release
/// *is* comes from its tag, never from GitHub's `prerelease` flag. A body
/// that is not a list is no releases.
pub fn parse_list(body: &str) -> Vec<Release> {
    let Ok(entries) = serde_json::from_str::<Vec<Latest>>(body) else {
        return Vec::new();
    };
    entries
        .into_iter()
        .filter(|e| !e.draft)
        .filter_map(|e| {
            let tag = e.tag_name.strip_prefix('v').unwrap_or(&e.tag_name);
            Version::parse(tag).ok().map(|version| Release { version })
        })
        .collect()
}

/// What each line asks GitHub for. `/releases/latest` never answers a
/// prerelease, which is exactly what stable wants and exactly what Beta
/// cannot use.
pub fn path_for(line: Line) -> &'static str {
    match line {
        Line::Stable => "/releases/latest",
        Line::Beta => "/releases?per_page=20",
    }
}

/// Is `latest` newer than the running `current`? Semver order, so 1.0.10 is
/// newer than 1.0.9. An unreadable `current` answers no.
pub fn newer(current: &str, latest: &Release) -> bool {
    Version::parse(current).is_ok_and(|current| latest.version > current)
}

/// The release page for a version.
pub fn release_url(version: &Version) -> String {
    format!("https://github.com/{REPOSITORY}/releases/tag/v{version}")
}

/// Ask `fetch` (given [`path_for`] this line) for the releases and compare
/// them with `current`. Stable: the latest release. Beta: the newest of the
/// list by semver, plus [`UpdateStatus::stable_newer`].
pub fn check(
    fetch: impl FnOnce(&str) -> Result<String, String>,
    current: &str,
    line: Line,
) -> Result<UpdateStatus, String> {
    let body = fetch(path_for(line))?;
    let (release, stable_newer) = match line {
        Line::Stable => (parse_latest(&body), None),
        Line::Beta => {
            let releases = parse_list(&body);
            let running = Version::parse(current).ok();
            let stable_newer = running.filter(|v| !v.pre.is_empty()).and_then(|running| {
                releases
                    .iter()
                    .filter(|r| r.version.pre.is_empty() && r.version > running)
                    .map(|r| &r.version)
                    .max()
                    .map(Version::to_string)
            });
            (releases.into_iter().max_by(|a, b| a.version.cmp(&b.version)), stable_newer)
        }
    };
    let release = release.ok_or_else(|| "no readable latest release".to_string())?;
    Ok(UpdateStatus {
        current: current.to_string(),
        latest: Some(release.version.to_string()),
        url: Some(release_url(&release.version)),
        newer: newer(current, &release),
        stable_newer,
    })
}

/// The one network call: GitHub's releases for [`REPOSITORY`] at `path`
/// ([`path_for`]), through
/// the OS trust store, five seconds at most. Blocking — run it off the host
/// lock and off the event-loop thread.
pub fn fetch(path: &str) -> Result<String, String> {
    use std::sync::Arc;
    use ureq::tls::{Certificate, RootCerts, TlsConfig, TlsProvider};

    // rustls needs a process-wide crypto provider. Installing one twice is an
    // `Err` that changes nothing, so every call may try.
    let _ = rustls::crypto::ring::default_provider().install_default();
    // The roots the OS trusts — Windows' store, the macOS keychain — so a
    // proxy the machine already trusts is trusted here too. A store that
    // cannot be read in full still yields what it could read.
    let native = rustls_native_certs::load_native_certs();
    if native.certs.is_empty() {
        return Err(format!("no trusted roots: {:?}", native.errors));
    }
    let roots: Vec<Certificate<'static>> = native
        .certs
        .iter()
        .map(|der| Certificate::from_der(der.as_ref()).to_owned())
        .collect();
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .tls_config(
            TlsConfig::builder()
                .provider(TlsProvider::Rustls)
                .root_certs(RootCerts::Specific(Arc::new(roots)))
                .build(),
        )
        .timeout_global(Some(TIMEOUT))
        .user_agent(format!("questiongame/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .into();
    agent
        .get(format!("https://api.github.com/repos/{REPOSITORY}{path}"))
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| e.to_string())?
        .body_mut()
        .read_to_string()
        .map_err(|e| e.to_string())
}

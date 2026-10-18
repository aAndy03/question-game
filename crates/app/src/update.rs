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

/// Is `latest` newer than the running `current`? Semver order, so 1.0.10 is
/// newer than 1.0.9. An unreadable `current` answers no.
pub fn newer(current: &str, latest: &Release) -> bool {
    Version::parse(current).is_ok_and(|current| latest.version > current)
}

/// The release page for a version.
pub fn release_url(version: &Version) -> String {
    format!("https://github.com/{REPOSITORY}/releases/tag/v{version}")
}

/// Ask `fetch` for the latest release and compare it with `current`.
pub fn check(
    fetch: impl FnOnce() -> Result<String, String>,
    current: &str,
) -> Result<UpdateStatus, String> {
    let body = fetch()?;
    let release = parse_latest(&body).ok_or_else(|| "no readable latest release".to_string())?;
    Ok(UpdateStatus {
        current: current.to_string(),
        latest: Some(release.version.to_string()),
        url: Some(release_url(&release.version)),
        newer: newer(current, &release),
    })
}

/// The one network call: GitHub's latest release for [`REPOSITORY`], through
/// the OS trust store, five seconds at most. Blocking — run it off the host
/// lock and off the event-loop thread.
pub fn fetch_latest() -> Result<String, String> {
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
        .get(format!("https://api.github.com/repos/{REPOSITORY}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| e.to_string())?
        .body_mut()
        .read_to_string()
        .map_err(|e| e.to_string())
}

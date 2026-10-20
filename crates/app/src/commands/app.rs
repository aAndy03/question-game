//! The app itself (P12.2): quitting, and opening the uninstaller. Not a
//! service's surface — nothing here reads or writes a Play or the library,
//! beyond the refusals `app_uninstall` borrows from Settings ▸ Data.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, State, WebviewWindow};

use crate::error::{AppError, AppResult};
use crate::guard;
use crate::quit::QuitState;
use crate::state::AppState;

/// Studio answered the close guard with *quit*. Studio only (`guard`).
#[tauri::command(async)]
pub fn app_quit(window: WebviewWindow, app: AppHandle) -> AppResult<()> {
    guard::allow(window.label(), "app_quit")?;
    tracing::info!("quit: confirmed in Studio");
    app.exit(0);
    Ok(())
}

/// Studio answered the close guard with *keep working*: the next press of the
/// close button asks again instead of exiting.
#[tauri::command(async)]
pub fn app_close_cancelled(window: WebviewWindow, quit: State<'_, QuitState>) -> AppResult<()> {
    guard::allow(window.label(), "app_close_cancelled")?;
    quit.cancel();
    Ok(())
}

/// The NSIS uninstaller, if one sits beside `exe`. The installer writes
/// `uninstall.exe` into the install folder; a dev build or a copied exe has
/// none, and then there is no uninstall to offer.
pub fn uninstaller_beside(exe: &Path) -> Option<PathBuf> {
    let candidate = exe.parent()?.join("uninstall.exe");
    candidate.is_file().then_some(candidate)
}

/// [`uninstaller_beside`] the running exe. Windows only.
pub fn uninstaller_path() -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    uninstaller_beside(&std::env::current_exe().ok()?)
}

/// Settings ▸ Data ▸ *Uninstall questiongame…* (P12.2): start the Windows
/// uninstaller and quit, so it finds the files free. It asks there whether to
/// delete the generated data too. Refused, in order, when this copy was not
/// installed, while a Play is loaded, and without the active operator's pin.
#[tauri::command(async)]
pub fn app_uninstall(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    pin: Option<String>,
) -> AppResult<()> {
    guard::allow(window.label(), "app_uninstall")?;
    let Some(uninstaller) = uninstaller_path() else {
        return Err(AppError::Window(
            "this copy was not installed by the Windows installer, so there is no uninstaller to open".into(),
        ));
    };
    {
        let host = state.lock();
        super::flags::refuse_while_play_loaded(&host)?;
        super::flags::require_active_operator_pin(&host, pin.as_deref())?;
    }
    std::process::Command::new(&uninstaller)
        .spawn()
        .map_err(|e| AppError::Window(format!("cannot start {}: {e}", uninstaller.display())))?;
    tracing::info!(path = %uninstaller.display(), "uninstaller started; quitting");
    app.exit(0);
    Ok(())
}

/// What Settings ▸ About says this build is (P12.3).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    /// `dev` or `release`.
    pub build: &'static str,
    pub identifier: String,
    /// `stable`, `beta` or `dev` (`identity::Channel::wire`): what the Beta
    /// chip and the welcome read.
    pub channel: &'static str,
}

/// Settings ▸ About. Studio only (`guard`).
#[tauri::command(async)]
pub fn app_info(
    window: WebviewWindow,
    app: AppHandle,
    channel: State<'_, crate::identity::Channel>,
) -> AppResult<AppInfo> {
    guard::allow(window.label(), "app_info")?;
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        build: crate::identity::build_label_for(tauri::is_dev(), &app.config().identifier),
        identifier: app.config().identifier.clone(),
        channel: channel.wire(),
    })
}

/// Is there a newer release? (P12.9). The app's one network call, made here
/// and never from a webview; Studio asks once per session when no Play is
/// loaded, and again from Settings ▸ About. Studio only (`guard`).
///
/// The request blocks for up to five seconds, so it runs on the blocking
/// pool rather than an async worker the other commands need (P12.12). A
/// failure is logged — offline and an unreadable trust store read the same in
/// Studio, which says nothing about either, so the log is where they differ.
#[tauri::command]
pub async fn update_check(
    window: WebviewWindow,
    channel: State<'_, crate::identity::Channel>,
) -> AppResult<crate::update::UpdateStatus> {
    guard::allow(window.label(), "update_check")?;
    let line = channel.line();
    let answer = tauri::async_runtime::spawn_blocking(move || {
        crate::update::check(crate::update::fetch, env!("CARGO_PKG_VERSION"), line)
    })
    .await
    .map_err(|e| AppError::Network(e.to_string()))?;
    match answer {
        Ok(status) => {
            tracing::info!(latest = status.latest.as_deref().unwrap_or("-"), newer = status.newer, "update check");
            Ok(status)
        }
        Err(reason) => {
            tracing::warn!(%reason, "update check failed");
            Err(AppError::Network(reason))
        }
    }
}

/// Open a release's page in the browser. Studio passes a **version**, never a
/// URL: the page is built here from the parsed version, so nothing a webview
/// sends can choose what the OS opens. Studio only (`guard`).
#[tauri::command(async)]
pub fn update_open_release(window: WebviewWindow, version: String) -> AppResult<()> {
    guard::allow(window.label(), "update_open_release")?;
    let version = semver::Version::parse(&version)
        .map_err(|e| AppError::Window(format!("not a version: {version} ({e})")))?;
    let url = crate::update::release_url(&version);
    super::flags::os_open(std::ffi::OsStr::new(&url))
}

/// What `whats_new_get` answers (P12.10).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhatsNew {
    /// Show the notes for every version newer than this; `None` when nothing
    /// is new to this library.
    pub since: Option<String>,
    pub current: &'static str,
}

/// Where *What's new* starts for this library (P12.10). A library this build
/// created is stamped here and told nothing. Studio only (`guard`).
#[tauri::command(async)]
pub fn whats_new_get(window: WebviewWindow, state: State<'_, AppState>) -> AppResult<WhatsNew> {
    use questiongame_host::catalog::META_LAST_SEEN;

    guard::allow(window.label(), "whats_new_get")?;
    let current = env!("CARGO_PKG_VERSION");
    let host = state.lock();
    let since = match crate::whats_new::since(
        host.catalog.meta_get(META_LAST_SEEN)?,
        host.open_report.as_ref(),
    ) {
        crate::whats_new::Since::Show(version) => Some(version),
        crate::whats_new::Since::StampSilently => {
            host.catalog.meta_set(META_LAST_SEEN, current)?;
            None
        }
    };
    Ok(WhatsNew { since, current })
}

/// The operator closed *What's new*: nothing up to this version is new any
/// more (P12.10). Studio only (`guard`).
#[tauri::command(async)]
pub fn whats_new_seen(window: WebviewWindow, state: State<'_, AppState>) -> AppResult<()> {
    guard::allow(window.label(), "whats_new_seen")?;
    let host = state.lock();
    host.catalog
        .meta_set(questiongame_host::catalog::META_LAST_SEEN, env!("CARGO_PKG_VERSION"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// REG01: 1.0.2's keys, plus `channel`.
    #[test]
    fn app_info_is_1_0_2s_shape_plus_the_channel() {
        let info = AppInfo {
            version: "1.0.2".into(),
            build: "release",
            identifier: "org.example.app".into(),
            channel: crate::identity::Channel::Stable.wire(),
        };
        let json = serde_json::to_value(&info).unwrap();
        let mut keys: Vec<&String> = json.as_object().unwrap().keys().collect();
        keys.sort();
        assert_eq!(keys, ["build", "channel", "identifier", "version"]);
        assert_eq!(json["channel"], "stable");
    }

    #[test]
    fn the_uninstaller_is_found_only_where_the_installer_put_it() {
        let dir = std::env::temp_dir().join(format!("qg-uninst-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("questiongame.exe");
        assert_eq!(uninstaller_beside(&exe), None);
        std::fs::write(dir.join("uninstall.exe"), b"MZ").unwrap();
        assert_eq!(uninstaller_beside(&exe), Some(dir.join("uninstall.exe")));
        let _ = std::fs::remove_dir_all(&dir);
    }
}

//! The app itself (P12.2): quitting, and opening the uninstaller. Not a
//! service's surface — nothing here reads or writes a Play or the library,
//! beyond the refusals `app_uninstall` borrows from Settings ▸ Data.

use std::path::{Path, PathBuf};

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

#[cfg(test)]
mod tests {
    use super::*;

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

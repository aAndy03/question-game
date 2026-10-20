//! questiongame Beta's first launch (P13.1): the welcome that says Beta keeps
//! its own library, and the copy of the stable one it offers.
//!
//! Every command here is Beta's alone (`Channel::is_beta`): a stable build
//! answers that there is nothing to welcome, and refuses the rest. The welcome
//! shows once per Beta library — until `beta.welcome_seen` is written — and
//! only on an **empty** one, so a library that already holds work is never
//! offered a copy over it.

use std::path::{Path, PathBuf};

use questiongame_host::catalog::{
    ArchiveScope, CatalogChange, CatalogKind, CatalogLocation, ChangeOp, OpenOptions,
};
use serde::Serialize;
use tauri::{AppHandle, State, WebviewWindow};

use crate::error::{AppError, AppResult};
use crate::identity::{Channel, E2E_STABLE_DIR_ENV};
use crate::stable_copy::{self, CopyError, StableLibrary};
use crate::state::{AppState, CATALOG_FILE, Host};
use crate::{emit, guard};

/// The row that says this Beta library has had its welcome.
pub const META_BETA_WELCOME_SEEN: &str = "beta.welcome_seen";
/// Where the copy is compacted before it replaces the empty library.
const COPY_FILE: &str = "questiongame.copy.sqlite3";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BetaWelcome {
    pub show: bool,
    /// `available` · `missing` · `running`.
    pub stable: &'static str,
}

fn refusal(code: &'static str, message: impl Into<String>) -> AppError {
    AppError::Beta { code, message: message.into() }
}

fn beta_only(channel: Channel) -> AppResult<()> {
    if channel.is_beta() {
        Ok(())
    } else {
        Err(refusal("beta.not_beta", "only questiongame Beta copies a stable library"))
    }
}

/// Nothing an operator made: no operator, team, domain, question, asset,
/// recipe or Play, archived ones included, and no Play loaded. Settings and
/// meta rows do not count.
pub fn is_empty_library(host: &Host) -> AppResult<bool> {
    let catalog = &host.catalog;
    for kind in [CatalogKind::Operator, CatalogKind::Team, CatalogKind::Domain, CatalogKind::Question, CatalogKind::Asset] {
        if !catalog.catalog_list(kind, ArchiveScope::All)?.is_empty() {
            return Ok(false);
        }
    }
    Ok(catalog.recipe_list(ArchiveScope::All)?.is_empty()
        && catalog.play_list(None)?.is_empty()
        && host.play.get_state().is_none())
}

/// What `beta_welcome_get` answers. `stable` is `None` when the build has no
/// stable folder to look at.
pub fn welcome(channel: Channel, host: &Host, stable: Option<StableLibrary>) -> AppResult<BetaWelcome> {
    if !channel.is_beta() {
        return Ok(BetaWelcome { show: false, stable: StableLibrary::Missing.wire() });
    }
    let seen = host.catalog.meta_get(META_BETA_WELCOME_SEEN)?.is_some();
    Ok(BetaWelcome {
        show: !seen && is_empty_library(host)?,
        stable: stable.unwrap_or(StableLibrary::Missing).wire(),
    })
}

fn copy_error(error: CopyError) -> AppError {
    let code = match error {
        CopyError::Running => "beta.stable_running",
        CopyError::Missing => "beta.no_stable",
        CopyError::StableNewer | CopyError::Io(_) | CopyError::Sqlite(_) => "beta.copy_failed",
    };
    refusal(code, error.to_string())
}

/// Before the bytes move: Beta, empty, and something to copy.
pub fn check_copyable(channel: Channel, host: &Host) -> AppResult<()> {
    beta_only(channel)?;
    if !is_empty_library(host)? {
        return Err(refusal("beta.library_not_empty", "this Beta library already holds work; nothing was copied"));
    }
    Ok(())
}

/// Put the compacted `copy` in place of the empty library at `library` and
/// reopen it through the ordinary upgrade path (backed up and stamped). If the
/// copy will not open, Beta comes back up on a fresh empty library and the
/// welcome shows again. The Stage display state is carried over.
pub fn swap_in(host: &mut Host, library: &Path, copy: &Path, options: &OpenOptions) -> AppResult<()> {
    check_copyable(Channel::Beta, host)?;
    let display = std::mem::replace(&mut host.display, questiongame_host::StageDisplay::new());
    // Drop the connection: on Windows a file that is open cannot be replaced.
    *host = Host::open(CatalogLocation::Memory)?;
    let result = (|| -> AppResult<Host> {
        for suffix in ["", "-wal", "-shm"] {
            let path = PathBuf::from(format!("{}{suffix}", library.display()));
            if path.exists() {
                std::fs::remove_file(&path).map_err(|e| refusal("beta.copy_failed", e.to_string()))?;
            }
        }
        std::fs::rename(copy, library).map_err(|e| refusal("beta.copy_failed", e.to_string()))?;
        let opened = Host::open_installed(library, options)?;
        opened.catalog.meta_set(META_BETA_WELCOME_SEEN, "copied")?;
        Ok(opened)
    })();
    let (next, outcome) = match result {
        Ok(opened) => (opened, Ok(())),
        Err(error) => {
            let _ = std::fs::remove_file(copy);
            for suffix in ["", "-wal", "-shm"] {
                let _ = std::fs::remove_file(format!("{}{suffix}", library.display()));
            }
            (Host::open_installed(library, options)?, Err(error))
        }
    };
    *host = next;
    host.display = display;
    outcome
}

/// Is there a welcome to show? Studio asks once, before first run.
#[tauri::command(async)]
pub fn beta_welcome_get(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    channel: State<'_, Channel>,
) -> AppResult<BetaWelcome> {
    guard::allow(window.label(), "beta_welcome_get")?;
    let stable = stable_folder(&app, *channel).map(|dir| stable_copy::probe(&dir));
    let host = state.lock();
    welcome(*channel, &host, stable)
}

/// *Start empty*: the welcome is done, first run follows.
#[tauri::command(async)]
pub fn beta_welcome_done(
    window: WebviewWindow,
    state: State<'_, AppState>,
    channel: State<'_, Channel>,
) -> AppResult<()> {
    guard::allow(window.label(), "beta_welcome_done")?;
    beta_only(*channel)?;
    let host = state.lock();
    host.catalog.meta_set(META_BETA_WELCOME_SEEN, "empty")?;
    Ok(())
}

/// *Copy my stable library*. The bytes move without the host lock; the lock
/// is taken to check, released, and taken again to swap.
#[tauri::command(async)]
pub fn beta_copy_stable_library(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    channel: State<'_, Channel>,
) -> AppResult<()> {
    guard::allow(window.label(), "beta_copy_stable_library")?;
    let channel = *channel;
    check_copyable(channel, &state.lock())?;
    let beta_dir = crate::state::user_data_dir(&app)?;
    let stable = stable_folder(&app, channel).ok_or_else(|| copy_error(CopyError::Missing))?;
    let copy = beta_dir.join(COPY_FILE);
    let _ = std::fs::remove_file(&copy);
    stable_copy::copy_into(&stable, &beta_dir, &copy).map_err(copy_error)?;
    let library = beta_dir.join(CATALOG_FILE);
    let options = crate::state::open_options(&beta_dir);
    let mut host = state.lock();
    let swapped = swap_in(&mut host, &library, &copy, &options);
    if swapped.is_ok() {
        tracing::info!(from = %stable.display(), "stable library copied into Beta");
    }
    for kind in [CatalogKind::Operator, CatalogKind::Team, CatalogKind::Domain, CatalogKind::Question, CatalogKind::Asset, CatalogKind::Recipe] {
        emit::catalog_changed(&app, &CatalogChange { kind, id: String::new(), op: ChangeOp::Upserted });
    }
    emit::play_state(&app, &mut host, crate::state::now_ms(), true);
    swapped
}

fn stable_folder(app: &AppHandle, channel: Channel) -> Option<PathBuf> {
    let beta_dir = crate::state::user_data_dir(app).ok()?;
    let e2e = std::env::var_os(E2E_STABLE_DIR_ENV).map(PathBuf::from);
    stable_copy::stable_dir(&beta_dir, channel, e2e.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::Line;
    use questiongame_host::catalog::{CatalogItem, CatalogService, META_LAST_OPENED, Operator, Team};
    use std::sync::atomic::{AtomicU32, Ordering};

    struct Dir(PathBuf);
    impl Dir {
        fn new(tag: &str) -> Dir {
            static N: AtomicU32 = AtomicU32::new(0);
            let p = std::env::temp_dir().join(format!("qg-beta-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
            std::fs::create_dir_all(&p).unwrap();
            Dir(p)
        }
        fn library(&self) -> PathBuf {
            self.0.join(CATALOG_FILE)
        }
        fn options(&self) -> OpenOptions {
            OpenOptions { app_version: "2.0.0-beta.1".into(), backup_dir: self.0.join("backups"), keep: 5, stamp: "20261020-120000".into() }
        }
        fn host(&self) -> Host {
            Host::open_installed(&self.library(), &self.options()).unwrap()
        }
    }
    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn team(id: &str) -> CatalogItem {
        CatalogItem::Team(Box::new(Team::new(id, id, "TM")))
    }

    /// A stable library, closed, unstamped as 1.0.1 left it, with an operator.
    fn stable_library(dir: &Dir) -> PathBuf {
        let path = dir.0.join("stable.sqlite3");
        let catalog = CatalogService::open(CatalogLocation::file(&path)).unwrap();
        catalog.catalog_upsert(&team("alpha"), 1).unwrap();
        catalog.catalog_upsert(&CatalogItem::Operator(Box::new(Operator::new("op", "Op"))), 2).unwrap();
        path
    }

    fn compacted(dir: &Dir, from: &Path) -> PathBuf {
        let copy = dir.0.join(COPY_FILE);
        questiongame_host::catalog::compact_copy(from, &copy).unwrap();
        copy
    }

    /// CMD01, WEL02.
    #[test]
    fn stable_never_sees_the_welcome() {
        let dir = Dir::new("stable");
        let host = dir.host();
        for c in [Channel::Stable, Channel::Dev, Channel::E2e(Line::Stable)] {
            assert_eq!(welcome(c, &host, Some(StableLibrary::Available)).unwrap(), BetaWelcome { show: false, stable: "missing" });
            assert!(matches!(check_copyable(c, &host), Err(AppError::Beta { code: "beta.not_beta", .. })));
        }
        assert_eq!(host.catalog.meta_get(META_BETA_WELCOME_SEEN).unwrap(), None, "asking writes nothing");
    }

    /// WEL01, WEL03, WEL04, CMD02.
    #[test]
    fn beta_sees_it_once_on_an_empty_library() {
        let dir = Dir::new("once");
        let host = dir.host();
        for c in [Channel::Beta, Channel::E2e(Line::Beta)] {
            assert_eq!(welcome(c, &host, Some(StableLibrary::Available)).unwrap(), BetaWelcome { show: true, stable: "available" });
        }
        assert_eq!(welcome(Channel::Beta, &host, None).unwrap().stable, "missing");
        assert_eq!(welcome(Channel::Beta, &host, Some(StableLibrary::Running)).unwrap().stable, "running");
        host.catalog.meta_set(META_BETA_WELCOME_SEEN, "empty").unwrap();
        host.catalog.meta_set(META_BETA_WELCOME_SEEN, "empty").unwrap();
        assert!(!welcome(Channel::Beta, &host, None).unwrap().show);
        drop(host);
        assert!(!welcome(Channel::Beta, &dir.host(), None).unwrap().show, "it stays seen across a reopen");
    }

    /// CMD05, CMD06, CMD18: work of any kind means no welcome and no copy.
    #[test]
    fn a_library_with_work_is_never_copied_over() {
        let kinds: [(&str, CatalogItem); 3] = [
            ("team", team("t")),
            ("operator", CatalogItem::Operator(Box::new(Operator::new("op", "Op")))),
            ("archived", team("gone")),
        ];
        for (name, item) in kinds {
            let dir = Dir::new(name);
            let host = dir.host();
            host.catalog.catalog_upsert(&item, 1).unwrap();
            if name == "archived" {
                host.catalog.catalog_archive(CatalogKind::Team, "gone", 2).unwrap();
            }
            assert!(!welcome(Channel::Beta, &host, None).unwrap().show, "{name}");
            assert!(matches!(check_copyable(Channel::Beta, &host), Err(AppError::Beta { code: "beta.library_not_empty", .. })), "{name}");
        }
    }

    /// SC41, SC43, CMD15, WEL03, REG09: the copy replaces the boot-time empty
    /// library, opens as an ordinary upgrade, and its welcome is done.
    #[test]
    fn a_copy_brings_the_library_and_stamps_it() {
        let dir = Dir::new("copy");
        let mut host = dir.host();
        let copy = compacted(&dir, &stable_library(&dir));
        swap_in(&mut host, &dir.library(), &copy, &dir.options()).unwrap();
        assert!(host.catalog.catalog_get(CatalogKind::Team, "alpha").is_ok());
        assert_eq!(host.catalog.meta_get(META_LAST_OPENED).unwrap().as_deref(), Some("2.0.0-beta.1"));
        let report = host.open_report.as_ref().unwrap();
        assert!(report.existed);
        assert_eq!(report.previous_version, None, "unstamped: What's new starts after 1.0.1");
        assert!(report.backup.as_ref().is_some_and(|b| b.starts_with(dir.0.join("backups"))), "the backup is Beta's");
        assert_eq!(host.catalog.meta_get(META_BETA_WELCOME_SEEN).unwrap().as_deref(), Some("copied"));
        assert!(!copy.exists());
        // CMD08: a second copy is refused, because the library now holds work.
        assert!(matches!(check_copyable(Channel::Beta, &host), Err(AppError::Beta { code: "beta.library_not_empty", .. })));
    }

    /// CMD14: a copy that will not open leaves Beta on a fresh empty library,
    /// welcome still to come.
    #[test]
    fn a_failed_reopen_leaves_an_empty_library() {
        let dir = Dir::new("bad");
        let mut host = dir.host();
        let copy = dir.0.join(COPY_FILE);
        std::fs::write(&copy, vec![0x5au8; 8192]).unwrap();
        assert!(swap_in(&mut host, &dir.library(), &copy, &dir.options()).is_err());
        assert!(is_empty_library(&host).unwrap());
        assert!(welcome(Channel::Beta, &host, Some(StableLibrary::Available)).unwrap().show);
        assert!(host.catalog.catalog_list(CatalogKind::Team, ArchiveScope::All).unwrap().is_empty(), "the host answers");
    }

    /// CMD03: only Studio may ask.
    #[test]
    fn only_studio_may_call_them() {
        for command in ["beta_welcome_get", "beta_welcome_done", "beta_copy_stable_library"] {
            assert!(guard::allow(guard::MAIN, command).is_ok());
            assert!(guard::allow(guard::STAGE, command).is_err(), "{command} from Stage");
            assert!(guard::allow(guard::STATS, command).is_err(), "{command} from Statistics");
        }
    }

    /// CMD11: the codes Studio maps on.
    #[test]
    fn the_refusal_codes_are_stable() {
        let json = |e: CopyError| serde_json::to_value(copy_error(e)).unwrap()["code"].clone();
        assert_eq!(json(CopyError::Running), "beta.stable_running");
        assert_eq!(json(CopyError::Missing), "beta.no_stable");
        assert_eq!(json(CopyError::StableNewer), "beta.copy_failed");
        assert_eq!(json(CopyError::Io("x".into())), "beta.copy_failed");
    }
}

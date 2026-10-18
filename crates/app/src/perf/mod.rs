//! The performance log (P11.5): one JSON line per second, for the developer
//! and for an agent reading after the fact.
//!
//! ```text
//! line     the shape, and the spike decision — a pure function of a second
//! layer    attribution: `target: "perf"` tracing events folded into the second
//! os       the process tree, through `sysinfo`
//! ```
//!
//! `<app data>/perf/perf-<timestamp>-<pid>.jsonl`, one file per run; old runs
//! are pruned to the newest ten **and** 100 MB. Every build writes it
//! (`QUESTIONGAME_PERF=0` turns it off) so the installed app can be monitored
//! too (P12.1). A release build's lines carry `os`, `host` and `spike` only:
//! its webviews post nothing, and `build` says so.
//!
//! Nothing here takes the host lock. The webviews post their own second
//! through `perf_report`; the writer folds whatever arrived and writes the
//! line on its own boundary, so a webview that stopped reporting shows up as
//! a missing key rather than a missing line — which is itself the finding.

pub mod layer;
pub mod line;
pub mod os;

use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::AppHandle;
use tauri::async_runtime;

pub use layer::{Counters, PerfLayer, TARGET};
use line::{Inputs, WebviewReport};

/// How many run files stay after a prune.
pub const KEEP_FILES: usize = 10;
/// The run files' folder, under the data directory.
pub const DIR: &str = "perf";
/// Old runs kept at most this many bytes between them. The run being written
/// is not counted: pruning happens before it exists (P12.1).
pub const MAX_OLD_BYTES: u64 = 100 * 1024 * 1024;
const EVERY: Duration = Duration::from_secs(1);

thread_local! {
    /// The command this thread is running, so a `HostGuard` dropped on it can
    /// say whose lock time it was. Set by `guard::allow` and the show loop;
    /// cleared when the guard drops. Tokio reuses worker threads, which is why
    /// it is cleared rather than left to be overwritten.
    static CURRENT: std::cell::Cell<&'static str> = const { std::cell::Cell::new("") };
}

/// Name the command about to take the host lock on this thread.
pub fn set_current(command: &'static str) {
    CURRENT.with(|c| c.set(command));
}

/// The command that held the lock, or `"?"` if nothing said. Clears it.
pub fn take_current() -> &'static str {
    CURRENT.with(|c| {
        let name = c.replace("");
        if name.is_empty() { "?" } else { name }
    })
}

/// Whether this build writes the file: every build does, unless
/// `QUESTIONGAME_PERF` says `0`, `off` or `false` (P12.1).
pub fn enabled() -> bool {
    enabled_from(std::env::var("QUESTIONGAME_PERF").ok().as_deref())
}

/// [`enabled`], given the variable's value.
pub fn enabled_from(var: Option<&str>) -> bool {
    !matches!(var, Some("0" | "off" | "false"))
}

/// [`enabled`], decided once — the show loop asks ten times a second.
pub fn enabled_cached() -> bool {
    static ON: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ON.get_or_init(enabled)
}

/// The state Tauri manages: the shared second and the webviews' inbox.
pub struct PerfState {
    pub counters: Counters,
    reports: Mutex<BTreeMap<String, WebviewReport>>,
    /// Where the current run is being written, for `perf_path`.
    pub path: Mutex<Option<PathBuf>>,
}

impl Default for PerfState {
    fn default() -> Self {
        Self {
            counters: Counters::default(),
            reports: Mutex::new(BTreeMap::new()),
            path: Mutex::new(None),
        }
    }
}

impl PerfState {
    /// A webview's report for the current second; a later one replaces it.
    pub fn report(&self, label: &str, report: WebviewReport) {
        let mut inbox = self.reports.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        inbox.insert(label.to_string(), report);
    }

    fn take_reports(&self) -> BTreeMap<String, WebviewReport> {
        let mut inbox = self.reports.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        std::mem::take(&mut *inbox)
    }
}

/// The file for this run, in `<dir>/perf`.
pub fn file_for_run(dir: &Path, now: &str, pid: u32) -> PathBuf {
    let stamp: String = now
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    dir.join(DIR).join(format!("perf-{stamp}-{pid}.jsonl"))
}

/// Delete old run files until at most `keep` remain **and** they hold at most
/// `max_bytes` between them, oldest first. Called before this run's file is
/// created, so the run being written is never a candidate. Names sort by time.
pub fn prune(perf_dir: &Path, keep: usize, max_bytes: u64) -> std::io::Result<Vec<PathBuf>> {
    let mut files: Vec<(PathBuf, u64)> = std::fs::read_dir(perf_dir)?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("perf-") && n.ends_with(".jsonl"))
        })
        .map(|p| {
            let len = std::fs::metadata(&p).map_or(0, |m| m.len());
            (p, len)
        })
        .collect();
    files.sort();
    let mut total: u64 = files.iter().map(|(_, len)| len).sum();
    let mut removed = Vec::new();
    while !files.is_empty() && (files.len() > keep || total > max_bytes) {
        let (oldest, len) = files.remove(0);
        total = total.saturating_sub(len);
        if std::fs::remove_file(&oldest).is_ok() {
            removed.push(oldest);
        }
    }
    Ok(removed)
}

pub(crate) fn now_rfc3339() -> String {
    // No chrono in the tree; the log's own timestamps are UTC too.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    let days = secs / 86_400;
    let rem = secs % 86_400;
    // Civil-from-days (Howard Hinnant), enough for a file name and a line.
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

/// Open the file for this run, prune the old ones, and start the writer.
pub fn spawn(app: AppHandle, data_dir: Option<PathBuf>) {
    if !enabled() {
        tracing::debug!("perf log off (QUESTIONGAME_PERF=0)");
        return;
    }
    let Some(dir) = data_dir else {
        tracing::warn!("perf log: no data directory, not writing");
        return;
    };
    let path = file_for_run(&dir, &now_rfc3339(), std::process::id());
    let perf_dir = path.parent().map(Path::to_path_buf).unwrap_or_else(|| dir.clone());
    if let Err(error) = std::fs::create_dir_all(&perf_dir) {
        tracing::warn!(%error, "perf log: cannot create directory");
        return;
    }
    match prune(&perf_dir, KEEP_FILES.saturating_sub(1), MAX_OLD_BYTES) {
        Ok(removed) if !removed.is_empty() => tracing::debug!(n = removed.len(), "perf log: pruned old runs"),
        Ok(_) => {}
        Err(error) => tracing::warn!(%error, "perf log: prune failed"),
    }
    let file = match std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        Ok(f) => f,
        Err(error) => {
            tracing::warn!(%error, path = %path.display(), "perf log: cannot open");
            return;
        }
    };
    tracing::info!(path = %path.display(), "perf log");
    let state: tauri::State<'_, PerfState> = tauri::Manager::state(&app);
    *state.path.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = Some(path.clone());

    let build = crate::identity::build_label(tauri::is_dev());
    async_runtime::spawn(async move {
        let state: tauri::State<'_, PerfState> = tauri::Manager::state(&app);
        let mut out = std::io::BufWriter::new(file);
        let mut sampler = os::OsSampler::new(Some(dir), Some(path));
        let started = Instant::now();
        let mut prev_ws: Option<u64> = None;
        let mut ticker = tokio::time::interval(EVERY);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            let os_sample = sampler.sample();
            let total_ws = (os_sample.total_ws_mb * 1_048_576.0) as u64;
            let line = line::build(Inputs {
                t: now_rfc3339(),
                sec: started.elapsed().as_secs(),
                build,
                os: os_sample,
                prev_total_ws_bytes: prev_ws,
                host: state.counters.take(),
                webviews: state.take_reports(),
            });
            prev_ws = Some(total_ws);
            let ok = serde_json::to_writer(&mut out, &line)
                .map_err(std::io::Error::other)
                .and_then(|()| out.write_all(b"\n"))
                .and_then(|()| out.flush());
            if let Err(error) = ok {
                tracing::warn!(%error, "perf log: write failed; stopping");
                return;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_name_is_safe_and_sorts_by_time() {
        let a = file_for_run(Path::new("d"), "2026-09-10T10:00:00Z", 7);
        let b = file_for_run(Path::new("d"), "2026-09-10T10:00:01Z", 7);
        assert_eq!(a.file_name().unwrap(), "perf-2026-09-10T10-00-00Z-7.jsonl");
        assert!(a < b);
        assert!(a.starts_with("d/perf") || a.starts_with("d\\perf"));
    }

    #[test]
    fn prune_keeps_the_newest_and_ignores_other_files() {
        let dir = std::env::temp_dir().join(format!("qg-perf-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for i in 0..5 {
            std::fs::write(dir.join(format!("perf-2026-09-10T10-00-0{i}Z-1.jsonl")), "{}\n").unwrap();
        }
        std::fs::write(dir.join("notes.txt"), "keep me").unwrap();
        let removed = prune(&dir, 3, u64::MAX).unwrap();
        assert_eq!(removed.len(), 2);
        let mut left: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(
            left,
            vec![
                "notes.txt",
                "perf-2026-09-10T10-00-02Z-1.jsonl",
                "perf-2026-09-10T10-00-03Z-1.jsonl",
                "perf-2026-09-10T10-00-04Z-1.jsonl",
            ]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn every_build_writes_unless_told_not_to() {
        assert!(enabled_from(None));
        assert!(enabled_from(Some("1")));
        for off in ["0", "off", "false"] {
            assert!(!enabled_from(Some(off)), "{off}");
        }
    }

    #[test]
    fn prune_also_holds_the_old_runs_under_a_size() {
        let dir = std::env::temp_dir().join(format!("qg-perf-size-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for i in 0..5 {
            std::fs::write(dir.join(format!("perf-2026-09-11T10-00-0{i}Z-1.jsonl")), "0123456789").unwrap();
        }
        let removed = prune(&dir, 10, 25).unwrap();
        assert_eq!(removed.len(), 3, "10 bytes each, 25 allowed: the newest two stay");
        let mut left: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(left, vec!["perf-2026-09-11T10-00-03Z-1.jsonl", "perf-2026-09-11T10-00-04Z-1.jsonl"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reports_are_taken_once() {
        let state = PerfState::default();
        state.report("main", serde_json::json!({ "heapMb": 1 }));
        state.report("main", serde_json::json!({ "heapMb": 2 }));
        let taken = state.take_reports();
        assert_eq!(taken["main"]["heapMb"], 2);
        assert!(state.take_reports().is_empty());
    }

    #[test]
    fn rfc3339_is_well_formed() {
        let t = now_rfc3339();
        assert_eq!(t.len(), 20, "{t}");
        assert!(t.starts_with("20") && t.ends_with('Z'), "{t}");
    }
}

//! The OS layer: this process and everything under it, through `sysinfo`.
//!
//! On Windows the children are the WebView2 tree — one `msedgewebview2.exe`
//! per role (`browser`, `gpu-process`, `renderer` per webview, `utility`).
//! The renderer is the process the operator's machine feels; its working set
//! is the number Task Manager shows and the JS heap cannot, which is how P11.4
//! hid for three Plays.
//!
//! Renderers are not labelled by webview. WebView2 gives a renderer no name
//! the host can read back, so they appear as `renderer` with their pid; the
//! biggest one is Studio (it holds the Viewer iframe too).

use std::path::{Path, PathBuf};

use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

use super::line::{Disk, OsSample, Proc};

pub struct OsSampler {
    sys: System,
    me: Pid,
    /// Where the data files live, for the disk figures.
    data_dir: Option<PathBuf>,
    perf_file: Option<PathBuf>,
}

fn mb(bytes: u64) -> f64 {
    (bytes as f64 / 1_048_576.0 * 10.0).round() / 10.0
}

fn size_of(path: &Path) -> u64 {
    std::fs::metadata(path).map_or(0, |m| m.len())
}

/// The `--type=` argument of a Chromium child, or `browser` when it has none.
pub fn role_of(cmd: &[String]) -> String {
    cmd.iter()
        .find_map(|a| a.strip_prefix("--type=").map(str::to_string))
        .unwrap_or_else(|| "browser".to_string())
}

impl OsSampler {
    pub fn new(data_dir: Option<PathBuf>, perf_file: Option<PathBuf>) -> Self {
        let me = sysinfo::get_current_pid().unwrap_or_else(|_| Pid::from_u32(std::process::id()));
        Self {
            sys: System::new(),
            me,
            data_dir,
            perf_file,
        }
    }

    /// Refresh and read. The first call reports zero CPU: `sysinfo` measures
    /// CPU between two refreshes, and the writer calls this once a second.
    pub fn sample(&mut self) -> OsSample {
        self.sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            // `cmd` is what carries `--type=`; without asking for it the
            // children all read as `browser`.
            ProcessRefreshKind::nothing()
                .with_memory()
                .with_cpu()
                .with_cmd(UpdateKind::Always),
        );
        let all = self.sys.processes();
        let mut procs: Vec<Proc> = all
            .iter()
            .filter(|(pid, p)| **pid == self.me || self.descends_from_me(p.parent()))
            .map(|(pid, p)| {
                let role = if *pid == self.me {
                    "host".to_string()
                } else {
                    role_of(&p.cmd().iter().map(|s| s.to_string_lossy().into_owned()).collect::<Vec<_>>())
                };
                Proc {
                    pid: pid.as_u32(),
                    role,
                    cpu: (p.cpu_usage() * 10.0).round() / 10.0,
                    ws_mb: mb(p.memory()),
                }
            })
            .collect();
        procs.sort_by(|a, b| b.ws_mb.total_cmp(&a.ws_mb));
        let total_ws_mb = (procs.iter().map(|p| p.ws_mb).sum::<f64>() * 10.0).round() / 10.0;
        let total_cpu = (procs.iter().map(|p| p.cpu).sum::<f32>() * 10.0).round() / 10.0;
        OsSample {
            procs,
            total_ws_mb,
            total_cpu,
            disk: self.disk(),
        }
    }

    fn descends_from_me(&self, mut parent: Option<Pid>) -> bool {
        let all = self.sys.processes();
        let mut hops = 0;
        while let Some(pid) = parent {
            if pid == self.me {
                return true;
            }
            hops += 1;
            if hops > 16 {
                return false;
            }
            parent = all.get(&pid).and_then(|p| p.parent());
        }
        false
    }

    fn disk(&self) -> Disk {
        let Some(dir) = &self.data_dir else {
            return Disk::default();
        };
        Disk {
            db_mb: mb(size_of(&dir.join("questiongame.sqlite3"))),
            wal_mb: mb(size_of(&dir.join("questiongame.sqlite3-wal"))),
            log_mb: mb(size_of(&dir.join("questiongame.log"))),
            perf_mb: self.perf_file.as_deref().map_or(0.0, |p| mb(size_of(p))),
            free_mb: fs4::available_space(dir).ok().map(mb),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn role_comes_from_the_type_argument() {
        let cmd = |s: &str| s.split(' ').map(String::from).collect::<Vec<_>>();
        assert_eq!(role_of(&cmd("msedgewebview2.exe --type=renderer --lang=en")), "renderer");
        assert_eq!(role_of(&cmd("msedgewebview2.exe --type=gpu-process")), "gpu-process");
        assert_eq!(role_of(&cmd("msedgewebview2.exe --embedding")), "browser");
    }

    #[test]
    fn the_sample_contains_this_process_as_host() {
        let mut s = OsSampler::new(None, None);
        let sample = s.sample();
        let me = sample
            .procs
            .iter()
            .find(|p| p.pid == std::process::id())
            .expect("own process");
        assert_eq!(me.role, "host");
        assert!(me.ws_mb > 0.0);
        assert!(sample.total_ws_mb >= me.ws_mb);
    }
}

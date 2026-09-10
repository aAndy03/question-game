//! What the app weighs: the host process and every process under it, which
//! on Windows is the WebView2 tree — one renderer per webview, a GPU process,
//! a few utilities. Sampled every thirty seconds into the log, with the rate
//! since the previous line.
//!
//! This exists because the JS heap is the wrong number. The leak this was
//! written for (2026-09-09) was 2.8 GB of `PerformanceMeasure` entries in the
//! Studio renderer — Blink objects, not V8 ones — and `usedJSHeapSize` sat at
//! 40 MB the whole time. Task Manager saw it; nothing in the log did. The
//! working set of the renderer is what the operator's machine feels, so that
//! is what goes on the line.
//!
//! The OS half is a value, not a trait: [`sample`] returns rows, and
//! [`Watch::line`] turns rows into a line, so the formatting and the rate
//! arithmetic are tested with a literal `Vec`. Only Windows is implemented;
//! elsewhere the line says so rather than guessing.

use std::time::Instant;

/// One process, as the OS reports it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessMemory {
    pub pid: u32,
    /// The executable name without extension, lower-case: `questiongame`,
    /// `msedgewebview2`.
    pub name: String,
    pub working_set_bytes: u64,
    pub private_bytes: u64,
}

const MB: f64 = 1_048_576.0;

/// The rate arithmetic between samples. One per process, held by the watch.
#[derive(Debug, Default)]
pub struct Watch {
    last: Option<(Instant, u64)>,
}

impl Watch {
    /// Format one log line for `rows` taken at `now`: the total working set,
    /// the delta and rate against the previous call, then every process
    /// largest first. Rows are whatever [`sample`] returned; an empty list is
    /// reported as unavailable rather than as zero.
    pub fn line(&mut self, rows: &[ProcessMemory], now: Instant) -> String {
        if rows.is_empty() {
            return "memory: unavailable on this OS".to_string();
        }
        let total: u64 = rows.iter().map(|r| r.working_set_bytes).sum();
        let mut parts = vec![format!("totalWsMb={:.0}", total as f64 / MB)];
        if let Some((at, prev)) = self.last {
            let minutes = now.duration_since(at).as_secs_f64() / 60.0;
            let delta = total as f64 - prev as f64;
            parts.push(format!("deltaMb={:+.1}", delta / MB));
            if minutes > 0.0 {
                parts.push(format!("mbPerMin={:+.1}", delta / MB / minutes));
            }
        }
        self.last = Some((now, total));
        let mut sorted: Vec<&ProcessMemory> = rows.iter().collect();
        sorted.sort_by(|a, b| b.working_set_bytes.cmp(&a.working_set_bytes));
        for r in sorted {
            parts.push(format!(
                "{}[{}]=ws:{:.0}/priv:{:.0}",
                r.name,
                r.pid,
                r.working_set_bytes as f64 / MB,
                r.private_bytes as f64 / MB
            ));
        }
        parts.join(" ")
    }
}

/// This process and every descendant, or an empty list where unsupported.
pub fn sample() -> Vec<ProcessMemory> {
    os::sample()
}

#[cfg(windows)]
mod os {
    use super::ProcessMemory;
    use std::collections::HashMap;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::ProcessStatus::{
        K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    struct Entry {
        parent: u32,
        name: String,
    }

    /// Every process on the machine, keyed by pid.
    fn processes() -> HashMap<u32, Entry> {
        let mut out = HashMap::new();
        // SAFETY: plain Win32 calls with a correctly sized, zeroed entry; the
        // snapshot handle is closed before returning on every path.
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap.is_null() || snap as isize == -1 {
                return out;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            if Process32FirstW(snap, &mut entry) != 0 {
                loop {
                    let len = entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    let exe = String::from_utf16_lossy(&entry.szExeFile[..len]);
                    let name = exe
                        .rsplit_once('.')
                        .map_or(exe.as_str(), |(stem, _)| stem)
                        .to_ascii_lowercase();
                    out.insert(
                        entry.th32ProcessID,
                        Entry {
                            parent: entry.th32ParentProcessID,
                            name,
                        },
                    );
                    if Process32NextW(snap, &mut entry) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snap);
        }
        out
    }

    fn memory_of(pid: u32) -> Option<(u64, u64)> {
        // SAFETY: the handle is checked before use and closed after; the
        // counters struct is the documented size for the `_EX` variant.
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return None;
            }
            let mut counters: PROCESS_MEMORY_COUNTERS_EX = std::mem::zeroed();
            counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
            let ok = K32GetProcessMemoryInfo(
                handle,
                std::ptr::from_mut(&mut counters).cast::<PROCESS_MEMORY_COUNTERS>(),
                counters.cb,
            );
            CloseHandle(handle);
            (ok != 0).then_some((counters.WorkingSetSize as u64, counters.PrivateUsage as u64))
        }
    }

    pub fn sample() -> Vec<ProcessMemory> {
        let all = processes();
        let me = std::process::id();
        // Descendants by walking parents up to us. Pids are recycled, so a
        // parent that is no longer alive ends the walk rather than looping.
        let mut mine: Vec<u32> = all
            .keys()
            .copied()
            .filter(|&pid| {
                let mut cur = pid;
                let mut hops = 0;
                while cur != me && hops < 16 {
                    match all.get(&cur) {
                        Some(e) if e.parent != cur => cur = e.parent,
                        _ => return false,
                    }
                    hops += 1;
                }
                cur == me
            })
            .collect();
        mine.sort_unstable();
        mine.into_iter()
            .filter_map(|pid| {
                let (working_set_bytes, private_bytes) = memory_of(pid)?;
                Some(ProcessMemory {
                    pid,
                    name: all.get(&pid).map_or_else(|| "?".into(), |e| e.name.clone()),
                    working_set_bytes,
                    private_bytes,
                })
            })
            .collect()
    }
}

#[cfg(not(windows))]
mod os {
    use super::ProcessMemory;

    /// Not implemented off Windows; the line says so.
    pub fn sample() -> Vec<ProcessMemory> {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn row(pid: u32, name: &str, ws_mb: u64) -> ProcessMemory {
        ProcessMemory {
            pid,
            name: name.into(),
            working_set_bytes: ws_mb * 1_048_576,
            private_bytes: ws_mb * 1_048_576 / 2,
        }
    }

    #[test]
    fn line_carries_total_rate_and_processes_largest_first() {
        let mut watch = Watch::default();
        let t0 = Instant::now();
        let first = watch.line(&[row(1, "questiongame", 50), row(2, "msedgewebview2", 300)], t0);
        assert!(first.starts_with("totalWsMb=350 "), "{first}");
        assert!(!first.contains("mbPerMin"), "no rate on the first sample: {first}");
        assert!(first.contains("msedgewebview2[2]=ws:300/priv:150 questiongame[1]=ws:50/priv:25"), "{first}");

        let second = watch.line(
            &[row(1, "questiongame", 50), row(2, "msedgewebview2", 360)],
            t0 + Duration::from_secs(30),
        );
        assert!(second.contains("deltaMb=+60.0"), "{second}");
        assert!(second.contains("mbPerMin=+120.0"), "{second}");
    }

    #[test]
    fn empty_sample_is_reported_as_unavailable() {
        assert_eq!(Watch::default().line(&[], Instant::now()), "memory: unavailable on this OS");
    }

    #[cfg(windows)]
    #[test]
    fn sample_includes_this_process() {
        let rows = sample();
        let me = std::process::id();
        let mine = rows.iter().find(|r| r.pid == me).expect("own process in the sample");
        assert!(mine.working_set_bytes > 0);
        assert!(!mine.name.is_empty());
    }
}

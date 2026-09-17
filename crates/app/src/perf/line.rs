//! One line of the performance log, and how a second's worth of facts becomes
//! one.
//!
//! Three layers, flat keys, stable names: `os` is what the operating system
//! saw, `host` is what this process did, and one key per webview label is
//! what that webview reported about itself. `spike` appears only on a second
//! that crossed a threshold and carries the detail that explains it — the
//! components that committed most, the longest tasks, the commands that held
//! the lock longest — so a quiet minute reads as sixty short lines and a bad
//! second explains itself.
//!
//! Everything here is a value: [`build`] takes the three inputs and returns
//! the line, and the tests feed it literals.

use std::collections::BTreeMap;

use serde::Serialize;

/// Working-set growth in one second that counts as a spike, in bytes. A
/// webview starting or a Play loading moves 30 MB in a second and is not a
/// finding; 32 MB in a second with nothing loading is.
pub const SPIKE_WS_DELTA_BYTES: u64 = 32 * 1024 * 1024;
/// CPU of any one process in our tree, percent of one core. A dev-build
/// renderer sits at 25–40 % during a countdown; half a core is abnormal.
pub const SPIKE_CPU_PERCENT: f32 = 50.0;
/// A single long task in a webview, milliseconds.
pub const SPIKE_LONG_TASK_MS: f64 = 100.0;
/// React commits in one webview in one second.
pub const SPIKE_COMMITS: u64 = 60;
/// The host lock held by one command, in total over the second.
pub const SPIKE_LOCK_MS: f64 = 100.0;

/// One process, as `sysinfo` reported it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Proc {
    pub pid: u32,
    /// `host` for this process; for a WebView2 child, its `--type=` argument
    /// (`renderer`, `gpu-process`, `utility`, `browser`).
    pub role: String,
    /// Percent of one core over the last second.
    pub cpu: f32,
    pub ws_mb: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct Disk {
    pub db_mb: f64,
    pub wal_mb: f64,
    pub log_mb: f64,
    pub perf_mb: f64,
    pub free_mb: Option<f64>,
}

/// The OS layer for one second.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct OsSample {
    pub procs: Vec<Proc>,
    pub total_ws_mb: f64,
    pub total_cpu: f32,
    pub disk: Disk,
}

/// What one command did over the second.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct CommandStat {
    pub n: u64,
    /// Milliseconds the host lock was held by this command, summed.
    pub lock_ms: f64,
    pub lock_ms_max: f64,
}

/// The host layer for one second: what this process did. Filled by the
/// tracing layer (`layer.rs`) from `target: "perf"` events.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct HostSecond {
    pub commands: BTreeMap<String, CommandStat>,
    /// Commands the guard refused.
    pub refused: u64,
    /// `play-state` emissions — the event-driven channel.
    pub emits: u64,
    /// `play-tick` emissions — the 100 ms show loop's channel (P11.9).
    ///
    /// Counted apart from `emits` because the split is the thing worth
    /// watching: a run where `emits` is large is a run where something kept
    /// changing the Play, and a run where `tick_emits` is large is just a
    /// timer running. `emit_bytes` is the **total** of both, so it stays a
    /// straight answer to "how much went on the wire".
    pub tick_emits: u64,
    pub emit_bytes: u64,
    /// Play appends that reached `play_persist`, and the fsync time they cost.
    pub persists: u64,
    pub persist_ms: f64,
    /// Show-loop ticks that took the lock (they are also `commands["tick"]`).
    pub ticks: u64,
}

/// What a webview posted through `perf_report`. Untyped on purpose: the
/// webview owns its shape, the host owns the line, and `top` is the only key
/// the host looks inside — it moves into `spike` and out of the per-second
/// body, so the detail is written only when something explains a spike.
pub type WebviewReport = serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Spike {
    pub trigger: Vec<String>,
    /// Commands that ran this second, longest lock first.
    pub commands: Vec<(String, CommandStat)>,
    /// Each webview's `top` section, by label.
    pub webviews: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Line {
    /// RFC 3339, local clock.
    pub t: String,
    /// Seconds since this file was opened.
    pub sec: u64,
    /// `dev` or `release` (P12.1). A release line has no webview keys by
    /// design — this is what tells a reader that from a webview that stopped.
    pub build: &'static str,
    pub os: OsSample,
    pub host: HostSecond,
    #[serde(flatten)]
    pub webviews: BTreeMap<String, WebviewReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spike: Option<Spike>,
}

/// One second's facts, ready to become a line.
pub struct Inputs {
    pub t: String,
    pub sec: u64,
    pub build: &'static str,
    pub os: OsSample,
    /// The previous second's total working set, for the growth trigger.
    pub prev_total_ws_bytes: Option<u64>,
    pub host: HostSecond,
    pub webviews: BTreeMap<String, WebviewReport>,
}

fn mb(bytes: u64) -> f64 {
    (bytes as f64 / 1_048_576.0 * 10.0).round() / 10.0
}

fn round3(ms: f64) -> f64 {
    (ms * 1000.0).round() / 1000.0
}

/// Build the line, deciding whether this second is a spike.
pub fn build(mut inputs: Inputs) -> Line {
    // Sums of timings carry float noise; three decimals of a millisecond is
    // all a reader wants.
    for stat in inputs.host.commands.values_mut() {
        stat.lock_ms = round3(stat.lock_ms);
        stat.lock_ms_max = round3(stat.lock_ms_max);
    }
    inputs.host.persist_ms = round3(inputs.host.persist_ms);
    let mut trigger = Vec::new();
    let total_ws = (inputs.os.total_ws_mb * 1_048_576.0) as u64;
    if let Some(prev) = inputs.prev_total_ws_bytes
        && total_ws > prev
        && total_ws - prev >= SPIKE_WS_DELTA_BYTES
    {
        trigger.push(format!("ws+{}MB", mb(total_ws - prev)));
    }
    for p in &inputs.os.procs {
        if p.cpu >= SPIKE_CPU_PERCENT {
            trigger.push(format!("cpu {}[{}]={:.0}%", p.role, p.pid, p.cpu));
        }
    }
    for (name, stat) in &inputs.host.commands {
        if stat.lock_ms >= SPIKE_LOCK_MS {
            trigger.push(format!("lock {name}={:.0}ms", stat.lock_ms));
        }
    }
    let mut tops = BTreeMap::new();
    for (label, report) in &mut inputs.webviews {
        if let Some(obj) = report.as_object_mut() {
            if let Some(n) = obj.get("commits").and_then(serde_json::Value::as_u64)
                && n >= SPIKE_COMMITS
            {
                trigger.push(format!("commits {label}={n}"));
            }
            if let Some(ms) = obj
                .get("longTaskMaxMs")
                .and_then(serde_json::Value::as_f64)
                && ms >= SPIKE_LONG_TASK_MS
            {
                trigger.push(format!("longTask {label}={ms:.0}ms"));
            }
            if let Some(top) = obj.remove("top") {
                tops.insert(label.clone(), top);
            }
        }
    }
    let spike = (!trigger.is_empty()).then(|| {
        let mut commands: Vec<(String, CommandStat)> = inputs
            .host
            .commands
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        commands.sort_by(|a, b| b.1.lock_ms.total_cmp(&a.1.lock_ms));
        commands.truncate(5);
        Spike {
            trigger,
            commands,
            webviews: tops,
        }
    });
    Line {
        t: inputs.t,
        sec: inputs.sec,
        build: inputs.build,
        os: inputs.os,
        host: inputs.host,
        webviews: inputs.webviews,
        spike,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn os(ws_mb: f64, cpu: f32) -> OsSample {
        OsSample {
            procs: vec![Proc {
                pid: 1,
                role: "host".into(),
                cpu,
                ws_mb,
            }],
            total_ws_mb: ws_mb,
            total_cpu: cpu,
            disk: Disk::default(),
        }
    }

    fn inputs(os: OsSample, prev: Option<u64>) -> Inputs {
        Inputs {
            t: "2026-09-10T10:00:00+03:00".into(),
            sec: 7,
            build: "dev",
            os,
            prev_total_ws_bytes: prev,
            host: HostSecond::default(),
            webviews: BTreeMap::new(),
        }
    }

    #[test]
    fn a_line_says_which_build_wrote_it() {
        let mut i = inputs(os(300.0, 1.0), None);
        i.build = "release";
        let text = serde_json::to_string(&build(i)).unwrap();
        assert!(text.contains("\"build\":\"release\""), "{text}");
        assert!(!text.contains("\"main\""), "a release line carries no webview section: {text}");
    }

    #[test]
    fn a_quiet_second_has_no_spike_and_no_top_sections() {
        let mut i = inputs(os(300.0, 2.0), Some(300 * 1_048_576));
        i.webviews.insert(
            "main".into(),
            json!({ "heapMb": 40, "commits": 10, "longTaskMaxMs": 12.0, "top": { "components": [] } }),
        );
        let line = build(i);
        assert!(line.spike.is_none());
        // The per-second body never carries the detail.
        assert!(line.webviews["main"].get("top").is_none());
        let text = serde_json::to_string(&line).unwrap();
        assert!(!text.contains("\"spike\""), "{text}");
        assert!(text.contains("\"main\":{"), "webviews are flattened by label: {text}");
    }

    #[test]
    fn growth_cpu_lock_commits_and_long_tasks_each_trigger_a_spike() {
        let mut i = inputs(os(340.0, 60.0), Some(300 * 1_048_576));
        i.host.commands.insert(
            "catalog_upsert_many".into(),
            CommandStat {
                n: 1,
                lock_ms: 140.0,
                lock_ms_max: 140.0,
            },
        );
        i.host.commands.insert(
            "get_state".into(),
            CommandStat {
                n: 12,
                lock_ms: 3.0,
                lock_ms_max: 0.5,
            },
        );
        i.webviews.insert(
            "main".into(),
            json!({ "commits": 90, "longTaskMaxMs": 180.0, "top": { "components": [["Viewer", 40]] } }),
        );
        let line = build(i);
        let spike = line.spike.expect("a spike");
        assert_eq!(
            spike.trigger,
            vec![
                "ws+40MB",
                "cpu host[1]=60%",
                "lock catalog_upsert_many=140ms",
                "commits main=90",
                "longTask main=180ms",
            ]
        );
        assert_eq!(spike.commands[0].0, "catalog_upsert_many", "longest lock first");
        assert_eq!(spike.webviews["main"], json!({ "components": [["Viewer", 40]] }));
        assert!(line.webviews["main"].get("top").is_none());
    }

    #[test]
    fn the_first_second_cannot_trigger_on_growth() {
        let line = build(inputs(os(900.0, 1.0), None));
        assert!(line.spike.is_none());
    }
}

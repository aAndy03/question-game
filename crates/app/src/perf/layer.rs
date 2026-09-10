//! Attribution: what the host did in a second, folded from `tracing` events.
//!
//! The choke points already exist — every command passes `guard::allow`,
//! every lock is a `HostGuard`, every append goes through `Host::write`, every
//! `play-state` goes through `emit::play_state` — so each of them emits one
//! `tracing::trace!(target: "perf", …)` event with a `kind`, and this layer
//! adds it to the current second's [`HostSecond`]. Nothing else in the app
//! knows the layer exists; the ordinary log layers filter `perf` out because
//! their filters name the two crates, not this target.
//!
//! The kinds, and the fields each carries:
//!
//! ```text
//! command   name                      guard::allow accepted a command
//! refused   name                      guard::allow refused one
//! lock      command, ms               a HostGuard was dropped
//! persist   ms                        Host::write reached play_persist
//! emit      bytes                     play_state went out
//! tick                                the show loop took the lock
//! ```

use std::sync::{Arc, Mutex};

use tracing::field::{Field, Visit};
use tracing::{Event, Subscriber};
use tracing_subscriber::layer::{Context, Layer};

use super::line::HostSecond;

pub const TARGET: &str = "perf";

/// The second being accumulated, shared between the layer and the writer.
#[derive(Debug, Clone, Default)]
pub struct Counters(Arc<Mutex<HostSecond>>);

impl Counters {
    /// Hand back the second so far and start a fresh one.
    pub fn take(&self) -> HostSecond {
        let mut guard = self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        std::mem::take(&mut *guard)
    }

    fn apply(&self, seen: &Seen) {
        let mut s = self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        match seen.kind.as_str() {
            "command" => {
                s.commands.entry(seen.name.clone()).or_default().n += 1;
            }
            "refused" => s.refused += 1,
            "lock" => {
                let stat = s.commands.entry(seen.name.clone()).or_default();
                stat.lock_ms += seen.ms;
                if seen.ms > stat.lock_ms_max {
                    stat.lock_ms_max = seen.ms;
                }
            }
            "persist" => {
                s.persists += 1;
                s.persist_ms += seen.ms;
            }
            "emit" => {
                s.emits += 1;
                s.emit_bytes += seen.bytes;
            }
            "tick" => {
                s.ticks += 1;
                s.commands.entry("tick".into()).or_default().n += 1;
            }
            _ => {}
        }
    }
}

#[derive(Default)]
struct Seen {
    kind: String,
    name: String,
    ms: f64,
    bytes: u64,
}

impl Visit for Seen {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        match field.name() {
            "kind" => self.kind = format!("{value:?}").trim_matches('"').to_string(),
            "name" => self.name = format!("{value:?}").trim_matches('"').to_string(),
            _ => {}
        }
    }
    fn record_str(&mut self, field: &Field, value: &str) {
        match field.name() {
            "kind" => self.kind = value.to_string(),
            "name" => self.name = value.to_string(),
            _ => {}
        }
    }
    fn record_f64(&mut self, field: &Field, value: f64) {
        if field.name() == "ms" {
            self.ms = value;
        }
    }
    fn record_u64(&mut self, field: &Field, value: u64) {
        match field.name() {
            "bytes" => self.bytes = value,
            "ms" => self.ms = value as f64,
            _ => {}
        }
    }
    fn record_i64(&mut self, field: &Field, value: i64) {
        if field.name() == "bytes" {
            self.bytes = value.max(0) as u64;
        }
    }
}

/// The `tracing` layer. Cheap: a target check and a few integer adds.
pub struct PerfLayer {
    counters: Counters,
}

impl PerfLayer {
    pub fn new(counters: Counters) -> Self {
        Self { counters }
    }
}

/// Installed behind a per-layer filter on the target (`lib.rs`), never by
/// overriding `Layer::enabled`: a layer's `enabled` answers for the *whole*
/// subscriber, so returning `false` for everything that is not `perf` would
/// silence the log file itself (it did, for one boot on 2026-09-10).
impl<S: Subscriber> Layer<S> for PerfLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        if event.metadata().target() != TARGET {
            return;
        }
        let mut seen = Seen::default();
        event.record(&mut seen);
        self.counters.apply(&seen);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tracing_subscriber::layer::SubscriberExt;

    #[test]
    fn events_fold_into_the_second_and_take_resets_it() {
        let counters = Counters::default();
        let subscriber = tracing_subscriber::registry().with(PerfLayer::new(counters.clone()));
        tracing::subscriber::with_default(subscriber, || {
            tracing::trace!(target: TARGET, kind = "command", name = "get_state");
            tracing::trace!(target: TARGET, kind = "command", name = "get_state");
            tracing::trace!(target: TARGET, kind = "lock", name = "get_state", ms = 0.4_f64);
            tracing::trace!(target: TARGET, kind = "lock", name = "get_state", ms = 1.2_f64);
            tracing::trace!(target: TARGET, kind = "refused", name = "give_token");
            tracing::trace!(target: TARGET, kind = "persist", ms = 2.5_f64);
            tracing::trace!(target: TARGET, kind = "emit", bytes = 4096_u64);
            tracing::trace!(target: TARGET, kind = "tick");
            // Not ours: ignored, whatever it carries.
            tracing::trace!(kind = "command", name = "give_token");
        });
        let second = counters.take();
        let get_state = &second.commands["get_state"];
        assert_eq!(get_state.n, 2);
        assert!((get_state.lock_ms - 1.6).abs() < 1e-9);
        assert!((get_state.lock_ms_max - 1.2).abs() < 1e-9);
        assert_eq!(second.refused, 1);
        assert_eq!(second.persists, 1);
        assert_eq!(second.emits, 1);
        assert_eq!(second.emit_bytes, 4096);
        assert_eq!(second.ticks, 1);
        assert!(!second.commands.contains_key("give_token"));

        assert_eq!(counters.take(), HostSecond::default(), "take resets");
    }
}

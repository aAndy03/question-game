//! The question countdown — host-authoritative (§2.4).
//!
//! Time enters this module one way: a command carries the millisecond it
//! happened at. Nothing here reads a clock, and — the part that matters —
//! **nothing here changes state on a tick.** A running timer is stored as
//! `remaining_ms as of running_since_ms`, so `remaining_at(now)` is arithmetic,
//! not a mutation. Two consequences:
//!
//! - Polling at 100ms (or at 7ms, or not at all) cannot change the Play. The
//!   emission cadence is a presentation concern.
//! - Zero is reached at a computed instant (`zero_at`), not at whichever tick
//!   noticed it, so a replay of the event log lands on the same millisecond and
//!   the same points.
//!
//! The frontend may interpolate between emissions but must never run past host
//! zero — the T=0 table is the host's to apply:
//!
//! | Selection at T=0 | What happens |
//! | --- | --- |
//! | At least one option selected | Auto-**lock**. Never auto-reveal. |
//! | Nothing selected, nothing locked | `expired_open`. Still selectable. |
//!
//! At operator pace there is no `Timer` at all — the session's timer is `None`,
//! `start_timer` rejects, and the Stage clock node hides.

use serde::{Deserialize, Serialize};

use crate::error::{MatchError, MatchResult};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Timer {
    duration_ms: u32,
    /// Remaining as of `running_since_ms`, or outright when stopped.
    remaining_ms: u32,
    /// `Some(instant)` while the countdown runs.
    running_since_ms: Option<u64>,
    /// Frozen at lock; feeds lock-speed scoring (§2.3).
    remaining_ms_at_lock: Option<u32>,
    /// Hit zero with nothing selected and nothing locked (§2.4).
    expired_open: bool,
}

impl Timer {
    pub fn new(duration_ms: u32) -> Self {
        Timer {
            duration_ms,
            remaining_ms: duration_ms,
            running_since_ms: None,
            remaining_ms_at_lock: None,
            expired_open: false,
        }
    }

    pub fn duration_ms(&self) -> u32 {
        self.duration_ms
    }

    pub fn running(&self) -> bool {
        self.running_since_ms.is_some()
    }

    pub fn remaining_ms_at_lock(&self) -> Option<u32> {
        self.remaining_ms_at_lock
    }

    pub fn expired_open(&self) -> bool {
        self.expired_open
    }

    /// Remaining milliseconds as of `now_ms`. The 100ms emission reads this;
    /// it never writes.
    pub fn remaining_at(&self, now_ms: u64) -> u32 {
        match self.running_since_ms {
            None => self.remaining_ms,
            Some(since) => {
                let elapsed = u32::try_from(now_ms.saturating_sub(since)).unwrap_or(u32::MAX);
                self.remaining_ms.saturating_sub(elapsed)
            }
        }
    }

    pub fn at_zero(&self, now_ms: u64) -> bool {
        self.remaining_at(now_ms) == 0
    }

    /// The instant the countdown reaches zero if left running. `None` when it
    /// is not running. The service applies the T=0 table *at this instant*, not
    /// at the tick that noticed it, so a slow poll cannot cost a team points.
    pub fn zero_at(&self) -> Option<u64> {
        self.running_since_ms
            .map(|since| since + u64::from(self.remaining_ms))
    }

    /// `start_timer` — also the resume after a Play pause (§5.1).
    pub fn start(&mut self, now_ms: u64) -> MatchResult<()> {
        if self.running() {
            return Err(MatchError::TimerAlreadyRunning);
        }
        if self.at_zero(now_ms) {
            return Err(MatchError::TimerAtZero);
        }
        self.running_since_ms = Some(now_ms);
        Ok(())
    }

    pub fn pause(&mut self, now_ms: u64) -> MatchResult<()> {
        if !self.running() {
            return Err(MatchError::TimerNotRunning);
        }
        self.stop_at(now_ms);
        Ok(())
    }

    /// Pausing the Play pauses a running countdown, and says nothing if it was
    /// already stopped (§5.1). Not an operator command; cannot fail.
    pub fn suspend(&mut self, now_ms: u64) {
        self.stop_at(now_ms);
    }

    /// Lock stops the clock and stores `remaining_ms_at_lock` (§2.4).
    pub fn lock(&mut self, now_ms: u64) -> u32 {
        self.stop_at(now_ms);
        self.remaining_ms_at_lock = Some(self.remaining_ms);
        self.expired_open = false;
        self.remaining_ms
    }

    /// The countdown reached zero. `at_ms` is the computed zero instant.
    pub fn expire(&mut self, at_ms: u64) {
        self.stop_at(at_ms);
        self.remaining_ms = 0;
    }

    /// T=0 with nothing selected and nothing locked: the question stays open
    /// and selectable, and nothing is auto-revealed (§2.4).
    pub fn mark_expired_open(&mut self) {
        self.expired_open = true;
    }

    fn stop_at(&mut self, now_ms: u64) {
        self.remaining_ms = self.remaining_at(now_ms);
        self.running_since_ms = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_paused_timer_does_not_lose_time() {
        let mut timer = Timer::new(30_000);
        timer.start(0).unwrap();
        assert_eq!(timer.remaining_at(10_000), 20_000);
        timer.pause(10_000).unwrap();
        assert_eq!(timer.remaining_at(60_000), 20_000);
        timer.start(60_000).unwrap();
        assert_eq!(timer.remaining_at(65_000), 15_000);
    }

    #[test]
    fn zero_is_a_computed_instant_not_a_tick() {
        let mut timer = Timer::new(1_000);
        timer.start(500).unwrap();
        assert_eq!(timer.zero_at(), Some(1_500));
        // Noticed late, at 1_900 — the expiry still lands on 1_500.
        assert!(timer.at_zero(1_900));
        timer.expire(timer.zero_at().unwrap());
        assert_eq!(timer.remaining_at(1_900), 0);
        assert!(!timer.running());
    }

    #[test]
    fn a_timer_at_zero_cannot_be_restarted() {
        let mut timer = Timer::new(1_000);
        timer.start(0).unwrap();
        timer.expire(1_000);
        assert_eq!(timer.start(1_000).unwrap_err(), MatchError::TimerAtZero);
    }

    #[test]
    fn starting_a_running_timer_is_a_reject_not_a_restart() {
        let mut timer = Timer::new(30_000);
        timer.start(0).unwrap();
        assert_eq!(
            timer.start(5_000).unwrap_err(),
            MatchError::TimerAlreadyRunning,
        );
        assert_eq!(timer.remaining_at(5_000), 25_000);
    }

    #[test]
    fn lock_freezes_the_remaining_time() {
        let mut timer = Timer::new(30_000);
        timer.start(0).unwrap();
        assert_eq!(timer.lock(12_000), 18_000);
        assert_eq!(timer.remaining_ms_at_lock(), Some(18_000));
        assert_eq!(
            timer.remaining_at(90_000),
            18_000,
            "a locked clock does not run",
        );
    }
}

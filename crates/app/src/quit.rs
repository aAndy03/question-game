//! Closing Studio asks first (P12.2; deferred from P7).
//!
//! Studio's close button — or Alt+F4 — used to end the process at once, so a
//! stray click mid-show blacked out Stage. Now the first press is held and
//! Studio is asked (`close-requested`); it answers `app_quit` or
//! `app_close_cancelled`. A **second press while the question is open exits
//! regardless**: a Studio that has stopped answering must not be able to keep
//! the operator in.

use std::sync::atomic::{AtomicBool, Ordering};

/// Whether a close request is waiting for Studio's answer.
#[derive(Debug, Default)]
pub struct QuitState {
    pending: AtomicBool,
}

/// What the window's close button does this time.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseDecision {
    /// Keep the window open and ask Studio.
    Ask,
    /// A request was already open: exit now.
    Exit,
}

impl QuitState {
    pub fn on_close_requested(&self) -> CloseDecision {
        if self.pending.swap(true, Ordering::SeqCst) {
            CloseDecision::Exit
        } else {
            CloseDecision::Ask
        }
    }

    /// Studio answered *keep working*.
    pub fn cancel(&self) {
        self.pending.store(false, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_press_asks_and_the_second_exits() {
        let quit = QuitState::default();
        assert_eq!(quit.on_close_requested(), CloseDecision::Ask);
        assert_eq!(quit.on_close_requested(), CloseDecision::Exit);
    }

    #[test]
    fn keep_working_makes_the_next_press_ask_again() {
        let quit = QuitState::default();
        assert_eq!(quit.on_close_requested(), CloseDecision::Ask);
        quit.cancel();
        assert_eq!(quit.on_close_requested(), CloseDecision::Ask);
    }
}

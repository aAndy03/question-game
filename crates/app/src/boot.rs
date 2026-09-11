//! When the app cannot start, or panics after it has (P12.1).
//!
//! A release build has no console (`windows_subsystem = "windows"`), so two
//! things that used to end on stderr ended nowhere: a `setup` that returned an
//! error, and a panic. The first now shows a message box and exits; the second
//! is written to the log before the previous hook runs.

use std::any::Any;
use std::path::Path;

/// The text of the boot-failure box: the reason, and where to read more.
pub fn message(reason: &str, log: Option<&Path>) -> String {
    match log {
        Some(path) => format!("{reason}\n\nThe log is at:\n{}", path.display()),
        None => reason.to_string(),
    }
}

/// Show why the app cannot start, then exit. Never returns.
///
/// `rfd` draws the box synchronously on the calling thread, which is the main
/// thread here: `setup` runs there, before the event loop.
pub fn fail(reason: &str, log: Option<&Path>) -> ! {
    tracing::error!(reason, "boot failed");
    let _ = rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title("questiongame could not start")
        .set_description(message(reason, log))
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
    std::process::exit(1)
}

/// One line that says what panicked, where, and on which thread.
pub fn describe_panic(
    payload: &(dyn Any + Send),
    location: Option<(&str, u32)>,
    thread: Option<&str>,
) -> String {
    let what = payload
        .downcast_ref::<&str>()
        .map(|s| (*s).to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "a panic with a non-text payload".to_string());
    let at = location.map_or_else(
        || "an unknown location".to_string(),
        |(file, line)| format!("{file}:{line}"),
    );
    format!("panic on thread `{}` at {at}: {what}", thread.unwrap_or("unnamed"))
}

/// Write every panic to the log, then let the previous hook do what it did.
/// `panic` stays `unwind`, so a panicking command fails that command and the
/// show goes on — this is how anyone finds out it happened.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info.location().map(|l| (l.file(), l.line()));
        let thread = std::thread::current();
        let line = describe_panic(info.payload(), location, thread.name());
        let backtrace = std::backtrace::Backtrace::capture();
        if backtrace.status() == std::backtrace::BacktraceStatus::Captured {
            tracing::error!("{line}\n{backtrace}");
        } else {
            tracing::error!("{line}");
        }
        previous(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_box_names_the_log_when_there_is_one() {
        let text = message(
            "the library is newer than this app",
            Some(Path::new("C:/data/questiongame.log")),
        );
        assert!(text.starts_with("the library is newer than this app"), "{text}");
        assert!(text.contains("questiongame.log"), "{text}");
        assert_eq!(message("no data folder", None), "no data folder");
    }

    #[test]
    fn a_panic_is_described_by_payload_place_and_thread() {
        let borrowed: Box<dyn Any + Send> = Box::new("index out of bounds");
        assert_eq!(
            describe_panic(borrowed.as_ref(), Some(("src/tick.rs", 42)), Some("tokio-runtime-worker")),
            "panic on thread `tokio-runtime-worker` at src/tick.rs:42: index out of bounds"
        );
        let owned: Box<dyn Any + Send> = Box::new(String::from("formatted 7"));
        assert!(describe_panic(owned.as_ref(), None, None).ends_with("an unknown location: formatted 7"));
        let other: Box<dyn Any + Send> = Box::new(7_u8);
        assert!(describe_panic(other.as_ref(), None, Some("main")).contains("non-text payload"));
    }
}

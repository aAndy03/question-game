//! Who sees *What's new*, and from which version (P12.10, P12.12).

use std::path::PathBuf;

use questiongame_app::whats_new::{Since, since};
use questiongame_host::catalog::OpenReport;

fn opened(existed: bool, previous: Option<&str>) -> OpenReport {
    OpenReport {
        existed,
        previous_version: previous.map(str::to_string),
        backup: existed.then(|| PathBuf::from("backup.sqlite3")),
    }
}

#[test]
fn a_new_library_sees_nothing_and_is_stamped_silently() {
    assert_eq!(since(None, Some(&opened(false, None))), Since::StampSilently);
}

#[test]
fn a_library_1_0_1_left_sees_everything_after_1_0_1() {
    // 1.0.1 never stamped the library: existing *and* unstamped is the tell.
    assert_eq!(
        since(None, Some(&opened(true, None))),
        Since::Show("1.0.1".to_string())
    );
}

/// From the 1.0.2 review: a library 1.0.2 created, whose first boot closed
/// before Studio asked, is not one 1.0.1 left — 1.0.2 stamped it.
#[test]
fn a_library_this_build_made_is_not_mistaken_for_one_1_0_1_left() {
    assert_eq!(
        since(None, Some(&opened(true, Some("1.0.2")))),
        Since::StampSilently
    );
}

#[test]
fn a_library_opened_without_a_report_sees_nothing() {
    // `Host::open` (memory, tests) has no report: nothing is an upgrade.
    assert_eq!(since(None, None), Since::StampSilently);
}

#[test]
fn a_seen_version_is_where_the_notes_start() {
    for report in [opened(true, Some("1.0.2")), opened(false, None)] {
        assert_eq!(
            since(Some("1.0.2".to_string()), Some(&report)),
            Since::Show("1.0.2".to_string())
        );
    }
}

//! Who sees *What's new*, and from which version (P12.10).

use questiongame_app::whats_new::{Since, since};

#[test]
fn a_new_library_sees_nothing_and_is_stamped_silently() {
    assert_eq!(since(None, false), Since::StampSilently);
}

#[test]
fn a_library_1_0_1_left_sees_everything_after_1_0_1() {
    // 1.0.1 never wrote a seen version: the library existing is the tell.
    assert_eq!(since(None, true), Since::Show("1.0.1".to_string()));
}

#[test]
fn a_seen_version_is_where_the_notes_start() {
    assert_eq!(since(Some("1.0.2".to_string()), true), Since::Show("1.0.2".to_string()));
    assert_eq!(since(Some("1.0.2".to_string()), false), Since::Show("1.0.2".to_string()));
}

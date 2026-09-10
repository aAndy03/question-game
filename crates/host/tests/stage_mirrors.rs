//! P11.11: several displays showing the same Stage.
//!
//! The operator has two audience displays and no HDMI splitter, so the app is
//! the splitter. One **pacer** — the Stage window that has always existed —
//! and N **mirrors** showing the identical picture.
//!
//! `StageDisplay` answers one question for the app crate: **which connected
//! displays should carry a mirror right now**. The app crate then makes the
//! windows match. Declarative rather than a diff of opens and closes:
//! reconciling to a set is idempotent, so the monitor watch can call it on
//! every display change without remembering what it did last time, and a
//! missed close cannot leave a window standing on a display that is gone.
//!
//! Nothing in this module can reach a Play, which is the property §9 asks of
//! it and every test here inherits.

use questiongame_host::{MonitorInfo, MonitorKey, StageDisplay, StageReattach};

fn monitor(name: &str, primary: bool, size: (u32, u32)) -> MonitorInfo {
    MonitorInfo {
        key: MonitorKey::derive(Some(name), size.0, size.1),
        name: Some(name.to_owned()),
        primary,
        position: (0, 0),
        size,
        physical_size: size,
        scale_factor: 1.0,
    }
}

fn key(name: &str, size: (u32, u32)) -> MonitorKey {
    MonitorKey::derive(Some(name), size.0, size.1)
}

/// The operator's desk: a laptop and two audience displays, one of them a
/// different resolution — which is the case that made P11.6 load-bearing.
fn desk() -> Vec<MonitorInfo> {
    vec![
        monitor("built-in", true, (1920, 1080)),
        monitor("tv-left", false, (1366, 768)),
        monitor("tv-right", false, (1920, 1080)),
    ]
}

fn left() -> MonitorKey {
    key("tv-left", (1366, 768))
}

fn right() -> MonitorKey {
    key("tv-right", (1920, 1080))
}

fn loaded() -> StageDisplay {
    let mut display = StageDisplay::new();
    display.monitors_changed(desk(), None, StageReattach::default(), false);
    display
}

#[test]
fn a_fresh_display_mirrors_nowhere() {
    assert!(loaded().live_mirrors().is_empty());
}

#[test]
fn a_mirror_is_added_and_removed_by_key() {
    let mut display = loaded();

    let wanted = display.add_mirror(left()).expect("connected");
    assert_eq!(wanted, vec![left()]);
    assert_eq!(display.live_mirrors(), vec![left()]);

    let wanted = display.remove_mirror(&left());
    assert!(wanted.is_empty());
    assert!(display.live_mirrors().is_empty());
}

#[test]
fn removing_one_that_is_not_mirroring_is_not_an_error() {
    let mut display = loaded();
    assert!(display.remove_mirror(&left()).is_empty());
}

#[test]
fn two_mirrors_keep_the_order_they_were_added_in() {
    let mut display = loaded();
    display.add_mirror(right()).unwrap();
    display.add_mirror(left()).unwrap();
    assert_eq!(display.live_mirrors(), vec![right(), left()]);
}

#[test]
fn a_display_that_is_not_connected_is_refused() {
    let mut display = loaded();
    assert!(display.add_mirror(key("projector", (1024, 768))).is_err());
    assert!(
        display.live_mirrors().is_empty(),
        "a refused write remembers nothing"
    );
}

#[test]
fn the_pacers_own_display_cannot_also_mirror() {
    let mut display = loaded();
    display.set_monitor(Some(left())).unwrap();
    assert!(
        display.add_mirror(left()).is_err(),
        "one pane per display, or two windows fight over one screen"
    );
}

#[test]
fn the_same_display_twice_is_refused() {
    let mut display = loaded();
    display.add_mirror(left()).unwrap();
    assert!(display.add_mirror(left()).is_err());
    assert_eq!(display.live_mirrors().len(), 1);
}

/// §9 preserved, per pane: unplugging a mirror's display takes that mirror
/// away and leaves the others standing. The pick is remembered, so the cable
/// coming back restores it.
#[test]
fn unplugging_a_mirrors_display_drops_only_that_mirror() {
    let mut display = loaded();
    display.add_mirror(left()).unwrap();
    display.add_mirror(right()).unwrap();

    let without_left = vec![
        monitor("built-in", true, (1920, 1080)),
        monitor("tv-right", false, (1920, 1080)),
    ];
    display.monitors_changed(without_left, None, StageReattach::default(), true);
    assert_eq!(display.live_mirrors(), vec![right()]);
    assert_eq!(
        display.wanted_mirrors(),
        [left(), right()],
        "waited for, not forgotten"
    );

    display.monitors_changed(desk(), None, StageReattach::default(), true);
    assert_eq!(display.live_mirrors(), vec![left(), right()]);
}

/// Sending the pacer to a display that is mirroring takes the mirror off it:
/// the operator asked for the pacer there, and one pane per display is the
/// rule.
#[test]
fn sending_the_pacer_to_a_mirrored_display_retires_that_mirror() {
    let mut display = loaded();
    display.add_mirror(left()).unwrap();
    display.add_mirror(right()).unwrap();

    display.set_monitor(Some(left())).unwrap();
    assert_eq!(display.live_mirrors(), vec![right()]);
    assert_eq!(
        display.wanted_mirrors(),
        [right()],
        "and it is forgotten, not merely hidden — the operator moved Stage there"
    );
}

/// The wanted list is restored wholesale by a settings load, so `live_mirrors`
/// is a function of (wanted, connected, pacer) and nothing else.
#[test]
fn a_remembered_list_is_restored_wholesale() {
    let mut display = loaded();
    display.set_wanted_mirrors(vec![left(), key("gone", (800, 600))]);
    assert_eq!(
        display.live_mirrors(),
        vec![left()],
        "a remembered display that is not here yet is waited for, not dropped"
    );
}

/// The answer does not drift when asked twice — which is what lets the app
/// crate reconcile windows to it on every display change.
#[test]
fn live_mirrors_is_idempotent() {
    let mut display = loaded();
    display.add_mirror(left()).unwrap();
    let once = display.live_mirrors();
    assert_eq!(once, display.live_mirrors());
    display.monitors_changed(desk(), None, StageReattach::default(), false);
    assert_eq!(once, display.live_mirrors());
}

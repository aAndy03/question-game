//! "Is there a newer release?" (P12.9) — everything about the answer except
//! the network, which is a parameter.

use questiongame_app::update::{Release, check, newer, parse_latest, release_url};

const RECORDED: &str = include_str!("fixtures/github-latest.json");

fn release(version: &str) -> Release {
    Release {
        version: semver::Version::parse(version).unwrap(),
    }
}

#[test]
fn parses_the_recorded_response() {
    assert_eq!(parse_latest(RECORDED), Some(release("1.0.3")));
}

#[test]
fn strips_the_v_and_takes_a_bare_tag_too() {
    assert_eq!(parse_latest(r#"{"tag_name":"1.2.0"}"#), Some(release("1.2.0")));
    assert_eq!(parse_latest(r#"{"tag_name":"v1.2.0"}"#), Some(release("1.2.0")));
}

#[test]
fn ignores_drafts_prereleases_and_anything_unreadable() {
    assert_eq!(parse_latest(r#"{"tag_name":"v2.0.0","draft":true}"#), None);
    assert_eq!(parse_latest(r#"{"tag_name":"v2.0.0","prerelease":true}"#), None);
    assert_eq!(parse_latest(r#"{"tag_name":"v2.0.0-rc.1"}"#), None);
    assert_eq!(parse_latest(r#"{"tag_name":"nightly"}"#), None);
    assert_eq!(parse_latest("<html>rate limited</html>"), None);
}

#[test]
fn ten_is_newer_than_nine() {
    assert!(newer("1.0.9", &release("1.0.10")));
}

#[test]
fn the_same_or_an_older_release_is_not_newer() {
    assert!(!newer("1.0.2", &release("1.0.2")));
    assert!(!newer("1.0.2", &release("1.0.1")));
}

#[test]
fn a_newer_release_is_reported_with_its_page() {
    let status = check(|| Ok(RECORDED.to_string()), "1.0.2").unwrap();
    assert_eq!(status.current, "1.0.2");
    assert_eq!(status.latest.as_deref(), Some("1.0.3"));
    assert!(status.newer);
    assert_eq!(
        status.url.as_deref(),
        Some("https://github.com/aAndy03/question-game/releases/tag/v1.0.3")
    );
}

#[test]
fn being_up_to_date_is_an_answer_too() {
    let status = check(|| Ok(RECORDED.to_string()), "1.0.3").unwrap();
    assert!(!status.newer);
    assert_eq!(status.latest.as_deref(), Some("1.0.3"));
}

#[test]
fn a_failed_fetch_is_an_error_not_a_panic() {
    assert!(check(|| Err("dns".to_string()), "1.0.2").is_err());
    assert!(check(|| Ok("{}".to_string()), "1.0.2").is_err());
}

#[test]
fn the_page_is_built_from_a_parsed_version_only() {
    assert_eq!(
        release_url(&semver::Version::parse("1.0.3").unwrap()),
        "https://github.com/aAndy03/question-game/releases/tag/v1.0.3"
    );
}

/// The real call, through the OS trust store. Not in the suite — it needs the
/// network — but `cargo test -p questiongame-app --test update -- --ignored`
/// is how a TLS or API change is caught before a release.
#[test]
#[ignore = "needs the network"]
fn the_live_api_answers_with_a_release() {
    let body = questiongame_app::update::fetch_latest().expect("GitHub answers");
    assert!(parse_latest(&body).is_some(), "a readable latest release: {body:.200}");
}

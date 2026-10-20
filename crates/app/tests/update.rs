//! "Is there a newer release?" (P12.9) — everything about the answer except
//! the network, which is a parameter.

use questiongame_app::identity::Line;
use questiongame_app::update::{Release, check, newer, parse_latest, parse_list, path_for, release_url};

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
    let status = check(|_| Ok(RECORDED.to_string()), "1.0.2", Line::Stable).unwrap();
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
    let status = check(|_| Ok(RECORDED.to_string()), "1.0.3", Line::Stable).unwrap();
    assert!(!status.newer);
    assert_eq!(status.latest.as_deref(), Some("1.0.3"));
}

#[test]
fn a_failed_fetch_is_an_error_not_a_panic() {
    assert!(check(|_| Err("dns".to_string()), "1.0.2", Line::Stable).is_err());
    assert!(check(|_| Ok("{}".to_string()), "1.0.2", Line::Stable).is_err());
}

#[test]
fn the_page_is_built_from_a_parsed_version_only() {
    assert_eq!(
        release_url(&semver::Version::parse("1.0.3").unwrap()),
        "https://github.com/aAndy03/question-game/releases/tag/v1.0.3"
    );
}

fn list(tags: &[&str]) -> String {
    let rows: Vec<String> = tags
        .iter()
        .map(|t| match t.strip_prefix("draft:") {
            Some(tag) => format!(r#"{{"tag_name":"{tag}","draft":true,"prerelease":false}}"#),
            None => format!(r#"{{"tag_name":"{t}","draft":false,"prerelease":{}}}"#, t.contains('-')),
        })
        .collect();
    format!("[{}]", rows.join(","))
}

fn beta(tags: &[&str], current: &str) -> questiongame_app::update::UpdateStatus {
    let body = list(tags);
    check(|_| Ok(body), current, Line::Beta).unwrap()
}

/// UPD02, UPD16: stable asks for the latest release only, and its answer is
/// 1.0.2's JSON — no `stableNewer` key at all.
#[test]
fn stable_reads_latest_only() {
    let status = check(
        |path| {
            assert_eq!(path, "/releases/latest");
            Ok(RECORDED.to_string())
        },
        "1.0.2",
        Line::Stable,
    )
    .unwrap();
    assert!(status.newer);
    assert_eq!(status.stable_newer, None);
    let json = serde_json::to_value(&status).unwrap();
    let mut keys: Vec<&String> = json.as_object().unwrap().keys().collect();
    keys.sort();
    assert_eq!(keys, ["current", "latest", "newer", "url"]);
}

/// UPD03, UPD04, UPD05, UPD07: newest by semver, not by list order; drafts
/// and unreadable tags skipped one by one.
#[test]
fn beta_reads_the_list() {
    let status = check(
        |path| {
            assert_eq!(path, "/releases?per_page=20");
            Ok(list(&["v2.0.0-beta.2", "v2.0.0-beta.10", "v2.0.0-beta.3", "draft:v2.0.0-beta.11", "nightly", "v1.2", "V1.0.0", "vx.y.z", ""]))
        },
        "2.0.0-beta.1",
        Line::Beta,
    )
    .unwrap();
    assert_eq!(status.latest.as_deref(), Some("2.0.0-beta.10"));
    assert!(status.newer);
    assert_eq!(status.stable_newer, None);
    assert_eq!(status.url.as_deref(), Some("https://github.com/aAndy03/question-game/releases/tag/v2.0.0-beta.10"));
}

/// UPD06: the tag decides what a release is, not GitHub's flag.
#[test]
fn the_tag_decides_not_the_flag() {
    let body = r#"[{"tag_name":"v2.0.0-rc.1","prerelease":false},{"tag_name":"v1.5.0","prerelease":true}]"#;
    let releases = parse_list(body);
    assert_eq!(releases, vec![release("2.0.0-rc.1"), release("1.5.0")]);
    // Seen from a beta, the stable-looking tag is a stable release.
    let status = check(|_| Ok(body.to_string()), "1.5.0-beta.1", Line::Beta).unwrap();
    assert_eq!(status.stable_newer.as_deref(), Some("1.5.0"));
}

/// UPD12, UPD13: a beta hears when a stable release is out.
#[test]
fn beta_hears_of_a_newer_stable() {
    let status = beta(&["v2.0.0", "v2.0.0-beta.4"], "2.0.0-beta.3");
    assert_eq!(status.latest.as_deref(), Some("2.0.0"));
    assert_eq!(status.stable_newer.as_deref(), Some("2.0.0"));
    assert_eq!(beta(&["v2.0.1", "v2.0.0"], "2.0.0-beta.3").stable_newer.as_deref(), Some("2.0.1"));
    assert_eq!(beta(&["v1.9.0", "v1.0.3", "v2.0.0-beta.4"], "2.0.0-beta.3").stable_newer, None);
    assert_eq!(beta(&["v2.0.0-beta.4"], "2.0.0-beta.3").stable_newer, None);
}

/// UPD14: a Beta running a stable version hears one message, not two.
#[test]
fn beta_on_a_stable_version() {
    let status = beta(&["v2.0.0-beta.1", "v1.0.3"], "1.0.2");
    assert!(status.newer);
    assert_eq!(status.latest.as_deref(), Some("2.0.0-beta.1"));
    assert_eq!(status.stable_newer, None);
}

/// UPD10, UPD11, UPD15: equal, pulled, build metadata, unreadable current.
#[test]
fn beta_edges() {
    assert!(!beta(&["v2.0.0-beta.4"], "2.0.0-beta.4").newer);
    assert!(!beta(&["v2.0.0-beta.3"], "2.0.0-beta.4").newer);
    assert!(beta(&["v2.0.0-beta.2"], "2.0.0-beta.1+abc").newer);
    let unreadable = beta(&["v2.0.0"], "banana");
    assert!(!unreadable.newer);
    assert_eq!(unreadable.stable_newer, None);
}

/// UPD08, UPD09: anything that is not a list of readable releases is an error.
#[test]
fn an_unreadable_list_is_an_error() {
    for body in ["[]", "{\"message\":\"API rate limit exceeded\"}", "<html></html>", "", "[{\"tag_name\":\"nightly\"}]"] {
        assert!(check(|_| Ok(body.to_string()), "2.0.0-beta.1", Line::Beta).is_err(), "{body}");
    }
}

/// UPD18: a hostile tag never reaches the url.
#[test]
fn a_hostile_tag_is_skipped() {
    assert!(parse_list(r#"[{"tag_name":"v2.0.0-beta.1/../x"}]"#).is_empty());
}

/// VER06: the host orders the shared fixture the way Studio does.
#[test]
fn semver_orders_the_shared_fixture() {
    let versions: Vec<String> = serde_json::from_str(include_str!("fixtures/versions.json")).unwrap();
    for pair in versions.windows(2) {
        let a = semver::Version::parse(&pair[0]).unwrap();
        let b = semver::Version::parse(&pair[1]).unwrap();
        assert!(a < b, "{a} < {b}");
    }
}

#[test]
fn each_line_asks_its_own_path() {
    assert_eq!(path_for(Line::Stable), "/releases/latest");
    assert_eq!(path_for(Line::Beta), "/releases?per_page=20");
}

/// The real call, through the OS trust store. Not in the suite — it needs the
/// network — but `cargo test -p questiongame-app --test update -- --ignored`
/// is how a TLS or API change is caught before a release (UPD21).
#[test]
#[ignore = "needs the network"]
fn the_live_api_answers_with_a_release() {
    let body = questiongame_app::update::fetch(path_for(Line::Stable)).expect("GitHub answers");
    assert!(parse_latest(&body).is_some(), "a readable latest release: {body:.200}");
}

#[test]
#[ignore = "needs the network"]
fn the_live_api_answers_with_a_list() {
    let body = questiongame_app::update::fetch(path_for(Line::Beta)).expect("GitHub answers");
    assert!(!parse_list(&body).is_empty(), "a readable release list: {body:.200}");
}

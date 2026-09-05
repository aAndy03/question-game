#![allow(dead_code)] // each test binary uses a different subset

//! Fixtures for the integration tests. Built through the public interface
//! only — if a test needs a back door into `Play`, the interface is wrong.

use questiongame_host::settings::{FrozenSettings, TimerCascade, TimerLevel};
use questiongame_host::{
    DomainId, MatchService, OptionId, PlaySnapshot, QuestionId, SnapshotDomain, SnapshotOption,
    SnapshotQuestion, SnapshotTeam, TeamId,
};

pub fn team_id(i: usize) -> TeamId {
    TeamId::new(format!("team-{i}"))
}

pub fn domain_id(i: usize) -> DomainId {
    DomainId::new(format!("dom-{i}"))
}

pub fn option_id(letter: char) -> OptionId {
    OptionId::new(format!("opt-{letter}"))
}

/// A four-option single-answer question. `opt-a` is correct, always — the tests
/// that care about judging build their own.
pub fn question(domain: usize, index: usize, difficulty: u8) -> SnapshotQuestion {
    SnapshotQuestion {
        id: QuestionId::new(format!("q-{domain}-{index}")),
        stem: format!("Question {index} of domain {domain}?"),
        options: ['a', 'b', 'c', 'd']
            .into_iter()
            .map(|letter| SnapshotOption {
                id: option_id(letter),
                text: format!("Option {}", letter.to_ascii_uppercase()),
            })
            .collect(),
        correct_option_ids: vec![option_id('a')],
        difficulty,
        duration_ms: None,
    }
}

/// `teams` teams, `domains` domains, `per_domain` questions each at 10/20/30…
pub fn snapshot(
    teams: usize,
    domains: usize,
    per_domain: usize,
    settings: FrozenSettings,
) -> PlaySnapshot {
    PlaySnapshot::new(
        "play-test",
        "recipe-test",
        (0..teams)
            .map(|i| SnapshotTeam::new(team_id(i), format!("TEAM {i}"), format!("T{i}")))
            .collect(),
        (0..domains)
            .map(|d| {
                SnapshotDomain::new(
                    domain_id(d),
                    format!("Domain {d}"),
                    format!("DOM_{d}"),
                    (0..per_domain)
                        .map(|q| question(d, q, ((q as u8) + 1) * 10))
                        .collect(),
                )
            })
            .collect(),
        settings,
    )
}

/// Operator pace: no countdown anywhere in the cascade (§2.4).
pub fn operator_pace() -> FrozenSettings {
    FrozenSettings {
        timer: TimerCascade {
            globals: TimerLevel::new(false, 30_000),
            recipe: TimerLevel::default(),
        },
        ..FrozenSettings::default()
    }
}

/// A loaded and started Play, at `t = 0`.
pub fn started(snapshot: PlaySnapshot) -> MatchService {
    let mut service = MatchService::new();
    service.play_load(snapshot, 0).unwrap();
    service.play_start(0).unwrap();
    service
}

/// Answer the issued question correctly and reveal it.
pub fn answer_correctly(service: &mut MatchService, at_ms: u64) {
    service.set_selection(&[option_id('a')], at_ms).unwrap();
    service.lock_selection(at_ms).unwrap();
    service.reveal_outcome(at_ms).unwrap();
}

/// Answer the issued question wrongly and reveal it — the token ends.
pub fn answer_wrongly(service: &mut MatchService, at_ms: u64) {
    service.set_selection(&[option_id('b')], at_ms).unwrap();
    service.lock_selection(at_ms).unwrap();
    service.reveal_outcome(at_ms).unwrap();
}

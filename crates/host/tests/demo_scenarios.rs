//! The Demo, played end to end — one test per scenario an operator can
//! actually run in the app (§12.1's sample game, `catalog/seed.rs`).
//!
//! These are written so a person can repeat them by hand:
//!
//! ```text
//! Demo — 2 teams  Red · Blue
//!        2 domains  Geography (GEO_101) · Science (SCI_204)
//!        3 questions each, difficulty 10 → 20 → 30, first option correct
//! ```
//!
//! Every scenario ends by asking the question that matters most: **is there a
//! legal way on?** A state the engine accepts but the operator cannot leave is
//! a stuck show — that is what happened on 2026-09-07, when a Play sat on a
//! revealed outcome with no way to issue another question — so each scenario
//! asserts the next command the operator would reach for is accepted, not just
//! that the score is right.

use questiongame_host::catalog::{CatalogLocation, CatalogService, SeedMode};
use questiongame_host::flags::{FlagService, GameSettings, GlobalSettings};
use questiongame_host::ids::{DomainId, OptionId, PlayId, QuestionId, TeamId};
use questiongame_host::{MatchService, PlayStatus, Verdict};

const RED: &str = "seed-team-red";
const BLUE: &str = "seed-team-blue";
const GEO: &str = "seed-dom-geo";
const SCI: &str = "seed-dom-sci";

/// The demo library in memory, plus a service with its recipe loaded and
/// started — the state the operator is in one click after *Load into Control*.
struct Demo {
    catalog: CatalogService,
    play: MatchService,
    now: u64,
}

impl Demo {
    /// Loaded into Control and started — one click past *Load into Control*.
    fn start() -> Demo {
        let mut demo = Demo::load();
        demo.play.play_start(3_000).expect("starts");
        demo
    }

    /// Loaded and not started: the recipe is in Control and nothing has
    /// happened yet.
    fn load() -> Demo {
        Demo::load_prepared(|_| {})
    }

    /// [`Demo::load`], after `prepare` has changed the seeded library.
    fn load_prepared(prepare: impl FnOnce(&CatalogService)) -> Demo {
        let catalog = CatalogService::open(CatalogLocation::Memory).expect("library opens");
        catalog
            .seed_demo(
                questiongame_host::catalog::Demo::En,
                SeedMode::Missing,
                GameSettings::default(),
                1_000,
            )
            .expect("the demo seeds");
        prepare(&catalog);

        // The same three steps `play_load` takes (`commands/play.rs`): put the
        // recipe's settings into Control, freeze them, build the snapshot.
        let recipe_id = questiongame_host::ids::RecipeId::new("seed-recipe-demo");
        let recipe = catalog.recipe_get(&recipe_id).expect("the demo recipe");
        let mut flags = FlagService::new(GlobalSettings::default());
        flags.load_recipe(recipe.settings.clone()).expect("legal");
        let snapshot = catalog
            .build_snapshot(
                &recipe_id,
                PlayId::new("play-demo-1"),
                flags.freeze().expect("the defaults are legal"),
            )
            .expect("the snapshot builds");

        let mut play = MatchService::new();
        play.play_load(snapshot, 2_000).expect("loads");
        Demo {
            catalog,
            play,
            now: 3_000,
        }
    }

    fn tick(&mut self, ms: u64) -> u64 {
        self.now += ms;
        self.now
    }

    /// The whole turn an operator performs: pick a domain, reveal the stem and
    /// the options, lock an answer, reveal the outcome.
    ///
    /// `option` is the letter as it appears on Stage: `'a'` is the correct one
    /// in every seeded question.
    fn answer(&mut self, domain: &str, option: char) -> Verdict {
        let domain = DomainId::new(domain);
        let now = self.tick(1_000);
        self.play
            .choose_domain(&domain, now)
            .unwrap_or_else(|e| panic!("choose {domain}: {e}"));

        let question = self.question_id();
        let now = self.tick(1_000);
        self.play.reveal_stem(now).expect("stem");
        for _ in 0..4 {
            let now = self.tick(100);
            self.play.reveal_next_option(now).expect("option");
        }

        let now = self.tick(1_000);
        self.play
            .set_selection(&[OptionId::new(format!("{question}-{option}"))], now)
            .expect("select");
        let now = self.tick(500);
        self.play.lock_selection(now).expect("lock");
        let now = self.tick(500);
        self.play.reveal_outcome(now).expect("reveal");
        self.outcome()
    }

    fn question_id(&self) -> QuestionId {
        self.play
            .get_state()
            .and_then(|p| p.session())
            .expect("a question is issued")
            .question
            .id
            .clone()
    }

    fn outcome(&self) -> Verdict {
        self.play
            .get_state()
            .and_then(|p| p.session())
            .and_then(|s| s.outcome.as_ref())
            .expect("the turn is resolved")
            .verdict
    }

    fn holder(&self) -> Option<TeamId> {
        self.play
            .get_state()
            .and_then(|p| p.ring().current().cloned())
    }

    fn score(&self, team: &str) -> u32 {
        self.play
            .get_state()
            .expect("a play")
            .score(&TeamId::new(team))
    }

    fn status(&self) -> PlayStatus {
        self.play.get_state().expect("a play").status()
    }

    /// **The predicate Control draws with** — `canChooseDomain` in
    /// `apps/studio/src/host/session.ts`, spelled in Rust.
    ///
    /// Pure: asking must never move the Play. That it agrees with the command
    /// is not assumed — `the_predicate_matches_the_command_at_every_step`
    /// checks the two against each other, which is the bug this file was
    /// written for: Control read `session != null` as "a question is in
    /// progress", the host reads "issued **and unresolved**", and the gap
    /// between them is an operator with nothing left to press.
    fn can_choose(&self, domain: &str) -> bool {
        let Some(play) = self.play.get_state() else {
            return false;
        };
        play.status() == PlayStatus::Playing
            && play.ring().current().is_some()
            && play.session().is_none_or(|s| s.is_resolved())
            && play.next_question(&DomainId::new(domain)).is_some()
    }

    /// The first `steps` beats of a turn on Geography, for a test that needs
    /// the same position twice without a probe polluting it.
    fn replay(&mut self, steps: usize) {
        let beats: [&dyn Fn(&mut Demo); 4] = [
            &|d: &mut Demo| {
                let now = d.tick(1_000);
                d.play.choose_domain(&DomainId::new(GEO), now).unwrap();
            },
            &|d: &mut Demo| {
                let question = d.question_id();
                let now = d.tick(100);
                d.play
                    .set_selection(&[OptionId::new(format!("{question}-a"))], now)
                    .unwrap();
            },
            &|d: &mut Demo| {
                let now = d.tick(100);
                d.play.lock_selection(now).unwrap();
            },
            &|d: &mut Demo| {
                let now = d.tick(100);
                d.play.reveal_outcome(now).unwrap();
            },
        ];
        for beat in beats.iter().take(steps) {
            beat(self);
        }
    }
}

/// **Scenario 1 — Red answers correctly and plays on.**
///
/// Load Demo, Start Play, Geography, reveal, answer *Pacific*, reveal outcome.
/// Red keeps the token, and the next Geography question must be one command
/// away. This is the exact session reported as stuck.
#[test]
fn s1_a_correct_answer_keeps_the_token_and_the_next_question_is_available() {
    let mut demo = Demo::start();
    assert_eq!(demo.holder(), Some(TeamId::new(RED)));

    assert_eq!(demo.answer(GEO, 'a'), Verdict::Correct);
    assert_eq!(demo.score(RED), 100);
    assert_eq!(demo.holder(), Some(TeamId::new(RED)), "the token stays");

    // The session is still in the projection — resolved, not gone. Anything
    // that reads "session exists" as "a question is in progress" locks the
    // operator out here.
    assert!(
        demo.play
            .get_state()
            .and_then(|p| p.session())
            .expect("the resolved session is still projected")
            .is_resolved()
    );

    // Same domain, next difficulty.
    let now = demo.tick(1_000);
    demo.play
        .choose_domain(&DomainId::new(GEO), now)
        .expect("the next Geography question is issuable");
    assert_eq!(demo.question_id(), QuestionId::new("seed-q-geo-2"));
}

/// **Scenario 2 — Red answers wrongly and the token moves.**
///
/// The same start, but lock *Atlantic*. Red scores nothing, the token ends,
/// and Blue is the only legal target; the round invariant is what says so.
#[test]
fn s2_a_wrong_answer_ends_the_token_and_blue_is_the_legal_target() {
    let mut demo = Demo::start();
    assert_eq!(demo.answer(GEO, 'b'), Verdict::Incorrect);
    assert_eq!(demo.score(RED), 0);
    assert_eq!(demo.holder(), None, "the token ended with the wrong answer");

    let play = demo.play.get_state().expect("a play");
    assert_eq!(play.ring().legal_targets(), vec![TeamId::new(BLUE)]);

    // Choosing a domain with nobody holding the token is refused — the
    // operator has to hand it over first (§5.3).
    assert!(!demo.can_choose(GEO));

    let now = demo.tick(1_000);
    demo.play
        .give_token(&TeamId::new(BLUE), now)
        .expect("Blue takes the token");
    assert!(demo.can_choose(GEO), "and now a question can be issued");
}

/// **Scenario 3 — the operator cannot skip the reveal.**
///
/// With a question issued and locked, `choose_domain` and `give_token` are both
/// refused until the outcome is revealed (§2.6 path 2). Control must therefore
/// *offer* the reveal, and say why the rest is disabled.
#[test]
fn s3_a_live_question_blocks_the_next_one_until_it_is_revealed() {
    let mut demo = Demo::start();
    let now = demo.tick(1_000);
    demo.play.choose_domain(&DomainId::new(GEO), now).unwrap();

    assert!(!demo.can_choose(SCI), "a second question cannot be issued");
    let now = demo.tick(100);
    assert!(
        demo.play.give_token(&TeamId::new(BLUE), now).is_err(),
        "and the token cannot be handed over"
    );

    let question = demo.question_id();
    let now = demo.tick(100);
    demo.play
        .set_selection(&[OptionId::new(format!("{question}-a"))], now)
        .unwrap();
    let now = demo.tick(100);
    demo.play.lock_selection(now).unwrap();
    assert!(!demo.can_choose(GEO), "locking is not resolving");

    let now = demo.tick(100);
    demo.play.reveal_outcome(now).unwrap();
    assert!(demo.can_choose(GEO), "revealing is what frees the operator");
}

/// **Scenario 4 — Geography runs out.**
///
/// Red answers all three Geography questions correctly. The domain is then
/// exhausted, and the only way on is the other domain.
#[test]
fn s4_an_exhausted_domain_leaves_the_other_one_open() {
    let mut demo = Demo::start();
    for _ in 0..3 {
        assert_eq!(demo.answer(GEO, 'a'), Verdict::Correct);
    }
    // Difficulty-mapped scoring is the default: 100 + 200 + 300.
    assert_eq!(demo.score(RED), 600);

    let play = demo.play.get_state().expect("a play");
    assert!(play.next_question(&DomainId::new(GEO)).is_none());
    assert!(play.next_question(&DomainId::new(SCI)).is_some());

    assert!(!demo.can_choose(GEO), "an exhausted domain is refused");
    assert!(demo.can_choose(SCI));
}

/// **Scenario 5 — the board empties and the Play completes.**
///
/// Every question answered, alternating teams as the round invariant demands.
/// The Play completes on the last reveal, and the leaderboard is what is left
/// to show — no further question can be issued, and that is not a stuck state
/// but an ended one.
#[test]
fn s5_the_play_completes_when_the_board_is_empty() {
    let mut demo = Demo::start();
    // Wrong on purpose every third turn, so the token moves and both teams
    // play — the shape of a real show.
    play_the_board(&mut demo);

    assert_eq!(demo.status(), PlayStatus::Completed);
    assert!(!demo.can_choose(GEO));
    assert!(!demo.can_choose(SCI));
    // The scores are the two teams' own; what matters here is that the Play
    // ended by itself rather than needing the operator to abandon it.
    assert!(demo.score(RED) + demo.score(BLUE) > 0);
}

/// **Scenario 6 — undo puts the question back.**
///
/// Red answers wrongly, the operator undoes the turn: the question returns to
/// the pool, the token comes back, and the score is as it was.
#[test]
fn s6_undo_returns_the_question_and_the_token() {
    let mut demo = Demo::start();
    assert_eq!(demo.answer(GEO, 'b'), Verdict::Incorrect);
    assert_eq!(demo.holder(), None);

    let now = demo.tick(1_000);
    demo.play.undo_turn(now).expect("undo");
    assert_eq!(demo.holder(), Some(TeamId::new(RED)), "Red has it back");
    assert_eq!(demo.score(RED), 0);

    let play = demo.play.get_state().expect("a play");
    assert!(play.session().is_none(), "the question was never issued");
    assert_eq!(
        play.next_question(&DomainId::new(GEO)).map(|q| q.id.clone()),
        Some(QuestionId::new("seed-q-geo-1")),
        "and it is first in the pool again"
    );
    assert!(demo.can_choose(GEO));
}

/// **Scenario 7 — the timer runs out with nothing selected.**
///
/// T=0 with an empty selection leaves the question open (§2.4): nothing is
/// locked, nothing is scored, and the operator still has to reveal. The
/// question must not resolve itself.
#[test]
fn s7_an_expired_timer_with_no_selection_leaves_the_question_open() {
    let mut demo = Demo::start();
    let now = demo.tick(1_000);
    demo.play.choose_domain(&DomainId::new(GEO), now).unwrap();
    let now = demo.tick(100);
    demo.play.start_timer(now).unwrap();

    let now = demo.tick(31_000);
    demo.play.tick(now).expect("the T=0 table applies");

    let session = demo
        .play
        .get_state()
        .and_then(|p| p.session())
        .expect("still issued");
    assert!(session.locked.is_none(), "nothing was locked");
    assert!(!session.is_resolved(), "and nothing was scored");
    assert!(!demo.can_choose(SCI), "the turn is still the operator's");

    let now = demo.tick(1_000);
    demo.play.reveal_outcome(now).expect("an empty reveal");
    assert_eq!(demo.outcome(), Verdict::Incorrect);
    assert_eq!(demo.score(RED), 0);
    assert!(demo.holder().is_none(), "a wrong answer ends the token");
}

/// **Scenario 8 — the operator jumps screens; the Play does not care.**
///
/// Screens are presentation. Whatever the operator is showing, the same
/// commands are legal — this is what makes "go to any screen from any screen"
/// safe, and it is asserted here rather than assumed.
#[test]
fn s8_the_screen_never_changes_what_is_legal() {
    let mut demo = Demo::start();
    assert_eq!(demo.answer(GEO, 'a'), Verdict::Correct);
    // Nothing stands between the reveal and the next question but the
    // operator's choice of screen — and `MatchService` has no screen at all,
    // so both domains stay open whatever Stage is showing.
    assert!(demo.can_choose(GEO));
    assert!(demo.can_choose(SCI));
}

/// The predicate Control draws with and the command the host runs must agree
/// at every point of a turn. They did not: Control offered a domain card only
/// while `session` was `null`, which is true exactly once — before the first
/// question of the Play.
#[test]
fn the_predicate_matches_the_command_at_every_step() {
    for steps in 0..=4 {
        let mut demo = Demo::start();
        demo.replay(steps);
        let predicted = demo.can_choose(GEO);
        let now = demo.tick(1);
        let accepted = demo.play.choose_domain(&DomainId::new(GEO), now).is_ok();
        assert_eq!(
            predicted, accepted,
            "after {steps} beat(s) of a turn: Control says {predicted}, the host says {accepted}"
        );
    }
}

/// **Scenario 9 — the board is empty and the Play has completed.**
///
/// What is legal then is a short list, and Control has to draw exactly it: the
/// standings, an undo, a restart. Not a question, not a hand-over. The panel
/// went on showing the question's controls here, disabled, with no way to
/// reveal a place (reported 2026-09-07, a 68-event Play of the Demo).
#[test]
fn s9_a_completed_play_offers_the_standings_an_undo_and_a_restart() {
    let mut demo = Demo::start();
    play_the_board(&mut demo);
    assert_eq!(demo.status(), PlayStatus::Completed);

    // Nothing about the game moves any more.
    assert!(!demo.can_choose(GEO));
    assert!(!demo.can_choose(SCI));
    let now = demo.tick(100);
    assert!(demo.play.give_token(&TeamId::new(BLUE), now).is_err());
    let now = demo.tick(100);
    assert!(demo.play.abandon(now).is_err(), "it already ended");

    // What is left: the places, lowest first.
    let ranks = demo.play.get_state().expect("a play").ranks();
    let lowest = *ranks.iter().max().expect("some rank");
    let now = demo.tick(100);
    demo.play
        .reveal_leaderboard_rank(lowest, now)
        .expect("the last place goes up first (§5.5)");

    // And an undo still reaches the turn that ended it.
    assert!(demo.play.can_undo());
}

/// **Scenario 10 — a tie has no second place.**
///
/// Both teams on 100: competition rank is `1, 1`, so place 2 belongs to
/// nobody. Studio keys its leaderboard nodes by *finishing position*, and
/// sending a position where a rank is meant would silently reveal nothing —
/// the host refuses it instead. (The reported Play finished 500–500.)
#[test]
fn s10_a_tie_shares_a_rank_and_the_place_between_does_not_exist() {
    let mut demo = Demo::start();
    assert_eq!(demo.answer(GEO, 'a'), Verdict::Correct); // Red 100
    let now = demo.tick(100);
    demo.play.pause(now).unwrap();
    let now = demo.tick(100);
    demo.play.resume(now).unwrap();

    // Red answers wrongly next, so Blue takes the token and matches the score.
    assert_eq!(demo.answer(GEO, 'b'), Verdict::Incorrect);
    let now = demo.tick(100);
    demo.play.give_token(&TeamId::new(BLUE), now).unwrap();
    assert_eq!(demo.answer(SCI, 'a'), Verdict::Correct); // Blue 100

    assert_eq!(demo.score(RED), demo.score(BLUE));
    assert_eq!(demo.play.get_state().expect("a play").ranks(), vec![1, 1]);

    let now = demo.tick(100);
    demo.play
        .reveal_leaderboard_rank(1, now)
        .expect("the shared first place");
    let now = demo.tick(100);
    assert!(
        demo.play.reveal_leaderboard_rank(2, now).is_err(),
        "nobody is in place 2"
    );
}

/// **Scenario 11 — a completed Play can be played again, an abandoned one is
/// a closed record.**
#[test]
fn s11_restart_reaches_a_completed_play_but_not_an_abandoned_one() {
    let mut demo = Demo::start();
    play_the_board(&mut demo);
    let now = demo.tick(100);
    demo.play
        .restart(
            questiongame_host::service::RestartMode::SameQuestions {
                new_play_id: PlayId::new("play-demo-2"),
            },
            now,
        )
        .expect("a completed Play restarts");
    assert_eq!(demo.status(), PlayStatus::Playing);

    let now = demo.tick(100);
    demo.play.abandon(now).unwrap();
    let now = demo.tick(100);
    assert!(
        demo.play
            .restart(
                questiongame_host::service::RestartMode::SameQuestions {
                    new_play_id: PlayId::new("play-demo-3"),
                },
                now,
            )
            .is_err(),
        "an abandoned Play is a closed record; load the recipe again"
    );
}

/// **Scenario 12 — the operator puts the game down.**
///
/// `play_unload` is the way back out of Control and is legal at every point:
/// loaded and never started, mid-question, and after the board is empty. An
/// **open** Play is abandoned on the way out — a Play that simply vanished
/// while still `playing` would be resumed at the next boot, which is the
/// opposite of unloading it.
#[test]
fn s12_a_game_can_be_put_down_at_any_point() {
    // Loaded and never started: it closes as abandoned, which is what an
    // unplayed Play is. Nothing resumes a `loaded` row and no cleanup reaches
    // one, so it must not be left that way — and Studio discards this record
    // outright rather than ask about a game nobody played.
    let mut demo = Demo::load();
    let now = demo.tick(100);
    let closed = demo.play.unload(now).expect("unloads");
    assert_eq!(closed.expect("the loaded play").status(), PlayStatus::Abandoned);
    assert!(demo.play.get_state().is_none(), "Control is empty");
    // Idempotent: unloading nothing is not an error.
    let now = demo.tick(100);
    assert!(demo.play.unload(now).expect("no-op").is_none());

    // Mid-question: abandoned on the way out.
    let mut demo = Demo::start();
    let now = demo.tick(1_000);
    demo.play.choose_domain(&DomainId::new(GEO), now).unwrap();
    let now = demo.tick(100);
    let closed = demo.play.unload(now).expect("unloads").expect("the play");
    assert_eq!(closed.status(), PlayStatus::Abandoned);

    // After the board empties: the record is already closed and stays as it is.
    let mut demo = Demo::start();
    play_the_board(&mut demo);
    let now = demo.tick(100);
    let closed = demo.play.unload(now).expect("unloads").expect("the play");
    assert_eq!(closed.status(), PlayStatus::Completed);
    assert!(demo.play.get_state().is_none());
}

/// **Scenario 13 — a discarded Play leaves no trace.**
///
/// The other half of unload: an operator who loaded the wrong game, or
/// rehearsed one, can delete that Play rather than leave it in the Plays list
/// and in Statistics. A hard delete, and the only one in v1 besides *Wipe
/// Plays* — so it is the answer that has to be chosen.
#[test]
fn s13_a_discarded_play_leaves_the_library_as_it_was() {
    let mut demo = Demo::start();
    assert_eq!(demo.answer(GEO, 'a'), Verdict::Correct);
    let now = demo.tick(100);
    let closed = demo.play.unload(now).expect("unloads").expect("the play");
    demo.catalog.play_persist(&closed).expect("persisted");
    assert_eq!(demo.catalog.play_list(None).expect("listed").len(), 1);

    demo.catalog.play_delete(closed.id()).expect("discarded");
    assert!(demo.catalog.play_list(None).expect("listed").is_empty());
    assert!(
        demo.catalog.play_events(closed.id()).expect("read").is_empty(),
        "the log goes with it"
    );
    // The library itself is untouched — a Play is a record of a run, not a row.
    assert_eq!(
        demo.catalog
            .catalog_list(
                questiongame_host::CatalogKind::Question,
                questiongame_host::catalog::ArchiveScope::Active
            )
            .expect("listed")
            .len(),
        6
    );
}

/// Play every question of the Demo, handing the token over whenever it ends.
fn play_the_board(demo: &mut Demo) {
    let mut answered = 0;
    while demo.status() == PlayStatus::Playing {
        if demo.holder().is_none() {
            let target = demo
                .play
                .get_state()
                .expect("a play")
                .ring()
                .legal_targets()
                .first()
                .cloned()
                .expect("some team may take the token");
            let now = demo.tick(500);
            demo.play.give_token(&target, now).expect("hand over");
        }
        let domain = if demo
            .play
            .get_state()
            .expect("a play")
            .next_question(&DomainId::new(GEO))
            .is_some()
        {
            GEO
        } else {
            SCI
        };
        let letter = if answered % 3 == 2 { 'b' } else { 'a' };
        demo.answer(domain, letter);
        answered += 1;
    }
    assert_eq!(answered, 6, "the Demo has six questions");
}

/// The seeded library is the one the scenarios above describe. If this fails,
/// every scenario's letters are wrong too.
#[test]
fn the_demo_library_is_what_the_scenarios_say_it_is() {
    let demo = Demo::start();
    let play = demo.play.get_state().expect("a play");
    let snapshot = play.snapshot();

    assert_eq!(snapshot.teams.len(), 2);
    assert_eq!(snapshot.domains.len(), 2);
    assert_eq!(snapshot.total_questions(), 6);

    let geo = snapshot
        .domain(&DomainId::new(GEO))
        .expect("Geography is on the board");
    assert_eq!(geo.name, "Geography");
    let difficulties: Vec<u8> = geo.questions.iter().map(|q| q.difficulty).collect();
    assert_eq!(difficulties, vec![10, 20, 30], "easy → hard (§5.2)");

    let first = &geo.questions[0];
    assert_eq!(first.stem, "Which is the largest ocean on Earth?");
    assert_eq!(
        first.correct_option_ids,
        vec![OptionId::new("seed-q-geo-1-a")],
        "option A — Pacific — is the correct one as shipped"
    );
    drop(demo.catalog);
}

/// **Scenario 16 — the Statistics ledger explains what the scoreboard was paid
/// (P11.12).**
///
/// The ledger recomputes each award from the Play's frozen settings and the
/// options the team actually locked. It must land on the number the log
/// recorded, for every turn of a real Play — that is what makes "why" an
/// explanation rather than a second opinion. A whole Demo is played through
/// wrong answers, token handovers and an undo, and every row is checked.
#[test]
fn s16_every_ledger_row_reproduces_what_the_log_recorded() {
    use questiongame_host::stats;

    let mut demo = Demo::start();
    demo.answer(GEO, 'a'); // Red, correct
    demo.answer(GEO, 'b'); // Red, wrong — the token ends
    let now = demo.tick(100);
    demo.play.give_token(&TeamId::new(BLUE), now).unwrap();
    demo.answer(SCI, 'a'); // Blue, correct
    demo.answer(SCI, 'a'); // Blue, correct again — a streak

    let events = demo.play.get_state().expect("a play").events().to_vec();
    let ledger = stats::awards(&events);
    assert_eq!(ledger.len(), 4, "four resolved turns");

    for turn in &ledger {
        assert_eq!(
            turn.award.total,
            turn.fact.points + turn.fact.bonus,
            "the ledger disagrees with the log for {} ({:?})",
            turn.fact.question_id,
            turn.award,
        );
        // And the breakdown's own steps add up to the total it claims.
        assert_eq!(
            turn.award.total,
            turn.award.points + turn.award.bonus.map_or(0, |b| b.award),
        );
    }

    // The streak is per token and counted the way `play.rs` counts it: Red's
    // wrong answer resets it, and Blue's two corrects run 1 then 2.
    assert_eq!(
        ledger.iter().map(|t| t.fact.streak).collect::<Vec<_>>(),
        vec![1, 0, 1, 2],
    );
    assert!(ledger[1].fact.token_ends, "a wrong answer ends the token");

    // An undone turn is not in the ledger either — the same span the
    // projection drops (§2.7).
    let now = demo.tick(100);
    demo.play.undo_turn(now).expect("undo");
    let after = stats::awards(demo.play.get_state().expect("a play").events());
    assert_eq!(after.len(), 3);
}

/// **Scenario 17 — a game that allows a repeated difficulty plays both
/// (P12.7).**
///
/// Geography gains a second difficulty-10 question and the Demo switches
/// `board.allow_repeated_difficulty` on. Red answers Geography twice: the two
/// tens come one after the other, lower id first, and each pays what a ten
/// pays — the award never reads which question it was.
#[test]
fn s17_two_questions_at_one_difficulty_are_asked_in_id_order_and_pay_the_same() {
    use questiongame_host::catalog::{
        BoardDomain, CatalogItem, CatalogKind, DomainMember, Question, QuestionOption,
    };
    use questiongame_host::ids::RecipeId;

    let mut demo = Demo::load_prepared(|catalog| {
        let twin = Question::new("seed-q-geo-4", "Which ocean borders Portugal?", 10)
            .with_options(
                ['a', 'b', 'c', 'd']
                    .into_iter()
                    .map(|l| QuestionOption::new(format!("seed-q-geo-4-{l}"), l.to_string(), l == 'a'))
                    .collect(),
            );
        catalog.catalog_upsert(&twin.into(), 1_100).unwrap();
        let CatalogItem::Domain(mut geo) = catalog.catalog_get(CatalogKind::Domain, GEO).unwrap()
        else {
            panic!("Geography is a domain");
        };
        let next = geo.questions.len() as i64;
        geo.questions.push(DomainMember {
            question_id: QuestionId::new("seed-q-geo-4"),
            sort_key: next,
        });
        catalog.catalog_upsert(&(*geo).into(), 1_200).unwrap();

        let id = RecipeId::new("seed-recipe-demo");
        let recipe = catalog.recipe_get(&id).unwrap();
        let mut settings = recipe.settings.clone();
        settings.board.allow_repeated_difficulty = true;
        catalog.recipe_set_settings(&id, settings, 1_300).unwrap();
        let board: Vec<BoardDomain> = recipe
            .board
            .iter()
            .cloned()
            .map(|mut b| {
                if b.domain_id.as_str() == GEO {
                    b.question_ids.push(QuestionId::new("seed-q-geo-4"));
                }
                b
            })
            .collect();
        catalog
            .recipe_set_membership(&id, recipe.teams.clone(), board, 1_400)
            .unwrap();
    });
    demo.play.play_start(3_000).expect("starts");

    assert_eq!(demo.answer(GEO, 'a'), Verdict::Correct);
    assert_eq!(demo.question_id(), QuestionId::new("seed-q-geo-1"));
    let first = demo.score(RED);

    assert_eq!(demo.answer(GEO, 'a'), Verdict::Correct);
    assert_eq!(demo.question_id(), QuestionId::new("seed-q-geo-4"));
    assert_eq!(demo.score(RED), first * 2, "two tens pay the same");

    let now = demo.tick(1_000);
    demo.play.choose_domain(&DomainId::new(GEO), now).unwrap();
    assert_eq!(demo.question_id(), QuestionId::new("seed-q-geo-2"), "then the walk goes on");
}

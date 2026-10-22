//! Writes a library for the end-to-end suite (P12.14): what an operator on
//! 1.0.1 would have on disk. Never shipped — an example, not a binary.
//!
//! ```text
//! cargo run -q -p questiongame-host --example e2e_library -- <path> [--broken-board]
//! ```
//!
//! - The English Demo, seeded, with one operator active, so the app skips
//!   first run and opens on the shell.
//! - **Unstamped**, as 1.0.1 left every library: opened with
//!   `CatalogService::open`, which writes no `app.last_opened_version`. The
//!   first boot of a newer build therefore backs it up and shows *What's new*.
//! - `--broken-board` re-grades the Demo's second Geography question to the
//!   first one's difficulty *in the library*, which the catalog allows and a
//!   board on which both sit cannot Load (§2.31).
//! - `--more-questions <n>` adds `n` plain questions in no domain, for the
//!   specs that need a list longer than a page (stable 1.1).
//! - **Schema 3**, as every 1.x build left it (Beta 2.0): built at the head
//!   schema beside `<path>`, then written to `<path>` with the columns 1.x had
//!   (`db::write_older_schema`). The first boot migrates it into one unnamed
//!   workspace and asks for its name, as an upgrading operator sees it.
//! - `--beta1-shared` writes what a **beta.1** library looked like instead
//!   (schema 5): two named workspaces, *Quiz club* (the Demo) and *Second*,
//!   with the Demo's Red team and its Geography domain and questions in the
//!   shared library, as *Make shared* left them. The first boot of beta.2
//!   turns them into linked copies in both workspaces (migration 6).
//! - `--copy-from <file>` writes nothing of its own: it snapshots another
//!   library into `<path>` (`VACUUM INTO`, the source opened read-only), so
//!   `look.e2e.ts` can photograph Studio over a real, large library — the
//!   maintainer's Beta test library (P20). Only ever read from.
//! - `--simulate-plays <n>`, after `--copy-from`: plays up to `n` of the
//!   copy's games through `MatchService`, one a day, a turn every 40 s, a
//!   seeded mix of right and wrong answers, and persists each Play — so
//!   Statistics has something to draw (P20). It writes to the copy only.

use questiongame_host::MatchService;
use questiongame_host::OperatorId;
use questiongame_host::catalog::ArchiveScope;
use questiongame_host::catalog::{
    CatalogItem, CatalogKind, CatalogLocation, CatalogService, Demo, Operator, Question,
    QuestionOption, SeedMode,
};
use questiongame_host::flags::{FlagService, GameSettings, GlobalSettings};
use questiongame_host::ids::{OptionId, PlayId};
use questiongame_host::play::PlayStatus;

const NOW: u64 = 1_790_000_000_000;

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args
        .next()
        .expect("usage: e2e_library <path> [--broken-board]");
    let rest: Vec<String> = args.collect();
    let broken = rest.iter().any(|a| a == "--broken-board");
    let beta1_shared = rest.iter().any(|a| a == "--beta1-shared");
    let more: usize = rest
        .iter()
        .position(|a| a == "--more-questions")
        .and_then(|i| rest.get(i + 1))
        .map(|n| n.parse().expect("--more-questions takes a number"))
        .unwrap_or(0);

    let head = format!("{path}.head");
    for file in [&path, &head] {
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{file}{suffix}"));
        }
    }
    if let Some(source) = rest
        .iter()
        .position(|a| a == "--copy-from")
        .and_then(|i| rest.get(i + 1))
    {
        let conn = rusqlite::Connection::open_with_flags(
            source,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .expect("the library to copy, read-only");
        conn.execute("VACUUM INTO ?1", [&path])
            .expect("a snapshot of the library");
        drop(conn);
        let plays: usize = rest
            .iter()
            .position(|a| a == "--simulate-plays")
            .and_then(|i| rest.get(i + 1))
            .map(|n| n.parse().expect("--simulate-plays takes a number"))
            .unwrap_or(0);
        if plays > 0 {
            simulate_plays(&path, plays);
        }
        println!("{path}");
        return;
    }
    let catalog = CatalogService::open(CatalogLocation::file(&head)).expect("a library");
    catalog
        .seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW)
        .expect("the Demo seeds");

    let operator = Operator::new("e2e-operator", "E2E Operator");
    catalog
        .catalog_upsert(&CatalogItem::Operator(Box::new(operator)), NOW)
        .expect("an operator");
    let globals = GlobalSettings {
        active_operator_id: Some(OperatorId::from("e2e-operator")),
        ..GlobalSettings::default()
    };
    catalog.settings_store(&globals).expect("the globals");

    if broken {
        let CatalogItem::Question(mut second) = catalog
            .catalog_get(CatalogKind::Question, "seed-q-geo-2")
            .expect("the second Geography question")
        else {
            panic!("seed-q-geo-2 is a question");
        };
        let CatalogItem::Question(first) = catalog
            .catalog_get(CatalogKind::Question, "seed-q-geo-1")
            .expect("the first Geography question")
        else {
            panic!("seed-q-geo-1 is a question");
        };
        second.difficulty = first.difficulty;
        catalog
            .catalog_upsert(&CatalogItem::Question(second), NOW + 1)
            .expect("a library edit the catalog allows");
    }
    for i in 0..more {
        let mut question = Question::new(
            format!("e2e-extra-{i:03}"),
            format!("Extra question {i:03}"),
            (i % 100) as u8 + 1,
        );
        question.options = vec![
            QuestionOption::new(format!("e2e-extra-{i:03}-a"), "Yes", true),
            QuestionOption::new(format!("e2e-extra-{i:03}-b"), "No", false),
        ];
        catalog
            .catalog_upsert(
                &CatalogItem::Question(Box::new(question)),
                NOW + 2 + i as u64,
            )
            .expect("an extra question");
    }
    if beta1_shared {
        let first = catalog.current_workspace();
        catalog
            .workspace_rename(&first, "Quiz club", NOW)
            .expect("the first workspace's name");
        catalog
            .workspace_create("Second", None, NOW)
            .expect("a second workspace");
        for (key, value) in [
            (questiongame_host::catalog::META_LAST_OPENED, "2.0.0-beta.1"),
            (questiongame_host::catalog::META_LAST_SEEN, "2.0.0-beta.1"),
        ] {
            catalog.meta_set(key, value).expect("as beta.1 left it");
        }
    }
    drop(catalog);
    if beta1_shared {
        let (from, to) = (std::path::Path::new(&head), std::path::Path::new(&path));
        questiongame_host::catalog::db::write_older_schema(from, to, 5)
            .expect("the library as beta.1 left it");
        let geography: Vec<String> = {
            let conn = rusqlite::Connection::open(to).expect("the beta.1 file");
            let mut stmt = conn
                .prepare(
                    "SELECT question_id FROM domain_questions WHERE domain_id = 'seed-dom-geo'",
                )
                .expect("a query");
            stmt.query_map([], |row| row.get(0))
                .expect("members")
                .map(|r| r.expect("a member"))
                .collect()
        };
        let place = questiongame_host::catalog::db::place_for_test;
        place(to, "teams", "seed-team-red", None).expect("Red, shared");
        place(to, "domains", "seed-dom-geo", None).expect("Geography, shared");
        for question in &geography {
            place(to, "questions", question, None).expect("its questions, shared");
        }
    } else {
        questiongame_host::catalog::db::write_older_schema(
            std::path::Path::new(&head),
            std::path::Path::new(&path),
            3,
        )
        .expect("the library as 1.x left it");
    }
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{head}{suffix}"));
    }
    println!("{path}");
}

/// A day, and when the first simulated Play starts: 2026-09-01T18:00Z.
const DAY: u64 = 86_400_000;
const FIRST_PLAY: u64 = 1_788_285_600_000;

/// Runs `count` Plays over the copy's active games, in id order, one a day.
///
/// The same three steps `play_load` takes (`commands/play.rs`): the game's
/// settings into a `FlagService`, frozen, then the snapshot. Each turn is the
/// operator's: give the token if nobody holds it, choose the next domain with
/// a question left, reveal, start the clock, select, lock, reveal the outcome.
/// Answers come from a small seeded generator, right more often on an easy
/// question, so the numbers look like a show and are the same every run. A
/// Play stops at 150 turns and is put down there. Games whose board does not
/// build (one Load would refuse) are left out; the rest are played in turn
/// until there are `count` Plays.
fn simulate_plays(path: &str, count: usize) {
    let catalog = CatalogService::open(CatalogLocation::file(path)).expect("the copy");
    let globals = catalog
        .settings_load()
        .expect("the globals")
        .unwrap_or_default();
    let mut games = catalog
        .recipe_list(ArchiveScope::Active)
        .expect("the games");
    games.sort_by(|a, b| a.id.as_str().cmp(b.id.as_str()));
    games.retain(|g| {
        catalog
            .build_snapshot(&g.id, PlayId::new("sim-probe"), probe_settings(&globals, g))
            .is_ok()
    });
    if games.is_empty() {
        eprintln!("no game here builds a board; nothing played");
        return;
    }
    // Round the games until `count` Plays: a library of two still gets a week of shows.
    for played in 0..count {
        let recipe = games[played % games.len()].clone();
        let id = PlayId::new(format!("sim-play-{played:02}"));
        let snapshot = catalog
            .build_snapshot(&recipe.id, id, probe_settings(&globals, &recipe))
            .expect("a board that built a moment ago");
        let mut now = FIRST_PLAY + played as u64 * DAY;
        let mut seed = 0x9e37_79b9_u64 ^ (played as u64 + 1);
        let mut random = move || {
            seed = seed
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            (seed >> 33) as u32
        };
        let mut play = MatchService::new();
        play.play_load(snapshot, now).expect("loads");
        if let Some(operator) = globals.active_operator_id.clone() {
            let _ = play.operator_switched(operator, now);
        }
        play.play_start(now).expect("starts");
        let domains: Vec<_> = play
            .get_state()
            .expect("a play")
            .snapshot()
            .domains
            .iter()
            .map(|d| d.id.clone())
            .collect();
        let mut turn = 0usize;
        while turn < 150 && play.get_state().map(|p| p.status()) == Some(PlayStatus::Playing) {
            now += 40_000;
            let state = play.get_state().expect("a play");
            if state.ring().current().is_none() {
                let Some(next) = state.ring().legal_targets().first().cloned() else {
                    break;
                };
                play.give_token(&next, now).expect("a legal target");
            }
            let state = play.get_state().expect("a play");
            let Some(domain) = (0..domains.len())
                .map(|i| &domains[(turn + i) % domains.len()])
                .find(|d| state.next_question(d).is_some())
                .cloned()
            else {
                break;
            };
            play.choose_domain(&domain, now)
                .expect("a domain with a question left");
            let question = play
                .get_state()
                .and_then(|p| p.session())
                .expect("issued")
                .question
                .clone();
            let _ = play.reveal_stem(now + 1_000);
            for i in 0..question.options.len() {
                let _ = play.reveal_next_option(now + 1_500 + i as u64 * 200);
            }
            let _ = play.start_timer(now + 3_000);
            // Right three times in four on an easy question, one in three on the hardest.
            let right = random() % 100 < 75 - u32::from(question.difficulty) * 42 / 100;
            let wrong = question
                .options
                .iter()
                .find(|o| !question.correct_option_ids.contains(&o.id))
                .map(|o| o.id.clone());
            let pick: Vec<OptionId> = match (right, wrong) {
                (false, Some(w)) => vec![w],
                _ => question.correct_option_ids.clone(),
            };
            let think = 3_000 + u64::from(random() % 14_000);
            play.set_selection(&pick, now + think).expect("select");
            play.lock_selection(now + think + 300).expect("lock");
            play.reveal_outcome(now + think + 1_500).expect("reveal");
            turn += 1;
        }
        if play.get_state().map(|p| p.status()) == Some(PlayStatus::Playing) {
            play.abandon(now + 60_000).expect("put down");
        }
        catalog
            .play_persist(play.get_state().expect("a play"))
            .expect("the Play persists");
        eprintln!("played {} — {turn} turns", recipe.name);
    }
}

/// The game's settings frozen as `play_load` freezes them, or the globals'
/// when the game's own do not load (the board check does not read them).
fn probe_settings(
    globals: &GlobalSettings,
    recipe: &questiongame_host::catalog::Recipe,
) -> questiongame_host::settings::FrozenSettings {
    let mut flags = FlagService::new(globals.clone());
    let _ = flags.load_recipe(recipe.settings.clone());
    flags.freeze().unwrap_or_else(|_| {
        FlagService::new(globals.clone())
            .freeze()
            .expect("the globals freeze")
    })
}

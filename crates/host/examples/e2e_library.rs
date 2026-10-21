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

use questiongame_host::catalog::{
    CatalogItem, CatalogKind, CatalogLocation, CatalogService, Demo, Operator, Question, QuestionOption, SeedMode,
};
use questiongame_host::flags::{GameSettings, GlobalSettings};
use questiongame_host::OperatorId;

const NOW: u64 = 1_790_000_000_000;

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args.next().expect("usage: e2e_library <path> [--broken-board]");
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
        let mut question = Question::new(format!("e2e-extra-{i:03}"), format!("Extra question {i:03}"), (i % 100) as u8 + 1);
        question.options = vec![QuestionOption::new(format!("e2e-extra-{i:03}-a"), "Yes", true), QuestionOption::new(format!("e2e-extra-{i:03}-b"), "No", false)];
        catalog
            .catalog_upsert(&CatalogItem::Question(Box::new(question)), NOW + 2 + i as u64)
            .expect("an extra question");
    }
    if beta1_shared {
        let first = catalog.current_workspace();
        catalog.workspace_rename(&first, "Quiz club", NOW).expect("the first workspace's name");
        catalog.workspace_create("Second", None, NOW).expect("a second workspace");
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
        questiongame_host::catalog::db::write_older_schema(from, to, 5).expect("the library as beta.1 left it");
        let geography: Vec<String> = {
            let conn = rusqlite::Connection::open(to).expect("the beta.1 file");
            let mut stmt = conn.prepare("SELECT question_id FROM domain_questions WHERE domain_id = 'seed-dom-geo'").expect("a query");
            stmt.query_map([], |row| row.get(0)).expect("members").map(|r| r.expect("a member")).collect()
        };
        let place = questiongame_host::catalog::db::place_for_test;
        place(to, "teams", "seed-team-red", None).expect("Red, shared");
        place(to, "domains", "seed-dom-geo", None).expect("Geography, shared");
        for question in &geography {
            place(to, "questions", question, None).expect("its questions, shared");
        }
    } else {
        questiongame_host::catalog::db::write_older_schema(std::path::Path::new(&head), std::path::Path::new(&path), 3)
            .expect("the library as 1.x left it");
    }
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{head}{suffix}"));
    }
    println!("{path}");
}

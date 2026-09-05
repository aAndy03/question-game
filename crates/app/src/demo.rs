//! A demo library, for running P6 before P7 has library tabs.
//!
//! It is built out of the ordinary catalog types and written through the
//! ordinary `catalog_*` and `recipe_*` verbs — no back door, no fixture file,
//! no SQL. That is the point: if this seeds a library the operator could not
//! have typed in by hand, it is testing the wrong thing.
//!
//! It lives in Rust rather than in the harness's JavaScript so the compiler
//! checks every shape, and so `tests/host_wiring.rs` can drive a real Play
//! through it. §10's optional sample catalog at first run is P10's, and it
//! replaces this.

use questiongame_host::catalog::{
    BoardDomain, CatalogItem, Domain, DomainMember, GameSettings, Question, QuestionOption, Recipe,
    Team,
};
use questiongame_host::{DomainId, QuestionId, TeamId};

pub const RECIPE_ID: &str = "recipe-demo";

/// Four teams, three domains, three questions each: enough for the round
/// invariant to turn over, for a domain to run out, and for a Play to complete.
pub fn library(settings: GameSettings) -> (Vec<CatalogItem>, Recipe) {
    const TEAMS: [(&str, &str); 4] = [
        ("ALPHA", "var(--state-info)"),
        ("BETA", "var(--state-correct)"),
        ("GAMMA", "var(--state-leader)"),
        ("DELTA", "var(--state-accent)"),
    ];
    const DOMAINS: [(&str, &str, &str); 3] = [
        ("dom-sci", "Science", "SCI_204"),
        ("dom-hst", "History", "HST_102"),
        ("dom-art", "Arts", "ART_980"),
    ];
    // Easy → hard inside a domain: the queue walks these in order (§5.2).
    const DIFFICULTIES: [u8; 3] = [10, 40, 70];

    let mut items: Vec<CatalogItem> = Vec::new();

    for (name, color) in TEAMS {
        let mut team = Team::new(
            format!("team-{}", name.to_lowercase()),
            format!("TEAM {name}"),
            name,
        );
        team.color = color.to_owned();
        items.push(team.into());
    }

    for (id, name, code) in DOMAINS {
        for (n, difficulty) in DIFFICULTIES.into_iter().enumerate() {
            let question = Question::new(
                question_id(id, n),
                format!("{name} question {}?", n + 1),
                difficulty,
            )
            .with_options(
                ["A", "B", "C", "D"]
                    .into_iter()
                    .map(|letter| {
                        QuestionOption::new(
                            format!("opt-{}", letter.to_lowercase()),
                            format!("{name} answer {letter}"),
                            letter == "A",
                        )
                    })
                    .collect(),
            );
            items.push(question.into());
        }

        let mut domain = Domain::new(id, name, code);
        domain.questions = (0..DIFFICULTIES.len())
            .map(|n| DomainMember {
                question_id: QuestionId::new(question_id(id, n)),
                sort_key: n as i64,
            })
            .collect();
        items.push(domain.into());
    }

    let mut recipe = Recipe::new(RECIPE_ID, "Demo show", settings);
    recipe.teams = TEAMS
        .iter()
        .map(|(name, _)| TeamId::new(format!("team-{}", name.to_lowercase())))
        .collect();
    recipe.board = DOMAINS
        .iter()
        .map(|(id, _, _)| BoardDomain {
            domain_id: DomainId::new(*id),
            question_ids: (0..DIFFICULTIES.len())
                .map(|n| QuestionId::new(question_id(id, n)))
                .collect(),
        })
        .collect();

    (items, recipe)
}

fn question_id(domain: &str, n: usize) -> String {
    format!("q-{domain}-{n}")
}

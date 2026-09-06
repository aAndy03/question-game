//! The shipped Demo document, and *Restore sample game* (§12.1).
//!
//! First run offers a sample game so the operator can see a Play before they
//! have typed a single question. It is built out of the ordinary catalog types
//! and written through the ordinary verbs — `catalog_upsert_many` and
//! `recipe_upsert` — with no SQL of its own. If this could seed a library the
//! operator could not have typed in by hand, it would be testing the wrong
//! thing.
//!
//! Every row carries [`Origin::Seed`], and that mark is what lets a later
//! *Restore* tell three states apart: a seed row that is **missing** (never
//! seeded, or archived), one that is **present** as shipped, and one the
//! operator **edited**. `SeedMode::Missing` fills the gaps and keeps every
//! edit; `SeedMode::Overwrite` puts every row back the way it shipped. The
//! decision between them is the operator's — Studio asks with the edited count
//! (`seed.edited_rows`) — never this module's.

use serde::{Deserialize, Serialize};

use crate::flags::GameSettings;
use crate::ids::{DomainId, QuestionId, RecipeId, TeamId};

use super::error::{CatalogError, CatalogKind, CatalogResult};
use super::model::{
    BoardDomain, CatalogItem, Domain, DomainMember, Origin, Question, QuestionOption, Recipe,
    Stamps, Team,
};
use super::service::CatalogService;

/// The seed recipe's id — what the first-run wizard loads into Control.
pub const RECIPE_ID: &str = "seed-recipe-demo";

/// How far *Restore sample game* may reach (§12.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SeedMode {
    /// Insert the seed rows that are absent, restore the archived ones, and
    /// leave every row the operator touched exactly as they left it.
    Missing,
    /// Put every seed row back the way it shipped, edits included.
    Overwrite,
}

/// What a `seed_demo` did. `inserted` counts rows that came (back) into the
/// active library — absent rows written, and archived rows restored; a restored
/// row reappears the same way an inserted one does. `overwritten` counts
/// present rows rewritten, which only `SeedMode::Overwrite` does.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedResult {
    pub recipe_id: RecipeId,
    pub inserted: usize,
    pub overwritten: usize,
}

/// Where the seed stands in the library right now. `present` are active seed
/// rows, `missing` are absent or archived, and `edited` is the subset of
/// `present` whose body differs from the shipped one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedStatus {
    pub present: usize,
    pub missing: usize,
    pub edited: usize,
}

// ------------------------------------------------------------------ the document

/// One seeded domain: id, name, code, and its three questions as
/// `(stem, [option; 4])` — the first option is the correct one. Named so the
/// literal below reads as a document rather than as a nest of tuples.
type SeedQuestion = (&'static str, [&'static str; 4]);
type SeedDomain = (&'static str, &'static str, &'static str, [SeedQuestion; 3]);

/// The Demo: two teams, two domains, three questions each at 10/20/30, and one
/// recipe that uses all of it. The settings are the caller's
/// `globals.game_defaults` — the same seed a new recipe would copy (§12).
///
/// Questions go in before domains, and both before the recipe, because the
/// membership rows reference them and a batch is one transaction.
pub fn demo_document(settings: GameSettings) -> (Vec<CatalogItem>, Recipe) {
    let mut items: Vec<CatalogItem> = Vec::new();

    for (id, name, code, color) in [
        ("seed-team-red", "Red", "RED", "var(--state-incorrect)"),
        ("seed-team-blue", "Blue", "BLUE", "var(--state-info)"),
    ] {
        let mut team = Team::new(id, name, code);
        team.color = color.to_owned();
        team.origin = Origin::Seed;
        items.push(team.into());
    }

    let domains: [SeedDomain; 2] = [
        (
            "seed-dom-geo",
            "Geography",
            "GEO_101",
            [
                (
                    "Which is the largest ocean on Earth?",
                    ["Pacific", "Atlantic", "Indian", "Arctic"],
                ),
                (
                    "What is the capital of Australia?",
                    ["Canberra", "Sydney", "Melbourne", "Perth"],
                ),
                (
                    "Which river flows through Baghdad?",
                    ["Tigris", "Euphrates", "Nile", "Jordan"],
                ),
            ],
        ),
        (
            "seed-dom-sci",
            "Science",
            "SCI_204",
            [
                (
                    "What is the chemical symbol for gold?",
                    ["Au", "Ag", "Gd", "Go"],
                ),
                (
                    "How many bones does an adult human body have?",
                    ["206", "212", "198", "224"],
                ),
                (
                    "Which gas makes up most of Earth's atmosphere?",
                    ["Nitrogen", "Oxygen", "Carbon dioxide", "Argon"],
                ),
            ],
        ),
    ];

    let mut board: Vec<BoardDomain> = Vec::new();
    for (domain_id, name, code, questions) in domains {
        let question_ids: Vec<QuestionId> = (1..=questions.len())
            .map(|n| QuestionId::new(question_id(domain_id, n)))
            .collect();

        // Easy → hard inside a domain: the queue walks these in order (§5.2).
        for (index, (stem, options)) in questions.into_iter().enumerate() {
            let difficulty = ((index as u8) + 1) * 10;
            let id = question_ids[index].clone();
            let mut question = Question::new(id.clone(), stem, difficulty).with_options(
                options
                    .into_iter()
                    .zip(['a', 'b', 'c', 'd'])
                    .map(|(text, letter)| {
                        // The first option is the correct one, always.
                        QuestionOption::new(format!("{id}-{letter}"), text, letter == 'a')
                    })
                    .collect(),
            );
            question.origin = Origin::Seed;
            items.push(question.into());
        }

        let mut domain = Domain::new(domain_id, name, code);
        domain.questions = question_ids
            .iter()
            .enumerate()
            .map(|(sort_key, id)| DomainMember {
                question_id: id.clone(),
                sort_key: sort_key as i64,
            })
            .collect();
        domain.origin = Origin::Seed;
        items.push(domain.into());

        board.push(BoardDomain {
            domain_id: DomainId::new(domain_id),
            question_ids,
        });
    }

    let mut recipe = Recipe::new(RECIPE_ID, "Demo", settings);
    recipe.teams = vec![TeamId::new("seed-team-red"), TeamId::new("seed-team-blue")];
    recipe.board = board;
    recipe.origin = Origin::Seed;

    (items, recipe)
}

fn question_id(domain: &str, n: usize) -> String {
    // `seed-dom-geo` → `seed-q-geo-1`.
    let short = domain.strip_prefix("seed-dom-").unwrap_or(domain);
    format!("seed-q-{short}-{n}")
}

// ------------------------------------------------------------ edited or not

/// Whether a stored row still carries the shipped body. Stamps, counters, `rev`
/// and `origin` are host-owned or bookkeeping — an operator cannot edit them —
/// so they are levelled before the comparison.
fn same_body(shipped: &CatalogItem, stored: &CatalogItem) -> bool {
    let mut stored = stored.clone();
    match &mut stored {
        CatalogItem::Team(team) => {
            team.stamps = Stamps::default();
            team.play_count = 0;
            team.last_play_at = None;
            team.origin = Origin::Seed;
        }
        CatalogItem::Domain(domain) => {
            domain.stamps = Stamps::default();
            domain.origin = Origin::Seed;
        }
        CatalogItem::Question(question) => {
            question.stamps = Stamps::default();
            question.origin = Origin::Seed;
        }
        CatalogItem::Operator(_) | CatalogItem::Asset(_) => {}
    }
    *shipped == stored
}

fn same_recipe(shipped: &Recipe, stored: &Recipe) -> bool {
    let mut stored = stored.clone();
    stored.stamps = Stamps::default();
    stored.rev = shipped.rev;
    stored.origin = Origin::Seed;
    *shipped == stored
}

/// One seed row against the library: absent, or stored (archived or not).
enum Stored<T> {
    Absent,
    Present { row: T, archived: bool },
}

fn stored_item(service: &CatalogService, item: &CatalogItem) -> CatalogResult<Stored<CatalogItem>> {
    match service.catalog_get(item.kind(), &item.id()) {
        Ok(row) => Ok(Stored::Present {
            archived: row.is_archived(),
            row,
        }),
        Err(CatalogError::NotFound { .. }) => Ok(Stored::Absent),
        Err(error) => Err(error),
    }
}

fn stored_recipe(service: &CatalogService, id: &RecipeId) -> CatalogResult<Stored<Recipe>> {
    match service.recipe_get(id) {
        Ok(row) => Ok(Stored::Present {
            archived: row.stamps.is_archived(),
            row,
        }),
        Err(CatalogError::NotFound { .. }) => Ok(Stored::Absent),
        Err(error) => Err(error),
    }
}

// --------------------------------------------------------------- the service

impl CatalogService {
    /// `catalog_seed_demo` (§12.1). Writes go through `catalog_upsert_many`
    /// and `recipe_upsert`, so the batch is one transaction and the same
    /// validation every operator edit gets.
    ///
    /// Archived seed rows are restored in both modes: a *Restore sample game*
    /// that left half the sample in the archive would not have restored it.
    pub fn seed_demo(
        &self,
        mode: SeedMode,
        settings: GameSettings,
        now_ms: u64,
    ) -> CatalogResult<SeedResult> {
        let (items, recipe) = demo_document(settings);
        let mut to_write: Vec<CatalogItem> = Vec::new();
        let mut to_restore: Vec<(CatalogKind, String)> = Vec::new();
        let mut inserted = 0;
        let mut overwritten = 0;

        for item in &items {
            match stored_item(self, item)? {
                Stored::Absent => {
                    to_write.push(item.clone());
                    inserted += 1;
                }
                Stored::Present { archived, .. } => {
                    if archived {
                        to_restore.push((item.kind(), item.id()));
                    }
                    match mode {
                        SeedMode::Overwrite => {
                            to_write.push(item.clone());
                            overwritten += 1;
                        }
                        SeedMode::Missing if archived => inserted += 1,
                        SeedMode::Missing => {}
                    }
                }
            }
        }

        if !to_write.is_empty() {
            self.catalog_upsert_many(&to_write, now_ms)?;
        }
        for kind in [CatalogKind::Team, CatalogKind::Question, CatalogKind::Domain] {
            let ids: Vec<String> = to_restore
                .iter()
                .filter(|(k, _)| *k == kind)
                .map(|(_, id)| id.clone())
                .collect();
            if !ids.is_empty() {
                self.catalog_restore_many(kind, &ids)?;
            }
        }

        match stored_recipe(self, &recipe.id)? {
            Stored::Absent => {
                self.recipe_upsert(&recipe, now_ms)?;
                inserted += 1;
            }
            Stored::Present { archived, .. } => {
                match mode {
                    SeedMode::Overwrite => {
                        self.recipe_upsert(&recipe, now_ms)?;
                        overwritten += 1;
                    }
                    SeedMode::Missing if archived => inserted += 1,
                    SeedMode::Missing => {}
                }
                if archived {
                    self.recipe_restore(&recipe.id)?;
                }
            }
        }

        Ok(SeedResult {
            recipe_id: recipe.id,
            inserted,
            overwritten,
        })
    }

    /// `catalog_seed_status` — what *Restore sample game* is about to do, so
    /// Studio can ask before an `Overwrite` throws an edit away (§12.4
    /// `seed.edited_rows`). `settings` is the same `game_defaults` a seed would
    /// write, because a recipe whose settings drifted from them is an edit.
    pub fn seed_status(&self, settings: GameSettings) -> CatalogResult<SeedStatus> {
        let (items, recipe) = demo_document(settings);
        let mut status = SeedStatus {
            present: 0,
            missing: 0,
            edited: 0,
        };

        for item in &items {
            match stored_item(self, item)? {
                Stored::Present {
                    row,
                    archived: false,
                } => {
                    status.present += 1;
                    if !same_body(item, &row) {
                        status.edited += 1;
                    }
                }
                _ => status.missing += 1,
            }
        }
        match stored_recipe(self, &recipe.id)? {
            Stored::Present {
                row,
                archived: false,
            } => {
                status.present += 1;
                if !same_recipe(&recipe, &row) {
                    status.edited += 1;
                }
            }
            _ => status.missing += 1,
        }
        Ok(status)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_document_is_the_one_the_wire_names() {
        let (items, recipe) = demo_document(GameSettings::default());
        let ids: Vec<String> = items.iter().map(CatalogItem::id).collect();
        for expected in [
            "seed-team-red",
            "seed-team-blue",
            "seed-dom-geo",
            "seed-dom-sci",
            "seed-q-geo-1",
            "seed-q-geo-3",
            "seed-q-sci-2",
        ] {
            assert!(ids.contains(&expected.to_owned()), "missing {expected}");
        }
        assert_eq!(items.len(), 2 + 6 + 2);
        assert_eq!(recipe.id.as_str(), RECIPE_ID);
        assert_eq!(recipe.teams.len(), 2);
        assert_eq!(recipe.board.len(), 2);
        assert!(recipe.layout.as_object().is_some_and(|o| o.is_empty()));
    }

    #[test]
    fn every_row_is_valid_marked_seed_and_the_first_option_is_correct() {
        let (items, recipe) = demo_document(GameSettings::default());
        for item in &items {
            item.validate().unwrap();
            match item {
                CatalogItem::Team(t) => assert_eq!(t.origin, Origin::Seed),
                CatalogItem::Domain(d) => assert_eq!(d.origin, Origin::Seed),
                CatalogItem::Question(q) => {
                    assert_eq!(q.origin, Origin::Seed);
                    assert_eq!(q.options.len(), 4);
                    assert!(q.options[0].correct);
                    assert_eq!(q.correct_option_ids().len(), 1);
                    assert_eq!(
                        q.options[0].id.as_str(),
                        format!("{}-a", q.id),
                        "option ids hang off the question id",
                    );
                }
                other => panic!("the seed has no {}", other.kind()),
            }
        }
        recipe.validate().unwrap();
        assert_eq!(recipe.origin, Origin::Seed);
    }

    #[test]
    fn difficulty_walks_10_20_30_inside_each_domain() {
        let (items, _) = demo_document(GameSettings::default());
        for prefix in ["seed-q-geo", "seed-q-sci"] {
            let difficulties: Vec<u8> = items
                .iter()
                .filter_map(CatalogItem::as_question)
                .filter(|q| q.id.as_str().starts_with(prefix))
                .map(|q| q.difficulty)
                .collect();
            assert_eq!(difficulties, vec![10, 20, 30]);
        }
    }
}

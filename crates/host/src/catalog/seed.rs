//! The shipped Demos, and *Restore sample game* (§12.1, P11.17).
//!
//! First run offers a sample game so the operator can see a Play before they
//! have typed a single question — two of them since P11.17, one in English
//! and one in Romanian, which share no row. Each is built out of the ordinary catalog types
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
use crate::ids::{DomainId, QuestionId, RecipeId, TeamId, WorkspaceId};
use crate::settings::Language;

use super::error::{CatalogError, CatalogKind, CatalogResult};
use super::model::{
    BoardDomain, CatalogItem, Domain, DomainMember, Origin, Question, QuestionOption, Recipe,
    Stamps, Team,
};
use super::service::CatalogService;

/// The English Demo's recipe id — what the first-run wizard has loaded since P10.
pub const RECIPE_ID: &str = "seed-recipe-demo";
/// The Romanian Demo's (P11.17).
pub const RECIPE_ID_RO: &str = "seed-recipe-demo-ro";

/// Which shipped Demo (P11.17). They share no row, so restoring one never
/// rewrites the other.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Demo {
    /// "Demo" — Red and Blue, Geography and Science, 10/20/30.
    #[default]
    En,
    /// "Demo (Română)" — Roșu and Albastru, five domains, 10/50/100, and
    /// Stage's own words in Romanian.
    Ro,
}

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

// ------------------------------------------------------------------ the documents

/// `(stem, [option; 4])` — the first option is the correct one.
type SeedQuestion = (&'static str, [&'static str; 4]);
/// `(key, name, code, questions)`. The key is the id suffix: `geo` →
/// `seed-dom-geo`, `seed-q-geo-1`.
type SeedDomain = (&'static str, &'static str, &'static str, [SeedQuestion; 3]);
/// `(key, name, short code, colour)`.
type SeedTeam = (&'static str, &'static str, &'static str, &'static str);

/// One Demo as data, named so the literals below read as documents rather than
/// as a nest of tuples. Every id is `prefix` + `team-` | `dom-` | `q-` + key,
/// which keeps the English ids exactly what they were before there were two.
struct Document {
    recipe_id: &'static str,
    name: &'static str,
    prefix: &'static str,
    teams: [SeedTeam; 2],
    domains: &'static [SeedDomain],
    /// Easy → hard inside a domain: the queue walks them in this order (§5.2).
    difficulties: [u8; 3],
}

const ENGLISH: Document = Document {
    recipe_id: RECIPE_ID,
    name: "Demo",
    prefix: "seed-",
    teams: [
        ("red", "Red", "RED", "var(--state-incorrect)"),
        ("blue", "Blue", "BLUE", "var(--state-info)"),
    ],
    domains: &[
        (
            "geo",
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
            "sci",
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
    ],
    difficulties: [10, 20, 30],
};

const ROMANIAN: Document = Document {
    recipe_id: RECIPE_ID_RO,
    name: "Demo (Română)",
    prefix: "seed-ro-",
    teams: [
        ("red", "Roșu", "ROȘ", "var(--state-incorrect)"),
        ("blue", "Albastru", "ALB", "var(--state-info)"),
    ],
    domains: &[
        (
            "ist",
            "Istorie",
            "IST_310",
            [
                (
                    "În ce an a avut loc Marea Unire?",
                    ["1918", "1859", "1877", "1947"],
                ),
                (
                    "Cine a realizat unirea din 1600?",
                    [
                        "Mihai Viteazul",
                        "Ștefan cel Mare",
                        "Vlad Țepeș",
                        "Alexandru Ioan Cuza",
                    ],
                ),
                (
                    "În ce an și-a proclamat România independența?",
                    ["1877", "1859", "1866", "1881"],
                ),
            ],
        ),
        (
            "geo",
            "Geografie",
            "GEO_320",
            [
                (
                    "Care este capitala României?",
                    ["București", "Cluj-Napoca", "Iași", "Timișoara"],
                ),
                (
                    "Care este cel mai înalt vârf din România?",
                    ["Moldoveanu", "Negoiu", "Omu", "Peleaga"],
                ),
                (
                    "Care este cel mai lung fluviu din Europa?",
                    ["Volga", "Dunărea", "Nipru", "Rin"],
                ),
            ],
        ),
        (
            "sti",
            "Științe",
            "STI_330",
            [
                (
                    "Care este formula chimică a apei?",
                    ["H2O", "CO2", "O2", "NaCl"],
                ),
                (
                    "Care planetă este cea mai apropiată de Soare?",
                    ["Mercur", "Venus", "Marte", "Pământ"],
                ),
                (
                    "Care este, aproximativ, viteza luminii în vid?",
                    ["300.000 km/s", "150.000 km/s", "30.000 km/s", "3.000.000 km/s"],
                ),
            ],
        ),
        (
            "bib",
            "Biblie",
            "BIB_340",
            [
                (
                    "Cine a construit arca?",
                    ["Noe", "Moise", "Avraam", "David"],
                ),
                (
                    "Câți apostoli și-a ales Iisus?",
                    ["12", "7", "10", "40"],
                ),
                (
                    "Cine a fost primul rege al lui Israel?",
                    ["Saul", "David", "Solomon", "Samuel"],
                ),
            ],
        ),
        (
            "spo",
            "Sport",
            "SPO_350",
            [
                (
                    "Câți jucători are o echipă de fotbal pe teren?",
                    ["11", "9", "10", "12"],
                ),
                (
                    "Cine a primit prima notă de 10 din istoria gimnasticii olimpice?",
                    [
                        "Nadia Comăneci",
                        "Simona Amânar",
                        "Lavinia Miloșovici",
                        "Andreea Răducan",
                    ],
                ),
                (
                    "În ce an a câștigat Steaua București Cupa Campionilor Europeni?",
                    ["1986", "1984", "1989", "1991"],
                ),
            ],
        ),
    ],
    difficulties: [10, 50, 100],
};

/// A Demo: its rows and the one recipe that uses all of them. The settings are
/// the caller's `globals.game_defaults` — the same seed a new recipe would copy
/// (§12) — plus, for the Romanian one, Stage's language.
///
/// Questions go in before domains, and both before the recipe, because the
/// membership rows reference them and a batch is one transaction.
pub fn demo_document(demo: Demo, settings: GameSettings) -> (Vec<CatalogItem>, Recipe) {
    demo_document_in(demo, settings, &WorkspaceId::from(FIRST_WORKSPACE))
}

/// The workspace every library starts in. Its Demo keeps the ids the Demo has
/// always had, so a migrated library still recognises its own sample.
const FIRST_WORKSPACE: &str = "ws-1";

/// [`demo_document`] for one workspace (Beta 2.0). Another workspace's Demo is
/// its own rows — `seed-<workspace>-team-red` — so loading the Demo in a
/// second workspace never reaches the first one's.
pub fn demo_document_in(
    demo: Demo,
    settings: GameSettings,
    workspace: &WorkspaceId,
) -> (Vec<CatalogItem>, Recipe) {
    let scope = if workspace.as_str() == FIRST_WORKSPACE {
        String::new()
    } else {
        format!("{workspace}-")
    };
    match demo {
        Demo::En => build(&ENGLISH, settings, &scope),
        Demo::Ro => build(
            &ROMANIAN,
            GameSettings {
                language: Language::Ro,
                ..settings
            },
            &scope,
        ),
    }
}

/// `seed-` + `scope` + the rest: the scope goes right after the marker every
/// seed id starts with.
fn scoped(id: &str, scope: &str) -> String {
    match id.strip_prefix("seed-") {
        Some(rest) => format!("seed-{scope}{rest}"),
        None => id.to_owned(),
    }
}

fn build(doc: &Document, settings: GameSettings, scope: &str) -> (Vec<CatalogItem>, Recipe) {
    let mut items: Vec<CatalogItem> = Vec::new();
    let prefix = scoped(doc.prefix, scope);

    let team_ids: Vec<TeamId> = doc
        .teams
        .iter()
        .map(|(key, ..)| TeamId::new(format!("{prefix}team-{key}")))
        .collect();
    for ((_, name, code, color), id) in doc.teams.iter().zip(&team_ids) {
        let mut team = Team::new(id.clone(), *name, *code);
        team.color = (*color).to_owned();
        team.origin = Origin::Seed;
        items.push(team.into());
    }

    let mut board: Vec<BoardDomain> = Vec::new();
    for (key, name, code, questions) in doc.domains {
        let domain_id = DomainId::new(format!("{prefix}dom-{key}"));
        let question_ids: Vec<QuestionId> = (1..=questions.len())
            .map(|n| QuestionId::new(format!("{prefix}q-{key}-{n}")))
            .collect();

        for ((stem, options), (id, difficulty)) in questions
            .iter()
            .zip(question_ids.iter().zip(doc.difficulties))
        {
            let mut question = Question::new(id.clone(), *stem, difficulty).with_options(
                options
                    .iter()
                    .zip(['a', 'b', 'c', 'd'])
                    .map(|(text, letter)| {
                        // The first option is the correct one, always.
                        QuestionOption::new(format!("{id}-{letter}"), *text, letter == 'a')
                    })
                    .collect(),
            );
            question.origin = Origin::Seed;
            items.push(question.into());
        }

        let mut domain = Domain::new(domain_id.clone(), *name, *code);
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
            domain_id,
            question_ids,
        });
    }

    let mut recipe = Recipe::new(scoped(doc.recipe_id, scope), doc.name, settings);
    recipe.teams = team_ids;
    recipe.board = board;
    recipe.origin = Origin::Seed;

    (items, recipe)
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
    /// This workspace's Demo. The first workspace keeps the Demo's old ids —
    /// unless they now live elsewhere (the Demo was moved to another
    /// workspace), and then it takes its own, as any other workspace does.
    fn demo_here(&self, demo: Demo, settings: GameSettings) -> CatalogResult<(Vec<CatalogItem>, Recipe)> {
        let current = self.current_workspace();
        let document = demo_document_in(demo, settings.clone(), &current);
        if current.as_str() != FIRST_WORKSPACE {
            return Ok(document);
        }
        let conn = self.conn();
        let elsewhere = |kind: CatalogKind, id: &str| -> CatalogResult<bool> {
            Ok(matches!(super::store::home_of(&conn, kind, id)?, Some(Some(home)) if home != current.as_str()))
        };
        let moved = elsewhere(CatalogKind::Recipe, document.1.id.as_str())?
            || document.0.iter().map(|i| elsewhere(i.kind(), &i.id())).collect::<CatalogResult<Vec<_>>>()?.into_iter().any(|m| m);
        drop(conn);
        if !moved {
            return Ok(document);
        }
        Ok(match demo {
            Demo::En => build(&ENGLISH, settings, &format!("{current}-")),
            Demo::Ro => build(&ROMANIAN, GameSettings { language: Language::Ro, ..settings }, &format!("{current}-")),
        })
    }

    /// `catalog_seed_demo` (§12.1) — one Demo. Writes go through
    /// `catalog_upsert_many` and `recipe_upsert`, so the batch is one
    /// transaction and the same validation every operator edit gets.
    ///
    /// Archived seed rows are restored in both modes: a *Restore sample game*
    /// that left half the sample in the archive would not have restored it.
    pub fn seed_demo(
        &self,
        demo: Demo,
        mode: SeedMode,
        settings: GameSettings,
        now_ms: u64,
    ) -> CatalogResult<SeedResult> {
        let (items, recipe) = self.demo_here(demo, settings)?;
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

    /// `catalog_seed_status` — what *Restore sample game* is about to do for
    /// one Demo, so Studio can ask before an `Overwrite` throws an edit away
    /// (§12.4 `seed.edited_rows`). `settings` is the same `game_defaults` a
    /// seed would write, because a recipe whose settings drifted from them is
    /// an edit.
    pub fn seed_status(&self, demo: Demo, settings: GameSettings) -> CatalogResult<SeedStatus> {
        let (items, recipe) = self.demo_here(demo, settings)?;
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
        let (items, recipe) = demo_document(Demo::En, GameSettings::default());
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
    fn every_row_of_both_demos_is_valid_complete_marked_seed_and_the_first_option_is_correct() {
        for demo in [Demo::En, Demo::Ro] {
            let (items, recipe) = demo_document(demo, GameSettings::default());
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
                        assert!(
                            crate::catalog::complete::gaps(q, true).is_empty(),
                            "{} ships complete",
                            q.id
                        );
                    }
                    other => panic!("the seed has no {}", other.kind()),
                }
            }
            recipe.validate().unwrap();
            assert_eq!(recipe.origin, Origin::Seed);
        }
    }

    #[test]
    fn the_romanian_demo_is_five_domains_of_three_at_10_50_100_with_stage_in_romanian() {
        let (items, recipe) = demo_document(Demo::Ro, GameSettings::default());
        assert_eq!(recipe.id.as_str(), RECIPE_ID_RO);
        assert_eq!(recipe.name, "Demo (Română)");
        assert_eq!(recipe.settings.language, Language::Ro);
        assert_eq!(recipe.teams.len(), 2);
        assert_eq!(recipe.board.len(), 5);
        assert_eq!(items.len(), 2 + 15 + 5);
        let names: Vec<&str> = items
            .iter()
            .filter_map(CatalogItem::as_domain)
            .map(|d| d.name.as_str())
            .collect();
        assert_eq!(
            names,
            vec!["Istorie", "Geografie", "Științe", "Biblie", "Sport"]
        );
        for board in &recipe.board {
            let difficulties: Vec<Option<u8>> = board
                .question_ids
                .iter()
                .map(|id| {
                    items
                        .iter()
                        .filter_map(CatalogItem::as_question)
                        .find(|q| &q.id == id)
                        .expect("on the board and in the document")
                        .difficulty
                })
                .collect();
            assert_eq!(difficulties, vec![Some(10), Some(50), Some(100)]);
        }
    }

    #[test]
    fn the_two_demos_share_no_row() {
        let (en, en_recipe) = demo_document(Demo::En, GameSettings::default());
        let (ro, ro_recipe) = demo_document(Demo::Ro, GameSettings::default());
        let en_ids: std::collections::BTreeSet<String> = en.iter().map(CatalogItem::id).collect();
        assert!(ro.iter().all(|item| !en_ids.contains(&item.id())));
        assert_ne!(en_recipe.id, ro_recipe.id);
        assert_eq!(
            en_recipe.settings.language,
            Language::En,
            "the English Demo keeps the defaults it always had"
        );
    }

    #[test]
    fn romanian_is_written_with_comma_below_letters() {
        // ş and ţ (cedilla) are the legacy spelling; Romanian is ș and ț.
        let (items, recipe) = demo_document(Demo::Ro, GameSettings::default());
        let mut text = recipe.name.clone();
        for item in &items {
            match item {
                CatalogItem::Team(t) => text.push_str(&t.name),
                CatalogItem::Domain(d) => text.push_str(&d.name),
                CatalogItem::Question(q) => {
                    text.push_str(&q.stem);
                    q.options.iter().for_each(|o| text.push_str(&o.text));
                }
                _ => {}
            }
        }
        assert!(!text.contains(['ş', 'ţ', 'Ş', 'Ţ']), "cedilla in: {text}");
        assert!(text.contains('ș') && text.contains('ț'));
    }

    #[test]
    fn difficulty_walks_10_20_30_inside_each_domain() {
        let (items, _) = demo_document(Demo::En, GameSettings::default());
        for prefix in ["seed-q-geo", "seed-q-sci"] {
            let difficulties: Vec<Option<u8>> = items
                .iter()
                .filter_map(CatalogItem::as_question)
                .filter(|q| q.id.as_str().starts_with(prefix))
                .map(|q| q.difficulty)
                .collect();
            assert_eq!(difficulties, vec![Some(10), Some(20), Some(30)]);
        }
    }
}

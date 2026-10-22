//! Importing many questions at once (§2.32, 05_STUDIO_DESIGN.md §17.2–17.3).
//!
//! [`plan`] is pure: the text of one JSON document and a picture of the library
//! in; the rows an import would write and the report that describes them out.
//! No connection, no clock. The service runs it for the preview and again for
//! the write, so the report the operator confirmed and the rows that land
//! cannot disagree.
//!
//! Lenient by design (§2.32). A row is kept if it carries a stem or one
//! option; everything it lacks is a gap ([`super::complete`]); everything it
//! carries wrongly is dropped **and listed**, because a typo like `dificulty`
//! that vanished silently would be a difficulty the operator believes they
//! imported. The fake host's mirror is `apps/studio/src/host/fake/import.ts`;
//! change both in one commit.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::ids::{DomainId, QuestionId};

use super::complete::{self, QuestionGap};
use super::error::{CatalogError, CatalogKind, CatalogResult};
use super::model::{ArchiveScope, CatalogItem, Domain, DomainMember, Question, QuestionOption};
use super::service::{CatalogChange, CatalogService};

/// The one document shape this build reads.
pub const FORMAT: &str = "questiongame.questions";
pub const VERSION: u64 = 1;
/// Past this the file is refused whole: one transaction, and a preview the
/// operator can still read.
pub const MAX_ROWS: usize = 2_000;

/// The fields a row may carry, in the order they are read and reported.
const ROW_FIELDS: [&str; 6] = [
    "question",
    "options",
    "difficulty",
    "domains",
    "explanation",
    "tags",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RowStatus {
    Complete,
    Incomplete,
    /// Identical to an active question or an earlier row; skipped.
    Duplicate,
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IgnoredWhy {
    Unknown,
    WrongType,
    OutOfRange,
    Empty,
}

/// A value the row carried and the import dropped — said, never swallowed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ignored {
    /// `difficulty`, `options[2]`, `options[3].correct`, or an unknown key.
    pub field: String,
    pub why: IgnoredWhy,
}

impl Ignored {
    fn new(field: impl Into<String>, why: IgnoredWhy) -> Self {
        Ignored {
            field: field.into(),
            why,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RejectReason {
    NotAnObject,
    /// Neither question text nor an option with text.
    NoContent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRow {
    /// 1-based, the way a list is numbered.
    pub index: usize,
    pub status: RowStatus,
    pub stem: String,
    /// The domains the row lands in, by name — existing or new.
    pub domains: Vec<String>,
    /// The same, as the preview says them (beta.3): "History (HIS_204)", "Rome
    /// (new)", and when two domains here share the name, which one it is.
    pub landing: Vec<String>,
    /// Its tags, as they will be written.
    pub tags: Vec<String>,
    /// For a duplicate: the question it repeats — its stem, or "row 4".
    pub duplicate_of: Option<String>,
    /// Or the earlier row of this file it repeats, 1-based.
    pub duplicate_row: Option<usize>,
    pub gaps: Vec<QuestionGap>,
    pub ignored: Vec<Ignored>,
    pub reason: Option<RejectReason>,
    /// The row as it was read (P20) — what the dialog edits. None when it was
    /// not an object.
    pub body: Option<ImportRowBody>,
    /// Left out by the operator (P20): planned and reported, never written.
    pub skipped: bool,
    /// Replaced by an edit made in the dialog (P20).
    pub edited: bool,
}

/// A row as the reader understood it (P20), in the file's own terms:
/// handed back to the dialog to edit, and sent back as a row of the file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRowBody {
    pub question: String,
    pub options: Vec<ImportOption>,
    pub difficulty: Option<u8>,
    /// As written: names or codes.
    pub domains: Vec<String>,
    pub explanation: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ImportOption {
    pub text: String,
    pub correct: bool,
}

/// The operator's changes to a file (P20): rows replaced by edited ones (each
/// an object in the file's own format, read by the same reader), and rows
/// left out. Indexes are 1-based, as the report numbers rows; one that is not
/// a row of the file refuses the import whole.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
pub struct ImportOverrides {
    pub edits: BTreeMap<usize, Value>,
    pub skip: BTreeSet<usize>,
}

impl ImportRow {
    fn rejected(index: usize, stem: String, ignored: Vec<Ignored>, reason: RejectReason) -> Self {
        ImportRow {
            index,
            status: RowStatus::Rejected,
            stem,
            domains: Vec::new(),
            landing: Vec::new(),
            tags: Vec::new(),
            duplicate_of: None,
            duplicate_row: None,
            gaps: Vec::new(),
            ignored,
            reason: Some(reason),
            body: None,
            skipped: false,
            edited: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewDomain {
    pub name: String,
    pub code: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCounts {
    pub complete: usize,
    pub incomplete: usize,
    pub duplicate: usize,
    pub rejected: usize,
    /// Complete or incomplete rows the operator left out (P20); not in those counts.
    pub skipped: usize,
}

/// `catalog_import_questions`' answer, preview and commit alike.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub committed: bool,
    pub rows: Vec<ImportRow>,
    pub new_domains: Vec<NewDomain>,
    pub counts: ImportCounts,
}

/// What the import needs to know about the library: the **active** questions,
/// for duplicates, and the **active** domains, to match names against.
pub struct Library<'a> {
    pub questions: &'a [Question],
    pub domains: &'a [Domain],
}

/// The rows to write and the report that describes them. Questions come
/// before domains in a batch, because a membership row references its question.
pub struct ImportPlan {
    pub report: ImportReport,
    pub questions: Vec<Question>,
    /// Every domain whose membership grew: an existing one with the new members
    /// appended after its own (§4.1: the sort key belongs to the membership),
    /// or a new one.
    pub domains: Vec<Domain>,
}

/// Read one question file and say what importing it would do. `mint` hands
/// out the random part of every new id, so a test can make them predictable.
pub fn plan(
    text: &str,
    library: &Library<'_>,
    default_domain: Option<&DomainId>,
    mint: &mut dyn FnMut() -> String,
) -> CatalogResult<ImportPlan> {
    plan_with(text, library, default_domain, &ImportOverrides::default(), mint)
}

/// [`plan`], with the operator's edits and skips (P20). An edited row is read
/// by the same reader as the file's own, so preview and import still run one
/// plan; a skipped row is planned and reported, never written, and never the
/// original a later row is a duplicate of.
pub fn plan_with(
    text: &str,
    library: &Library<'_>,
    default_domain: Option<&DomainId>,
    overrides: &ImportOverrides,
    mint: &mut dyn FnMut() -> String,
) -> CatalogResult<ImportPlan> {
    let rows = rows_of(text)?;
    if let Some(&index) = overrides
        .edits
        .keys()
        .chain(overrides.skip.iter())
        .find(|&&i| i == 0 || i > rows.len())
    {
        return Err(refused(format!("row {index} is not in this file")));
    }
    if let Some(id) = default_domain
        && !library.domains.iter().any(|d| &d.id == id)
    {
        return Err(refused(
            "the domain chosen for questions without one is not in the active library",
        ));
    }

    // Each fingerprint with what the operator would recognise it by.
    let mut seen: BTreeMap<Fingerprint, (Option<String>, Option<usize>)> = library
        .questions
        .iter()
        .map(|q| {
            (
                fingerprint(
                    &q.stem,
                    q.options.iter().map(|o| (o.text.as_str(), o.correct)),
                ),
                (Some(q.stem.clone()), None),
            )
        })
        .collect();
    let mut resolver = Resolver::new(library.domains);
    let mut report_rows = Vec::with_capacity(rows.len());
    let mut questions = Vec::new();
    let mut counts = ImportCounts::default();

    for (i, raw) in rows.into_iter().enumerate() {
        let index = i + 1;
        let edited = overrides.edits.contains_key(&index);
        let raw = overrides.edits.get(&index).cloned().unwrap_or(raw);
        let Value::Object(fields) = raw else {
            counts.rejected += 1;
            report_rows.push(ImportRow {
                edited,
                ..ImportRow::rejected(index, String::new(), Vec::new(), RejectReason::NotAnObject)
            });
            continue;
        };
        let read = read_row(&fields);
        let body = Some(read.body());
        if read.stem.is_empty() && read.options.is_empty() {
            counts.rejected += 1;
            report_rows.push(ImportRow {
                body,
                edited,
                ..ImportRow::rejected(index, read.stem, read.ignored, RejectReason::NoContent)
            });
            continue;
        }
        let print = fingerprint(
            &read.stem,
            read.options
                .iter()
                .map(|(text, correct)| (text.as_str(), *correct)),
        );
        if let Some(of) = seen.get(&print) {
            counts.duplicate += 1;
            // Its tags and domains as written (P20): grouped by tag or domain,
            // a duplicate sits with the rows it resembles, not under "none".
            report_rows.push(ImportRow {
                index,
                status: RowStatus::Duplicate,
                stem: read.stem.clone(),
                domains: read.domains.clone(),
                landing: Vec::new(),
                tags: clean_or_empty(&read.tags),
                duplicate_of: of.0.clone(),
                duplicate_row: of.1,
                gaps: Vec::new(),
                ignored: read.ignored,
                reason: None,
                body,
                skipped: false,
                edited,
            });
            continue;
        }
        // Left out: planned and said, never the original of a later duplicate.
        let skipped = overrides.skip.contains(&index);
        if !skipped {
            seen.insert(print, (None, Some(index)));
        }

        let mut domain_ids: Vec<DomainId> = Vec::new();
        for name in &read.domains {
            let id = resolver.resolve(name, mint);
            if !domain_ids.contains(&id) {
                domain_ids.push(id);
            }
        }
        if domain_ids.is_empty()
            && let Some(id) = default_domain
        {
            domain_ids.push(id.clone());
        }

        let id = QuestionId::new(format!("q-{}", mint()));
        let mut question = Question::new(id.clone(), read.stem.clone(), 1);
        question.difficulty = read.difficulty;
        question.explanation = read.explanation;
        question.tags = read.tags;
        let tags = clean_or_empty(&question.tags);
        question.options = read
            .options
            .iter()
            .enumerate()
            .map(|(k, (text, correct))| {
                QuestionOption::new(format!("{id}-{}", option_suffix(k)), text.clone(), *correct)
            })
            .collect();

        let gaps = complete::gaps(&question, !domain_ids.is_empty());
        let status = if gaps.is_empty() {
            RowStatus::Complete
        } else {
            RowStatus::Incomplete
        };
        if skipped {
            counts.skipped += 1;
        } else {
            if gaps.is_empty() {
                counts.complete += 1;
            } else {
                counts.incomplete += 1;
            }
            for domain in &domain_ids {
                resolver.add_member(domain, &id);
            }
        }
        report_rows.push(ImportRow {
            index,
            status,
            stem: read.stem,
            domains: domain_ids.iter().map(|d| resolver.name_of(d)).collect(),
            landing: domain_ids.iter().map(|d| resolver.landing_of(d)).collect(),
            tags,
            duplicate_of: None,
            duplicate_row: None,
            gaps,
            ignored: read.ignored,
            reason: None,
            body,
            skipped,
            edited,
        });
        if !skipped {
            questions.push(question);
        }
    }

    let (domains, new_domains) = resolver.finish();
    Ok(ImportPlan {
        report: ImportReport {
            committed: false,
            rows: report_rows,
            new_domains,
            counts,
        },
        questions,
        domains,
    })
}

/// The code a new domain gets — the rule the Domain form applies
/// (`apps/studio/src/host/domain.ts`), so an imported domain looks like one
/// typed in by hand: three ASCII capitals, padded with `X`, and a hash of the
/// name. The hash reads the first UTF-16 unit of each character, as
/// `charCodeAt(0)` does.
pub fn suggest_code(name: &str) -> String {
    let letters: String = name
        .to_uppercase()
        .chars()
        .filter(char::is_ascii_uppercase)
        .take(3)
        .collect();
    let mut hash: u32 = 0;
    for ch in name.chars() {
        let mut units = [0u16; 2];
        let first = ch.encode_utf16(&mut units)[0];
        hash = (hash * 31 + u32::from(first)) % 1000;
    }
    format!("{letters:X<3}_{hash:03}")
}

// ----------------------------------------------------------------- reading

fn refused(reason: impl Into<String>) -> CatalogError {
    CatalogError::Import {
        reason: reason.into(),
    }
}

fn rows_of(text: &str) -> CatalogResult<Vec<Value>> {
    let document: Value = serde_json::from_str(text)
        .map_err(|error| refused(format!("the file is not valid JSON: {error}")))?;
    let rows = match document {
        Value::Array(rows) => rows,
        Value::Object(mut map) => {
            if let Some(format) = map.get("format")
                && format.as_str() != Some(FORMAT)
            {
                return Err(refused(format!(
                    "this is not a questiongame question file (`format` must be \"{FORMAT}\")"
                )));
            }
            if let Some(version) = map.get("version")
                && version.as_u64() != Some(VERSION)
            {
                return Err(refused(format!(
                    "this file is from a version this build cannot read (`version` must be {VERSION})"
                )));
            }
            match map.remove("questions") {
                Some(Value::Array(rows)) => rows,
                _ => return Err(refused("the file has no `questions` list")),
            }
        }
        _ => return Err(refused("the file has no `questions` list")),
    };
    if rows.len() > MAX_ROWS {
        return Err(refused(format!(
            "the file has {} questions; one import takes at most {MAX_ROWS}",
            rows.len()
        )));
    }
    Ok(rows)
}

/// Tags as a save would write them, or none when a save would refuse the list.
fn clean_or_empty(tags: &[String]) -> Vec<String> {
    super::groups::clean_tags(tags, "import")
        .map(|clean| clean.into_iter().map(|(tag, _)| tag).collect())
        .unwrap_or_default()
}

/// One row, read as far as it can be.
struct Read {
    stem: String,
    options: Vec<(String, bool)>,
    difficulty: Option<u8>,
    domains: Vec<String>,
    explanation: Option<String>,
    /// P15: cleaned like any save; a list the save would refuse (a tag over
    /// 40 characters, more than 20) is dropped whole and said, never trimmed.
    tags: Vec<String>,
    ignored: Vec<Ignored>,
}

impl Read {
    /// The row in the file's own terms (P20), for the dialog to show and edit.
    fn body(&self) -> ImportRowBody {
        ImportRowBody {
            question: self.stem.clone(),
            options: self
                .options
                .iter()
                .map(|(text, correct)| ImportOption {
                    text: text.clone(),
                    correct: *correct,
                })
                .collect(),
            difficulty: self.difficulty,
            domains: self.domains.clone(),
            explanation: self.explanation.clone(),
            tags: self.tags.clone(),
        }
    }
}

fn read_row(fields: &Map<String, Value>) -> Read {
    let mut read = Read {
        stem: String::new(),
        options: Vec::new(),
        difficulty: None,
        domains: Vec::new(),
        explanation: None,
        tags: Vec::new(),
        ignored: Vec::new(),
    };
    // Unknown keys first, sorted, so the report does not depend on how the
    // JSON map happens to iterate.
    let mut unknown: Vec<&String> = fields
        .keys()
        .filter(|key| !ROW_FIELDS.contains(&key.as_str()))
        .collect();
    unknown.sort();
    for key in unknown {
        read.ignored
            .push(Ignored::new(key.as_str(), IgnoredWhy::Unknown));
    }

    match fields.get("question") {
        None | Some(Value::Null) => {}
        Some(Value::String(text)) => read.stem = text.trim().to_owned(),
        Some(_) => read
            .ignored
            .push(Ignored::new("question", IgnoredWhy::WrongType)),
    }
    match fields.get("options") {
        None | Some(Value::Null) => {}
        Some(Value::Array(items)) => {
            for (k, item) in items.iter().enumerate() {
                read_option(&mut read, k, item);
            }
        }
        Some(_) => read
            .ignored
            .push(Ignored::new("options", IgnoredWhy::WrongType)),
    }
    match fields.get("difficulty") {
        None | Some(Value::Null) => {}
        Some(Value::Number(number)) => match number.as_f64() {
            Some(d) if d.fract() == 0.0 && (1.0..=100.0).contains(&d) => {
                read.difficulty = Some(d as u8);
            }
            _ => read
                .ignored
                .push(Ignored::new("difficulty", IgnoredWhy::OutOfRange)),
        },
        Some(_) => read
            .ignored
            .push(Ignored::new("difficulty", IgnoredWhy::WrongType)),
    }
    match fields.get("domains") {
        None | Some(Value::Null) => {}
        Some(Value::String(name)) => push_domain(&mut read, "domains", name),
        Some(Value::Array(items)) => {
            for (k, item) in items.iter().enumerate() {
                let field = format!("domains[{k}]");
                match item {
                    Value::String(name) => push_domain(&mut read, &field, name),
                    _ => read
                        .ignored
                        .push(Ignored::new(field, IgnoredWhy::WrongType)),
                }
            }
        }
        Some(_) => read
            .ignored
            .push(Ignored::new("domains", IgnoredWhy::WrongType)),
    }
    match fields.get("explanation") {
        None | Some(Value::Null) => {}
        Some(Value::String(text)) if text.trim().is_empty() => {}
        Some(Value::String(text)) => read.explanation = Some(text.trim().to_owned()),
        Some(_) => read
            .ignored
            .push(Ignored::new("explanation", IgnoredWhy::WrongType)),
    }
    match fields.get("tags") {
        None | Some(Value::Null) => {}
        Some(Value::Array(items)) if items.iter().all(Value::is_string) => {
            let tags: Vec<String> = items
                .iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect();
            match super::groups::clean_tags(&tags, "import") {
                Ok(clean) => read.tags = clean.into_iter().map(|(tag, _)| tag).collect(),
                Err(_) => read
                    .ignored
                    .push(Ignored::new("tags", IgnoredWhy::OutOfRange)),
            }
        }
        Some(_) => read
            .ignored
            .push(Ignored::new("tags", IgnoredWhy::WrongType)),
    }
    read
}

fn read_option(read: &mut Read, k: usize, item: &Value) {
    let field = format!("options[{k}]");
    let (text, correct) = match item {
        Value::String(text) => (text, false),
        Value::Object(option) => {
            let Some(Value::String(text)) = option.get("text") else {
                read.ignored
                    .push(Ignored::new(field, IgnoredWhy::WrongType));
                return;
            };
            let correct = match option.get("correct") {
                None | Some(Value::Null) => false,
                Some(Value::Bool(correct)) => *correct,
                Some(_) => {
                    read.ignored.push(Ignored::new(
                        format!("{field}.correct"),
                        IgnoredWhy::WrongType,
                    ));
                    false
                }
            };
            (text, correct)
        }
        _ => {
            read.ignored
                .push(Ignored::new(field, IgnoredWhy::WrongType));
            return;
        }
    };
    if text.trim().is_empty() {
        read.ignored.push(Ignored::new(field, IgnoredWhy::Empty));
        return;
    }
    read.options.push((text.trim().to_owned(), correct));
}

fn push_domain(read: &mut Read, field: &str, name: &str) {
    if name.trim().is_empty() {
        read.ignored.push(Ignored::new(field, IgnoredWhy::Empty));
    } else {
        read.domains.push(name.to_owned());
    }
}

fn option_suffix(k: usize) -> String {
    match u8::try_from(k) {
        Ok(k) if k < 26 => char::from(b'a' + k).to_string(),
        _ => format!("o{k}"),
    }
}

// ----------------------------------------------------------------- matching

/// Trimmed, inner whitespace collapsed, lower case — how two spellings of one
/// thing are recognised.
fn fold(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// A question as the duplicate check sees it: the folded stem and the folded
/// options with their marks, as a set (order never decided a duplicate).
type Fingerprint = (String, Vec<(String, bool)>);

fn fingerprint<'a>(stem: &str, options: impl Iterator<Item = (&'a str, bool)>) -> Fingerprint {
    let mut options: Vec<(String, bool)> = options
        .map(|(text, correct)| (fold(text), correct))
        .collect();
    options.sort();
    (fold(stem), options)
}

/// Domain names to ids: the active library first, then the domains this import
/// creates — each created once, whatever spellings name it.
struct Resolver<'a> {
    library: &'a [Domain],
    created: Vec<Domain>,
    by_key: BTreeMap<String, DomainId>,
    members: BTreeMap<DomainId, Vec<QuestionId>>,
    /// Domains in the order the import first touched them.
    order: Vec<DomainId>,
}

impl<'a> Resolver<'a> {
    fn new(library: &'a [Domain]) -> Self {
        let mut by_key = BTreeMap::new();
        // Two domains of one name: the oldest takes it (beta.3), and the
        // preview says which; a code always names exactly one.
        let mut oldest: Vec<&Domain> = library.iter().collect();
        oldest.sort_by(|a, b| {
            a.stamps
                .created_at
                .cmp(&b.stamps.created_at)
                .then_with(|| a.id.cmp(&b.id))
        });
        // Names before codes, so a code that happens to spell another
        // domain's name never shadows it.
        for domain in &oldest {
            by_key
                .entry(fold(&domain.name))
                .or_insert_with(|| domain.id.clone());
        }
        for domain in &oldest {
            by_key
                .entry(fold(&domain.code))
                .or_insert_with(|| domain.id.clone());
        }
        Resolver {
            library,
            created: Vec::new(),
            by_key,
            members: BTreeMap::new(),
            order: Vec::new(),
        }
    }

    fn resolve(&mut self, name: &str, mint: &mut dyn FnMut() -> String) -> DomainId {
        let key = fold(name);
        if let Some(id) = self.by_key.get(&key) {
            return id.clone();
        }
        let spelled = name.split_whitespace().collect::<Vec<_>>().join(" ");
        let id = DomainId::new(format!("dom-{}", mint()));
        let code = suggest_code(&spelled);
        self.created.push(Domain::new(id.clone(), spelled, code));
        self.by_key.insert(key, id.clone());
        id
    }

    fn add_member(&mut self, domain: &DomainId, question: &QuestionId) {
        if !self.members.contains_key(domain) {
            self.order.push(domain.clone());
        }
        self.members
            .entry(domain.clone())
            .or_default()
            .push(question.clone());
    }

    fn find(&self, id: &DomainId) -> Option<&Domain> {
        self.library
            .iter()
            .chain(&self.created)
            .find(|d| &d.id == id)
    }

    fn name_of(&self, id: &DomainId) -> String {
        self.find(id).map(|d| d.name.clone()).unwrap_or_default()
    }

    /// How the preview says where a row lands.
    fn landing_of(&self, id: &DomainId) -> String {
        let Some(domain) = self.find(id) else {
            return String::new();
        };
        if self.created.iter().any(|d| &d.id == id) {
            return format!("{} (new)", domain.name);
        }
        let mut twins: Vec<&Domain> = self
            .library
            .iter()
            .filter(|d| fold(&d.name) == fold(&domain.name))
            .collect();
        if twins.len() > 1 {
            twins.sort_by(|a, b| {
                a.stamps
                    .created_at
                    .cmp(&b.stamps.created_at)
                    .then_with(|| a.id.cmp(&b.id))
            });
            let which = if twins[0].id == domain.id {
                "the oldest"
            } else {
                "one"
            };
            format!(
                "{} ({}), {which} of {} named {}",
                domain.name,
                domain.code,
                twins.len(),
                domain.name
            )
        } else {
            format!("{} ({})", domain.name, domain.code)
        }
    }

    fn finish(self) -> (Vec<Domain>, Vec<NewDomain>) {
        let new_domains = self
            .created
            .iter()
            .filter(|d| self.members.contains_key(&d.id))
            .map(|d| NewDomain {
                name: d.name.clone(),
                code: d.code.clone(),
            })
            .collect();
        let domains = self
            .order
            .iter()
            .filter_map(|id| {
                let mut domain = self.find(id)?.clone();
                let first = domain
                    .questions
                    .iter()
                    .map(|m| m.sort_key)
                    .max()
                    .map_or(0, |key| key + 1);
                let appended = self.members[id]
                    .iter()
                    .zip(first..)
                    .map(|(question, sort_key)| DomainMember {
                        question_id: question.clone(),
                        sort_key,
                        group_id: None,
                    });
                domain.questions.extend(appended);
                Some(domain)
            })
            .collect();
        (domains, new_domains)
    }
}

// --------------------------------------------------------------- the service

impl CatalogService {
    /// `catalog_import_questions` (§2.32). `commit: false` answers the report
    /// and writes nothing; `commit: true` runs the same plan and writes it
    /// through [`CatalogService::catalog_upsert_many`] — one transaction, the
    /// validation every edit gets, and a failure leaves the library as it was.
    pub fn import_questions(
        &self,
        text: &str,
        commit: bool,
        default_domain: Option<&DomainId>,
        now_ms: u64,
    ) -> CatalogResult<(ImportReport, Vec<CatalogChange>)> {
        self.import_questions_with(text, commit, default_domain, &ImportOverrides::default(), now_ms)
    }

    /// [`Self::import_questions`] with the dialog's edits and skips (P20).
    pub fn import_questions_with(
        &self,
        text: &str,
        commit: bool,
        default_domain: Option<&DomainId>,
        overrides: &ImportOverrides,
        now_ms: u64,
    ) -> CatalogResult<(ImportReport, Vec<CatalogChange>)> {
        let questions: Vec<Question> = self
            .catalog_list(CatalogKind::Question, ArchiveScope::Active)?
            .into_iter()
            .filter_map(|item| item.as_question().cloned())
            .collect();
        let domains: Vec<Domain> = self
            .catalog_list(CatalogKind::Domain, ArchiveScope::Active)?
            .into_iter()
            .filter_map(|item| item.as_domain().cloned())
            .collect();
        let library = Library {
            questions: &questions,
            domains: &domains,
        };
        let mut mint = || uuid::Uuid::new_v4().simple().to_string()[..8].to_owned();
        let plan = plan_with(text, &library, default_domain, overrides, &mut mint)?;
        if !commit {
            return Ok((plan.report, Vec::new()));
        }
        let items: Vec<CatalogItem> = plan
            .questions
            .into_iter()
            .map(CatalogItem::from)
            .chain(plan.domains.into_iter().map(CatalogItem::from))
            .collect();
        let changes = if items.is_empty() {
            Vec::new()
        } else {
            self.catalog_upsert_many(&items, now_ms)?
        };
        Ok((
            ImportReport {
                committed: true,
                ..plan.report
            },
            changes,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn counter() -> impl FnMut() -> String {
        let mut n = 0u32;
        move || {
            n += 1;
            format!("{n:08x}")
        }
    }

    fn geo() -> Domain {
        Domain::new("dom-geo", "Geografie", "GEO_101")
    }

    fn run(
        text: &str,
        questions: &[Question],
        domains: &[Domain],
        default: Option<&str>,
    ) -> CatalogResult<ImportPlan> {
        let library = Library { questions, domains };
        let default = default.map(DomainId::from);
        let mut mint = counter();
        plan(text, &library, default.as_ref(), &mut mint)
    }

    fn statuses(plan: &ImportPlan) -> Vec<RowStatus> {
        plan.report.rows.iter().map(|row| row.status).collect()
    }

    #[test]
    fn a_whole_row_is_complete_and_lands_in_its_domain() {
        let text = r#"{ "format": "questiongame.questions", "version": 1, "questions": [
            { "question": "Capitala Australiei?",
              "options": [ { "text": "Canberra", "correct": true }, "Sydney" ],
              "difficulty": 50, "domains": ["geografie"], "explanation": "Un compromis." } ] }"#;
        let plan = run(text, &[], &[geo()], None).unwrap();
        assert_eq!(statuses(&plan), vec![RowStatus::Complete]);
        let q = &plan.questions[0];
        assert_eq!(q.stem, "Capitala Australiei?");
        assert_eq!(q.difficulty, Some(50));
        assert_eq!(q.options.len(), 2);
        assert!(q.options[0].correct && !q.options[1].correct);
        assert_eq!(q.options[0].id.as_str(), format!("{}-a", q.id));
        assert_eq!(q.explanation.as_deref(), Some("Un compromis."));
        assert_eq!(plan.domains.len(), 1);
        assert_eq!(plan.domains[0].id.as_str(), "dom-geo");
        assert_eq!(plan.domains[0].questions[0].question_id, q.id);
        assert_eq!(plan.report.rows[0].domains, vec!["Geografie".to_owned()]);
        assert!(plan.report.new_domains.is_empty());
    }

    #[test]
    fn a_stem_alone_is_accepted_as_incomplete() {
        let plan = run(r#"[ { "question": "Doar textul?" } ]"#, &[], &[], None).unwrap();
        assert_eq!(statuses(&plan), vec![RowStatus::Incomplete]);
        assert_eq!(
            plan.report.rows[0].gaps,
            vec![
                QuestionGap::Options,
                QuestionGap::Correct,
                QuestionGap::Difficulty,
                QuestionGap::Domain
            ]
        );
        assert_eq!(plan.questions.len(), 1);
    }

    #[test]
    fn options_alone_are_accepted_as_incomplete() {
        let plan = run(
            r#"[ { "question": "", "options": ["A", "B"] } ]"#,
            &[],
            &[],
            None,
        )
        .unwrap();
        assert_eq!(statuses(&plan), vec![RowStatus::Incomplete]);
        assert_eq!(plan.report.rows[0].gaps[0], QuestionGap::Stem);
    }

    #[test]
    fn neither_a_stem_nor_an_option_is_rejected_and_nothing_is_planned_for_it() {
        let plan = run(
            r#"[ { "difficulty": 10, "domains": ["Istorie"] }, 7 ]"#,
            &[],
            &[],
            None,
        )
        .unwrap();
        assert_eq!(
            statuses(&plan),
            vec![RowStatus::Rejected, RowStatus::Rejected]
        );
        assert_eq!(plan.report.rows[0].reason, Some(RejectReason::NoContent));
        assert_eq!(plan.report.rows[1].reason, Some(RejectReason::NotAnObject));
        assert!(plan.questions.is_empty());
        assert!(
            plan.report.new_domains.is_empty(),
            "a rejected row creates no domain"
        );
    }

    #[test]
    fn an_unknown_domain_is_created_once_for_two_spellings() {
        let text = r#"[ { "question": "Q1?", "domains": ["Istorie"] },
                       { "question": "Q2?", "domains": ["  istorie "] } ]"#;
        let plan = run(text, &[], &[], None).unwrap();
        assert_eq!(
            plan.report.new_domains,
            vec![NewDomain {
                name: "Istorie".to_owned(),
                code: "IST_225".to_owned()
            }]
        );
        assert_eq!(plan.domains.len(), 1);
        assert_eq!(plan.domains[0].questions.len(), 2);
        assert!(
            plan.report
                .rows
                .iter()
                .all(|row| !row.gaps.contains(&QuestionGap::Domain))
        );
    }

    #[test]
    fn a_domain_is_matched_by_its_code_too() {
        let plan = run(
            r#"[ { "question": "Q?", "domains": "geo_101" } ]"#,
            &[],
            &[geo()],
            None,
        )
        .unwrap();
        assert_eq!(plan.domains[0].id.as_str(), "dom-geo");
        assert!(plan.report.new_domains.is_empty());
    }

    #[test]
    fn new_members_are_appended_after_the_ones_a_domain_has() {
        let mut existing = geo();
        existing.questions = vec![DomainMember {
            question_id: QuestionId::from("q-old"),
            sort_key: 4,
            group_id: None,
        }];
        let plan = run(
            r#"[ { "question": "Q?", "domains": ["Geografie"] } ]"#,
            &[],
            &[existing],
            None,
        )
        .unwrap();
        let keys: Vec<i64> = plan.domains[0]
            .questions
            .iter()
            .map(|m| m.sort_key)
            .collect();
        assert_eq!(keys, vec![4, 5]);
    }

    #[test]
    fn a_row_without_a_domain_goes_to_the_default_one() {
        let plan = run(
            r#"[ { "question": "Q?" } ]"#,
            &[],
            &[geo()],
            Some("dom-geo"),
        )
        .unwrap();
        assert_eq!(plan.report.rows[0].domains, vec!["Geografie".to_owned()]);
        assert!(!plan.report.rows[0].gaps.contains(&QuestionGap::Domain));
    }

    #[test]
    fn a_default_domain_that_is_not_active_refuses_the_import() {
        let error = run(r#"[ { "question": "Q?" } ]"#, &[], &[], Some("dom-gone"))
            .err()
            .unwrap();
        assert!(error.to_string().starts_with("import: "), "{error}");
    }

    #[test]
    fn a_duplicate_of_the_library_or_of_an_earlier_row_is_skipped() {
        let existing = Question::new("q-old", "Capitala României?", 10).with_options(vec![
            QuestionOption::new("q-old-a", "București", true),
            QuestionOption::new("q-old-b", "Iași", false),
        ]);
        let text = r#"[
            { "question": "capitala  româniei?", "options": [ "Iași", { "text": "București", "correct": true } ] },
            { "question": "Nou?", "options": ["A"] },
            { "question": "nou?", "options": ["a"] }
        ]"#;
        let plan = run(text, &[existing], &[], None).unwrap();
        assert_eq!(
            statuses(&plan),
            vec![
                RowStatus::Duplicate,
                RowStatus::Incomplete,
                RowStatus::Duplicate
            ]
        );
        assert_eq!(plan.questions.len(), 1);
        assert_eq!(plan.report.counts.duplicate, 2);
    }

    #[test]
    fn what_cannot_be_read_is_dropped_and_listed() {
        let text = r#"[ { "question": "Q?", "zeta": 1, "dificulty": 10, "difficulty": 150,
                          "options": ["A", "", 3, { "text": "B", "correct": "yes" }] } ]"#;
        let plan = run(text, &[], &[], None).unwrap();
        let row = &plan.report.rows[0];
        assert_eq!(
            row.ignored,
            vec![
                Ignored::new("dificulty", IgnoredWhy::Unknown),
                Ignored::new("zeta", IgnoredWhy::Unknown),
                Ignored::new("options[1]", IgnoredWhy::Empty),
                Ignored::new("options[2]", IgnoredWhy::WrongType),
                Ignored::new("options[3].correct", IgnoredWhy::WrongType),
                Ignored::new("difficulty", IgnoredWhy::OutOfRange),
            ]
        );
        assert_eq!(row.status, RowStatus::Incomplete);
        assert_eq!(plan.questions[0].options.len(), 2);
        assert_eq!(plan.questions[0].difficulty, None);
    }

    #[test]
    fn a_file_that_cannot_be_read_is_refused_whole() {
        for (text, needle) in [
            ("{ nope", "not valid JSON"),
            (r#"{ "format": "other", "questions": [] }"#, "`format`"),
            (r#"{ "version": 2, "questions": [] }"#, "`version`"),
            (r#"{ "rows": [] }"#, "`questions`"),
            ("42", "`questions`"),
        ] {
            let error = run(text, &[], &[], None).err().expect("refused");
            assert!(error.to_string().contains(needle), "{text} → {error}");
        }
    }

    #[test]
    fn bad_json_names_the_line_and_the_column() {
        let error = run("[\n  { \"question\": \"Q?\" \n  { }\n]", &[], &[], None)
            .err()
            .unwrap();
        let message = error.to_string();
        assert!(
            message.contains("line 3") && message.contains("column"),
            "{message}"
        );
    }

    #[test]
    fn more_rows_than_the_cap_are_refused_whole() {
        let text = format!(
            "[{}]",
            vec![r#"{ "question": "Q?" }"#; MAX_ROWS + 1].join(",")
        );
        let error = run(&text, &[], &[], None).err().unwrap();
        assert!(error.to_string().contains("at most 2000"), "{error}");
    }

    #[test]
    fn an_empty_list_is_an_empty_report() {
        let plan = run(r#"{ "questions": [] }"#, &[], &[], None).unwrap();
        assert!(plan.report.rows.is_empty());
        assert!(plan.questions.is_empty());
        assert!(plan.domains.is_empty());
    }

    #[test]
    fn the_code_of_a_new_domain_follows_the_domain_form() {
        // The numbers `suggestDomainCode` produces in Studio for the same names.
        assert_eq!(suggest_code("Istorie"), "IST_225");
        assert_eq!(suggest_code("Științe"), "TII_812");
        assert_eq!(suggest_code("Ab"), "ABX_113");
        assert_eq!(suggest_code("Geografie"), "GEO_165");
    }
}

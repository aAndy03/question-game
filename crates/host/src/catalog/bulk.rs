//! Bulk edits on a selection of questions, and *Manage tags* (Beta, P15).
//!
//! Each is one transaction, validated as it goes and refused whole; a preview
//! is the same write rolled back, so the confirm cannot promise what the write
//! will not do. The rules are the one-by-one rules: a bulk *Set difficulty*
//! may leave a board with a clash, which Load reports (§2.31), exactly as a
//! single edit would. Copies in other workspaces are **not** updated — *Also
//! update {n} copies* stays a one-question choice.

use std::collections::BTreeSet;

use rusqlite::Transaction;
use serde::{Deserialize, Serialize};

use crate::ids::{DomainGroupId, DomainId, QuestionId};

use super::error::{CatalogError, CatalogResult};
use super::groups::{TAGS_PER_QUESTION, tag_key};
use super::model::{DomainMember, Question};
use super::service::CatalogService;
use super::store;

/// One edit for every selected question.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum BulkEdit {
    Tag { tag: String },
    Untag { tag: String },
    /// Inside one domain: a group of it, or `None` for *No group*.
    Group { domain_id: DomainId, group_id: Option<DomainGroupId> },
    AddToDomain { domain_id: DomainId },
    RemoveFromDomain { domain_id: DomainId },
    SetDifficulty { difficulty: Option<u8> },
}

/// What a bulk edit did — or, previewed, would do.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkReport {
    pub changed: Vec<QuestionId>,
    /// Selected, and already as asked (already tagged, not a member, …).
    pub unchanged: Vec<QuestionId>,
    /// How many changes reach every workspace: shared questions for a tag or a
    /// difficulty; for a membership edit (Group, Add to / Remove from domain)
    /// every change when the domain is shared and none when it is not — it is
    /// the domain that changes, not the question.
    pub shared: usize,
}

impl CatalogService {
    /// Apply `edit` to every question in `ids`. `write: false` is the preview.
    pub fn catalog_bulk_edit(
        &self,
        ids: &[QuestionId],
        edit: &BulkEdit,
        write: bool,
        now_ms: u64,
    ) -> CatalogResult<BulkReport> {
        let mut seen = BTreeSet::new();
        let ids: Vec<QuestionId> = ids.iter().filter(|id| seen.insert((*id).clone())).cloned().collect();
        if ids.is_empty() {
            return Err(CatalogError::invalid("bulk", "nothing is selected"));
        }
        let report = {
            let mut conn = self.conn();
            let tx = conn.transaction()?;
            let report = apply(&tx, &ids, edit, now_ms)?;
            if write {
                tx.commit()?;
            }
            report
        };
        if write && !report.changed.is_empty() {
            self.rebuild_search_index()?;
        }
        Ok(report)
    }

    /// *Manage tags* ▸ Rename: every question in view carrying `from` carries
    /// `to` instead. To a tag that exists, it is a merge — a question that has
    /// both keeps one. A change of case only re-spells it.
    pub fn tag_rename(&self, from: &str, to: &str, write: bool, now_ms: u64) -> CatalogResult<BulkReport> {
        let clean = super::groups::clean_tags(&[to.to_owned()], "tag")?;
        let Some((to, to_key)) = clean.into_iter().next() else {
            return Err(CatalogError::invalid("tag.name", "a tag needs a name"));
        };
        let report = {
            let mut conn = self.conn();
            let tx = conn.transaction()?;
            let report = store::tag_rename(&tx, &tag_key(from), &to, &to_key, now_ms)?;
            if write {
                tx.commit()?;
            }
            report
        };
        if write && !report.changed.is_empty() {
            self.rebuild_search_index()?;
        }
        Ok(report)
    }

    /// *Manage tags* ▸ Delete: the tag leaves every question in view.
    pub fn tag_delete(&self, tag: &str, write: bool, now_ms: u64) -> CatalogResult<BulkReport> {
        let report = {
            let mut conn = self.conn();
            let tx = conn.transaction()?;
            let report = store::tag_delete(&tx, &tag_key(tag), now_ms)?;
            if write {
                tx.commit()?;
            }
            report
        };
        if write && !report.changed.is_empty() {
            self.rebuild_search_index()?;
        }
        Ok(report)
    }
}

fn apply(tx: &Transaction<'_>, ids: &[QuestionId], edit: &BulkEdit, now_ms: u64) -> CatalogResult<BulkReport> {
    let mut report = BulkReport::default();
    let questions: Vec<Question> = ids.iter().map(|id| store::question_get(tx, id)).collect::<CatalogResult<_>>()?;
    report.shared = questions.iter().filter(|q| q.stamps.shared).count();

    match edit {
        BulkEdit::Tag { tag } => {
            let clean = super::groups::clean_tags(std::slice::from_ref(tag), "tag")?;
            let Some((tag, key)) = clean.into_iter().next() else {
                return Err(CatalogError::invalid("tag.name", "a tag needs a name"));
            };
            let lacking: Vec<&Question> = questions.iter().filter(|q| !q.tags.iter().any(|t| tag_key(t) == key)).collect();
            let full = lacking.iter().filter(|q| q.tags.len() >= TAGS_PER_QUESTION).count();
            if full > 0 {
                return Err(CatalogError::ScopeRule {
                    rule: "a question has at most 20 tags",
                    detail: format!("{full} {} would have more than 20", if full == 1 { "question" } else { "questions" }),
                });
            }
            for q in &questions {
                if lacking.iter().any(|l| l.id == q.id) {
                    let mut q = q.clone();
                    q.tags.push(tag.clone());
                    store::question_upsert(tx, &q, now_ms)?;
                    report.changed.push(q.id);
                } else {
                    report.unchanged.push(q.id.clone());
                }
            }
        }
        BulkEdit::Untag { tag } => {
            let key = tag_key(tag);
            for q in &questions {
                if q.tags.iter().any(|t| tag_key(t) == key) {
                    let mut q = q.clone();
                    q.tags.retain(|t| tag_key(t) != key);
                    store::question_upsert(tx, &q, now_ms)?;
                    report.changed.push(q.id);
                } else {
                    report.unchanged.push(q.id.clone());
                }
            }
        }
        BulkEdit::SetDifficulty { difficulty } => {
            if let Some(d) = difficulty
                && !(1..=100).contains(d)
            {
                return Err(CatalogError::invalid("bulk.difficulty", "a difficulty is 1 to 100"));
            }
            for q in &questions {
                if q.difficulty == *difficulty {
                    report.unchanged.push(q.id.clone());
                } else {
                    let mut q = q.clone();
                    q.difficulty = *difficulty;
                    store::question_upsert(tx, &q, now_ms)?;
                    report.changed.push(q.id);
                }
            }
        }
        BulkEdit::Group { domain_id, group_id } => {
            let mut domain = store::domain_get(tx, domain_id)?;
            if let Some(group) = group_id
                && !domain.groups.iter().any(|g| &g.id == group)
            {
                return Err(CatalogError::invalid(
                    format!("domain.{domain_id}.group.{group}"),
                    "that group belongs to another domain",
                ));
            }
            for q in &questions {
                match domain.questions.iter_mut().find(|m| m.question_id == q.id) {
                    Some(member) if member.group_id != *group_id => {
                        member.group_id = group_id.clone();
                        report.changed.push(q.id.clone());
                    }
                    _ => report.unchanged.push(q.id.clone()),
                }
            }
            membership(tx, &domain, &mut report, now_ms)?;
        }
        BulkEdit::AddToDomain { domain_id } => {
            let mut domain = store::domain_get(tx, domain_id)?;
            if domain.stamps.shared {
                let local = questions.iter().filter(|q| !q.stamps.shared).count();
                if local > 0 {
                    return Err(CatalogError::ScopeRule {
                        rule: "a shared domain holds only shared questions",
                        detail: format!("domain {}: {local} of the selected questions are this workspace's", domain.name),
                    });
                }
            }
            let mut next = domain.questions.iter().map(|m| m.sort_key + 1).max().unwrap_or(0);
            for q in &questions {
                if domain.questions.iter().any(|m| m.question_id == q.id) {
                    report.unchanged.push(q.id.clone());
                } else {
                    domain.questions.push(DomainMember { question_id: q.id.clone(), sort_key: next, group_id: None });
                    next += 1;
                    report.changed.push(q.id.clone());
                }
            }
            membership(tx, &domain, &mut report, now_ms)?;
        }
        BulkEdit::RemoveFromDomain { domain_id } => {
            let mut domain = store::domain_get(tx, domain_id)?;
            for q in &questions {
                if domain.questions.iter().any(|m| m.question_id == q.id) {
                    report.changed.push(q.id.clone());
                } else {
                    report.unchanged.push(q.id.clone());
                }
            }
            domain.questions.retain(|m| !report.changed.contains(&m.question_id));
            membership(tx, &domain, &mut report, now_ms)?;
        }
    }
    Ok(report)
}

/// The domain written once, its changed questions stamped as updated too (a
/// *recently updated* sort moves them), and the reach counted as the domain's.
fn membership(tx: &Transaction<'_>, domain: &super::model::Domain, report: &mut BulkReport, now_ms: u64) -> CatalogResult<()> {
    report.shared = if domain.stamps.shared { report.changed.len() } else { 0 };
    if report.changed.is_empty() {
        return Ok(());
    }
    store::domain_upsert(tx, domain, now_ms)?;
    store::questions_touch(tx, &report.changed, now_ms)
}

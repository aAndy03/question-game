//! *Duplicate* within a workspace (beta.5) for teams, domains and questions —
//! a games' `recipe_duplicate` already existed.
//!
//! A duplicate is a variant to edit, not a copy to follow: a new id, no
//! family, active whatever its source. A team or domain takes "(copy)" after
//! its name, numbered when that name is taken; a question keeps its text (the
//! editor's twin note says so) and joins its source's domains, at the end, in
//! the same domain group. A domain holds the same questions — members, not
//! copies — and copies of its groups.

use rusqlite::Transaction;

use crate::ids::{DomainId, QuestionId, TeamId};

use super::error::{CatalogError, CatalogKind, CatalogResult};
use super::groups::write_copy_with_groups;
use super::model::{DomainMember, Stamps};
use super::service::{CatalogChange, CatalogService, ChangeOp};
use super::store;
use super::workspace::{fresh_id, same_name};

impl CatalogService {
    /// Duplicate `ids` of one kind in this workspace, in one transaction:
    /// every one or none. Returns the new rows' ids in the order asked, and
    /// every row it wrote (the questions' domains too).
    pub fn catalog_duplicate(
        &self,
        kind: CatalogKind,
        ids: &[String],
        now_ms: u64,
    ) -> CatalogResult<(Vec<String>, Vec<CatalogChange>)> {
        let (made, changes) = {
            let mut conn = self.conn();
            let tx = conn.transaction()?;
            let mut made = Vec::new();
            let mut changes = Vec::new();
            for id in ids {
                let new = duplicate_one(&tx, kind, id, now_ms, &mut changes)?;
                changes.push(CatalogChange {
                    kind,
                    id: new.clone(),
                    op: ChangeOp::Upserted,
                });
                made.push(new);
            }
            tx.commit()?;
            (made, changes)
        };
        self.rebuild_search_index()?;
        Ok((made, changes))
    }
}

fn fresh_stamps(now_ms: u64) -> Stamps {
    Stamps {
        created_at: now_ms,
        updated_at: now_ms,
        archived_at: None,
        family_id: None,
    }
}

/// "Red (copy)", or "Red (copy 2)" when that is taken here.
fn copy_name(tx: &Transaction<'_>, table: &str, name: &str) -> CatalogResult<String> {
    let mut stmt = tx.prepare(&format!(
        "SELECT name FROM {table} WHERE {}",
        store::IN_VIEW
    ))?;
    let taken: Vec<String> = stmt
        .query_map([], |row| row.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    let mut n = 1;
    loop {
        let candidate = if n == 1 {
            format!("{name} (copy)")
        } else {
            format!("{name} (copy {n})")
        };
        if !taken.iter().any(|t| same_name(t, &candidate)) {
            return Ok(candidate);
        }
        n += 1;
    }
}

fn duplicate_one(
    tx: &Transaction<'_>,
    kind: CatalogKind,
    id: &str,
    now_ms: u64,
    changes: &mut Vec<CatalogChange>,
) -> CatalogResult<String> {
    match kind {
        CatalogKind::Team => {
            let mut team = store::team_get(tx, &TeamId::from(id))?;
            team.id = TeamId::new(fresh_id("team"));
            team.name = copy_name(tx, "teams", &team.name)?;
            team.stamps = fresh_stamps(now_ms);
            store::team_upsert(tx, &team, now_ms)?;
            Ok(team.id.to_string())
        }
        CatalogKind::Domain => {
            let original = store::domain_get(tx, &DomainId::from(id))?;
            let mut copy = original.clone();
            copy.id = DomainId::new(fresh_id("dom"));
            copy.name = copy_name(tx, "domains", &original.name)?;
            copy.stamps = fresh_stamps(now_ms);
            copy.groups = Vec::new();
            write_copy_with_groups(tx, &original, &mut copy, now_ms)?;
            Ok(copy.id.to_string())
        }
        CatalogKind::Question => {
            let mut question = store::question_get(tx, &QuestionId::from(id))?;
            let homes = store::domains_holding(tx, id)?;
            question.id = QuestionId::new(fresh_id("q"));
            question.stamps = fresh_stamps(now_ms);
            store::question_upsert(tx, &question, now_ms)?;
            for mut domain in homes {
                let group_id = domain
                    .questions
                    .iter()
                    .find(|m| m.question_id.as_str() == id)
                    .and_then(|m| m.group_id.clone());
                let sort_key = domain
                    .questions
                    .iter()
                    .map(|m| m.sort_key)
                    .max()
                    .unwrap_or(-1)
                    + 1;
                domain.questions.push(DomainMember {
                    question_id: question.id.clone(),
                    sort_key,
                    group_id,
                });
                store::domain_upsert(tx, &domain, now_ms)?;
                changes.push(CatalogChange {
                    kind: CatalogKind::Domain,
                    id: domain.id.to_string(),
                    op: ChangeOp::Upserted,
                });
            }
            Ok(question.id.to_string())
        }
        other => Err(CatalogError::invalid(
            format!("{}.{id}", other.as_str()),
            "only a team, a domain or a question is duplicated here",
        )),
    }
}

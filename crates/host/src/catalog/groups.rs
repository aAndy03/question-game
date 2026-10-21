//! Groups inside a domain and tags on a question (Beta, P15) — for organising
//! only. No board, snapshot or Play reads either; a board still picks per
//! domain and difficulty (§2.31).
//!
//! A group lives where its domain lives and is part of a question's
//! membership there; a tag is part of a question's body, so copies, transfers
//! and propagation carry it. Nothing here suggests a name.

use serde::{Deserialize, Serialize};

use crate::ids::{DomainGroupId, DomainId};

use super::error::{CatalogError, CatalogResult};
use super::model::DomainGroup;
use super::service::CatalogService;
use super::store;
use super::workspace::{clean_name, fresh_id, same_name};

/// The longest tag, in characters.
pub const TAG_MAX: usize = 40;
/// The most tags one question carries; a write past it is refused whole.
pub const TAGS_PER_QUESTION: usize = 20;

/// One tag in view, for the tag picker and *Manage tags*.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub questions: usize,
}

/// The fold a tag is compared by.
pub fn tag_key(tag: &str) -> String {
    tag.trim().to_lowercase()
}

/// A question's tags as stored: `(spelling, key)`, trimmed, one per key, in
/// the order given. An empty tag, one over [`TAG_MAX`], or more than
/// [`TAGS_PER_QUESTION`] refuses the save.
pub(crate) fn clean_tags(tags: &[String], question: &str) -> CatalogResult<Vec<(String, String)>> {
    let mut out: Vec<(String, String)> = Vec::new();
    for tag in tags {
        let tag = tag.trim();
        if tag.is_empty() {
            continue;
        }
        if tag.chars().count() > TAG_MAX {
            return Err(CatalogError::invalid(
                format!("question.{question}.tags"),
                "a tag is at most 40 characters",
            ));
        }
        let key = tag_key(tag);
        if !out.iter().any(|(_, k)| *k == key) {
            out.push((tag.to_owned(), key));
        }
    }
    if out.len() > TAGS_PER_QUESTION {
        return Err(CatalogError::invalid(
            format!("question.{question}.tags"),
            "a question has at most 20 tags",
        ));
    }
    Ok(out)
}

impl CatalogService {
    /// A group in a domain, named by the operator.
    pub fn domain_group_create(&self, domain: &DomainId, name: &str, now_ms: u64) -> CatalogResult<DomainGroup> {
        let conn = self.conn();
        let existing = store::domain_get(&conn, domain)?.groups;
        let name = free_group_name(&existing, name, domain, None)?;
        let group = DomainGroup {
            id: DomainGroupId::new(fresh_id("grp")),
            domain_id: domain.clone(),
            name,
            sort_key: existing.iter().map(|g| g.sort_key + 1).max().unwrap_or(0),
        };
        store::domain_group_put(&conn, &group, now_ms)?;
        store::domain_touch(&conn, domain, now_ms)?;
        Ok(group)
    }

    /// Returns the group's domain — the stored one, never the caller's word for it.
    pub fn domain_group_rename(&self, group: &DomainGroupId, name: &str, now_ms: u64) -> CatalogResult<DomainId> {
        let conn = self.conn();
        let mut row = group_in_view(&conn, group)?;
        let siblings = store::domain_get(&conn, &row.domain_id)?.groups;
        row.name = free_group_name(&siblings, name, &row.domain_id, Some(group))?;
        store::domain_group_put(&conn, &row, now_ms)?;
        store::domain_touch(&conn, &row.domain_id, now_ms)?;
        Ok(row.domain_id)
    }

    /// The domain's groups in this order; one not named keeps its place after them.
    pub fn domain_group_reorder(&self, domain: &DomainId, order: &[DomainGroupId], now_ms: u64) -> CatalogResult<()> {
        let mut conn = self.conn();
        let groups = store::domain_get(&conn, domain)?.groups;
        let tx = conn.transaction()?;
        let mut key = 0;
        for id in order {
            let Some(group) = groups.iter().find(|g| &g.id == id) else {
                return Err(CatalogError::invalid(format!("domain.{domain}.group.{id}"), "no such group in this domain"));
            };
            store::domain_group_put(&tx, &DomainGroup { sort_key: key, ..group.clone() }, now_ms)?;
            key += 1;
        }
        for group in groups.iter().filter(|g| !order.contains(&g.id)) {
            store::domain_group_put(&tx, &DomainGroup { sort_key: key, ..group.clone() }, now_ms)?;
            key += 1;
        }
        store::domain_touch(&tx, domain, now_ms)?;
        tx.commit()?;
        Ok(())
    }

    /// The group goes; its questions stay in the domain, in no group.
    /// Returns the group's domain, as rename does.
    pub fn domain_group_delete(&self, group: &DomainGroupId, now_ms: u64) -> CatalogResult<DomainId> {
        let conn = self.conn();
        let row = group_in_view(&conn, group)?;
        store::domain_group_delete(&conn, group)?;
        store::domain_touch(&conn, &row.domain_id, now_ms)?;
        Ok(row.domain_id)
    }

    /// Every tag in this workspace, with counts.
    pub fn tag_list(&self) -> CatalogResult<Vec<TagCount>> {
        store::tag_counts(&self.conn())
    }
}

/// A group whose domain is in view; any other is not this workspace's.
fn group_in_view(conn: &rusqlite::Connection, id: &DomainGroupId) -> CatalogResult<DomainGroup> {
    let missing = || CatalogError::invalid(format!("domain-group/{id}"), "no such group");
    let group = store::domain_group_get(conn, id)?.ok_or_else(missing)?;
    store::domain_get(conn, &group.domain_id).map_err(|_| missing())?;
    Ok(group)
}

fn free_group_name(
    siblings: &[DomainGroup],
    name: &str,
    domain: &DomainId,
    except: Option<&DomainGroupId>,
) -> CatalogResult<String> {
    let path = format!("domain.{domain}.group.name");
    let name = clean_name(name, &path)?;
    if siblings.iter().any(|g| Some(&g.id) != except && same_name(&g.name, &name)) {
        return Err(CatalogError::invalid(path, "another group in this domain has this name"));
    }
    Ok(name)
}

/// Write `copy` — a new domain row copied from `original` — with groups of its
/// own: each of the original's groups gets a new id under the copy, and each
/// member's group follows to its counterpart. The copy is written first
/// without groups (a group needs its domain), then again with them.
pub(crate) fn write_copy_with_groups(
    tx: &rusqlite::Transaction<'_>,
    original: &super::model::Domain,
    copy: &mut super::model::Domain,
    now_ms: u64,
) -> CatalogResult<()> {
    let wanted: Vec<Option<DomainGroupId>> = copy.questions.iter().map(|m| m.group_id.clone()).collect();
    for member in &mut copy.questions {
        member.group_id = None;
    }
    store::domain_upsert(tx, copy, now_ms)?;
    if original.groups.is_empty() {
        return Ok(());
    }
    let mut ids: std::collections::BTreeMap<DomainGroupId, DomainGroupId> = std::collections::BTreeMap::new();
    for group in &original.groups {
        let new = DomainGroup {
            id: DomainGroupId::new(fresh_id("grp")),
            domain_id: copy.id.clone(),
            name: group.name.clone(),
            sort_key: group.sort_key,
        };
        store::domain_group_put(tx, &new, now_ms)?;
        ids.insert(group.id.clone(), new.id);
    }
    for (member, group) in copy.questions.iter_mut().zip(wanted) {
        member.group_id = group.and_then(|g| ids.get(&g).cloned());
    }
    store::domain_upsert(tx, copy, now_ms)
}

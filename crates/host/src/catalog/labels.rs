//! Game folders and game tags (P20): how a library of shows is organised.
//! Neither is part of the show — Load, the snapshot and Stage never read them
//! — so they stay editable while a game plays.
//!
//! The model has had them since P7 and the Games list filters and groups by
//! them; this is their editor's write: [`CatalogService::recipe_bulk_edit`],
//! one transaction over a selection, refused whole, previewed by rolling the
//! same write back — the question bulk edit's rules (`bulk.rs`). A rename is
//! two edits in one call (untag, tag), so a game that had both keeps one.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::ids::RecipeId;

use super::error::{CatalogError, CatalogResult};
use super::groups::{TAG_MAX, tag_key};
use super::model::{ArchiveScope, Recipe};
use super::service::CatalogService;
use super::store;

/// A folder name's longest spelling, in characters.
pub const FOLDER_MAX: usize = 60;
/// A game's most game tags.
pub const TAGS_PER_GAME: usize = 20;

/// One change to the labels of every selected game.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum RecipeEdit {
    /// `None` takes the game out of its folder.
    SetFolder { folder: Option<String> },
    Tag { tag: String },
    Untag { tag: String },
}

/// What a label edit did — or, previewed, would do.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LabelReport {
    pub changed: Vec<RecipeId>,
    /// Selected, and already as asked.
    pub unchanged: Vec<RecipeId>,
}

/// A folder as stored: trimmed, not empty, at most [`FOLDER_MAX`].
fn clean_folder(folder: &str, at: &str) -> CatalogResult<String> {
    let folder = folder.trim();
    if folder.is_empty() {
        return Err(CatalogError::invalid(format!("{at}.folder"), "a folder needs a name"));
    }
    if folder.chars().count() > FOLDER_MAX {
        return Err(CatalogError::invalid(format!("{at}.folder"), "a folder name is at most 60 characters"));
    }
    Ok(folder.to_owned())
}

/// A game tag as written: trimmed, not empty, at most [`TAG_MAX`].
fn clean_tag(tag: &str, at: &str) -> CatalogResult<String> {
    let tag = tag.trim();
    if tag.is_empty() {
        return Err(CatalogError::invalid(format!("{at}.tags"), "a game tag needs a name"));
    }
    if tag.chars().count() > TAG_MAX {
        return Err(CatalogError::invalid(format!("{at}.tags"), "a game tag is at most 40 characters"));
    }
    Ok(tag.to_owned())
}

/// A recipe's labels are legal: what `recipe_upsert` checks too, so no write
/// stores a folder or a tag list the editor could not have made.
pub(crate) fn check(recipe: &Recipe) -> CatalogResult<()> {
    let at = format!("recipe.{}", recipe.id);
    if let Some(folder) = &recipe.folder {
        clean_folder(folder, &at)?;
    }
    let mut keys = BTreeSet::new();
    for tag in &recipe.tags {
        clean_tag(tag, &at)?;
        if !keys.insert(tag_key(tag)) {
            return Err(CatalogError::invalid(format!("{at}.tags"), "a game carries a game tag once"));
        }
    }
    if recipe.tags.len() > TAGS_PER_GAME {
        return Err(CatalogError::invalid(format!("{at}.tags"), "a game has at most 20 game tags"));
    }
    Ok(())
}

impl CatalogService {
    /// Apply `edits`, in order, to every game in `ids`; `write: false` is the
    /// preview. A tag already used by a game of this workspace is written as
    /// it is spelled there. Each changed game takes one `rev`, like any
    /// recipe write.
    pub fn recipe_bulk_edit(
        &self,
        ids: &[RecipeId],
        edits: &[RecipeEdit],
        write: bool,
        now_ms: u64,
    ) -> CatalogResult<LabelReport> {
        let mut seen = BTreeSet::new();
        let ids: Vec<RecipeId> = ids.iter().filter(|id| seen.insert((*id).clone())).cloned().collect();
        if ids.is_empty() {
            return Err(CatalogError::invalid("recipes", "nothing is selected"));
        }
        let edits: Vec<RecipeEdit> = edits
            .iter()
            .map(|edit| {
                Ok(match edit {
                    RecipeEdit::SetFolder { folder: Some(f) } => RecipeEdit::SetFolder { folder: Some(clean_folder(f, "recipes")?) },
                    RecipeEdit::SetFolder { folder: None } => RecipeEdit::SetFolder { folder: None },
                    RecipeEdit::Tag { tag } => RecipeEdit::Tag { tag: clean_tag(tag, "recipes")? },
                    RecipeEdit::Untag { tag } => RecipeEdit::Untag { tag: tag.trim().to_owned() },
                })
            })
            .collect::<CatalogResult<_>>()?;

        let mut conn = self.conn();
        // The spelling in view: a tag another game already carries is written as it is spelled there.
        let in_view: Vec<String> = store::recipe_list(&conn, ArchiveScope::All)?
            .into_iter()
            .flat_map(|r| r.tags)
            .collect();
        let spelled = |tag: &str| in_view.iter().find(|t| tag_key(t) == tag_key(tag)).cloned().unwrap_or_else(|| tag.to_owned());

        let tx = conn.transaction()?;
        let mut report = LabelReport::default();
        let mut written = Vec::new();
        for id in &ids {
            let mut recipe = store::recipe_get(&tx, id)?;
            let before = (recipe.folder.clone(), recipe.tags.clone());
            for edit in &edits {
                match edit {
                    RecipeEdit::SetFolder { folder } => recipe.folder = folder.clone(),
                    RecipeEdit::Tag { tag } => {
                        if !recipe.tags.iter().any(|t| tag_key(t) == tag_key(tag)) {
                            recipe.tags.push(spelled(tag));
                        }
                    }
                    RecipeEdit::Untag { tag } => recipe.tags.retain(|t| tag_key(t) != tag_key(tag)),
                }
            }
            if (recipe.folder.clone(), recipe.tags.clone()) == before {
                report.unchanged.push(id.clone());
                continue;
            }
            check(&recipe)?;
            store::recipe_upsert(&tx, &recipe, now_ms)?;
            report.changed.push(id.clone());
            written.push(recipe);
        }
        if !write {
            // Dropped, the transaction rolls back: the preview is the write, undone.
            return Ok(report);
        }
        tx.commit()?;
        drop(conn);
        // A folder and its tags are what Games search finds a show by.
        if !written.is_empty() {
            self.rebuild_search_index()?;
        }
        Ok(report)
    }
}

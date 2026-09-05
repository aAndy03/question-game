//! `catalog_search` — Tantivy, kept inside `CatalogService`.
//!
//! There is deliberately **no `SearchService`**. One adapter exists and no
//! second is planned (§2.13), so a port here would be indirection rather than a
//! seam (`01_codebase-design-spec-v1.md`). Search is a verb on the catalog for
//! the same reason `catalog_list` is.
//!
//! Two decisions worth knowing before changing anything here:
//!
//! - **The index lives in RAM and is rebuilt at open** from the catalog. A v1
//!   library is thousands of rows, not millions; rebuilding costs milliseconds
//!   and removes the whole class of "the index disagrees with the database"
//!   bugs that an on-disk index has to defend against. The moment indexing
//!   moves off-thread, WAL is what lets the indexer open its own read-only
//!   connection — which is why that lane was reserved.
//! - **Commits are lazy.** A write marks the index dirty; the next search
//!   commits and reloads. Bulk edits (§2.19) therefore pay for one commit, not
//!   one per row, and a search always sees every write that preceded it.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tantivy::collector::TopDocs;
use tantivy::query::{AllQuery, BooleanQuery, Occur, Query, RegexQuery, TermQuery};
use tantivy::schema::{Field, IndexRecordOption, STORED, STRING, Schema, TEXT, Value};
use tantivy::{Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument, Term, doc};

use super::error::{CatalogKind, CatalogResult};
use super::model::ArchiveScope;

/// One result. The score is Tantivy's, exposed so a caller can show relevance
/// order without re-ranking; the row itself comes from `catalog_get`, because
/// the index is not a second copy of the library.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub kind: CatalogKind,
    pub id: String,
    pub score: f32,
}

/// What to search for. Search *filters the current list* (§12), so the kinds
/// and the archive scope are part of the query rather than a global mode.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub text: String,
    /// Empty means every kind.
    pub kinds: Vec<CatalogKind>,
    pub scope: ArchiveScope,
    pub limit: usize,
}

impl SearchQuery {
    pub fn new(text: impl Into<String>) -> Self {
        SearchQuery {
            text: text.into(),
            kinds: Vec::new(),
            scope: ArchiveScope::Active,
            limit: 50,
        }
    }

    pub fn kinds(mut self, kinds: Vec<CatalogKind>) -> Self {
        self.kinds = kinds;
        self
    }

    pub fn scope(mut self, scope: ArchiveScope) -> Self {
        self.scope = scope;
        self
    }

    pub fn limit(mut self, limit: usize) -> Self {
        self.limit = limit;
        self
    }
}

struct Fields {
    key: Field,
    kind: Field,
    id: Field,
    archived: Field,
    text: Field,
}

pub(super) struct SearchIndex {
    index: Index,
    writer: Mutex<IndexWriter>,
    reader: IndexReader,
    fields: Fields,
    /// Set by every write, cleared by the commit the next search runs.
    dirty: AtomicBool,
}

impl SearchIndex {
    pub(super) fn open() -> CatalogResult<Self> {
        let mut builder = Schema::builder();
        let fields = Fields {
            // `kind:id`, so one delete removes exactly one row's document.
            key: builder.add_text_field("key", STRING),
            kind: builder.add_text_field("kind", STRING | STORED),
            id: builder.add_text_field("id", STRING | STORED),
            archived: builder.add_text_field("archived", STRING),
            // Not stored: a hit points at a row, it does not carry one.
            text: builder.add_text_field("text", TEXT),
        };
        let index = Index::create_in_ram(builder.build());
        // One indexing thread: writes are human-paced, and a deterministic
        // single writer is what makes a test's search see its own edits.
        let writer = index.writer_with_num_threads(1, 15_000_000)?;
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()?;
        Ok(SearchIndex {
            index,
            writer: Mutex::new(writer),
            reader,
            fields,
            dirty: AtomicBool::new(false),
        })
    }

    fn writer(&self) -> std::sync::MutexGuard<'_, IndexWriter> {
        self.writer
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn key(kind: CatalogKind, id: &str) -> String {
        format!("{}:{id}", kind.as_str())
    }

    /// Replace one row's document. Called after every write, including archive
    /// and restore — `archived` is a filter field, so it has to be reindexed.
    pub(super) fn put(
        &self,
        kind: CatalogKind,
        id: &str,
        archived: bool,
        text: &str,
    ) -> CatalogResult<()> {
        let writer = self.writer();
        let key = SearchIndex::key(kind, id);
        writer.delete_term(Term::from_field_text(self.fields.key, &key));
        writer.add_document(doc!(
            self.fields.key => key,
            self.fields.kind => kind.as_str(),
            self.fields.id => id,
            self.fields.archived => if archived { "yes" } else { "no" },
            self.fields.text => text,
        ))?;
        self.dirty.store(true, Ordering::Release);
        Ok(())
    }

    /// Throw the index away and start again — what a rebuild from the catalog
    /// begins with.
    pub(super) fn clear(&self) -> CatalogResult<()> {
        let writer = self.writer();
        writer.delete_all_documents()?;
        self.dirty.store(true, Ordering::Release);
        Ok(())
    }

    fn flush(&self) -> CatalogResult<()> {
        if !self.dirty.swap(false, Ordering::AcqRel) {
            return Ok(());
        }
        self.writer().commit()?;
        self.reader.reload()?;
        Ok(())
    }

    pub(super) fn search(&self, query: &SearchQuery) -> CatalogResult<Vec<SearchHit>> {
        self.flush()?;
        let searcher = self.reader.searcher();
        let built = self.build(query);
        let hits = searcher.search(
            &built,
            &TopDocs::with_limit(query.limit.max(1)).order_by_score(),
        )?;

        let mut out = Vec::with_capacity(hits.len());
        for (score, address) in hits {
            let document: TantivyDocument = searcher.doc(address)?;
            let kind = document
                .get_first(self.fields.kind)
                .and_then(|value| value.as_str())
                .and_then(|value| CatalogKind::ALL.into_iter().find(|k| k.as_str() == value));
            let id = document
                .get_first(self.fields.id)
                .and_then(|value| value.as_str())
                .map(str::to_owned);
            if let (Some(kind), Some(id)) = (kind, id) {
                out.push(SearchHit { kind, id, score });
            }
        }
        Ok(out)
    }

    /// Every term must match somewhere; within a term, an exact hit or a
    /// prefix hit will do.
    ///
    /// The prefix half is what makes the Studio search box usable — an operator
    /// typing `sci` expects `Science` — and it is here rather than in the UI
    /// because `FlagService`-style "one owner" applies to search too: the
    /// frontend debounces, it does not compose queries.
    fn build(&self, query: &SearchQuery) -> Box<dyn Query> {
        let mut clauses: Vec<(Occur, Box<dyn Query>)> = Vec::new();

        for raw in query.text.split_whitespace() {
            let term: String = raw
                .chars()
                .filter(|c| c.is_alphanumeric())
                .flat_map(char::to_lowercase)
                .collect();
            if term.is_empty() {
                continue;
            }
            let mut alternatives: Vec<(Occur, Box<dyn Query>)> = vec![(
                Occur::Should,
                Box::new(TermQuery::new(
                    Term::from_field_text(self.fields.text, &term),
                    IndexRecordOption::WithFreqs,
                )),
            )];
            // The term is alphanumeric and lowercased by now, so it needs no
            // regex escaping.
            if let Ok(prefix) = RegexQuery::from_pattern(&format!("{term}.*"), self.fields.text) {
                alternatives.push((Occur::Should, Box::new(prefix)));
            }
            clauses.push((Occur::Must, Box::new(BooleanQuery::new(alternatives))));
        }

        if !query.kinds.is_empty() {
            let kinds: Vec<(Occur, Box<dyn Query>)> = query
                .kinds
                .iter()
                .map(|kind| {
                    let term = Term::from_field_text(self.fields.kind, kind.as_str());
                    let query: Box<dyn Query> =
                        Box::new(TermQuery::new(term, IndexRecordOption::Basic));
                    (Occur::Should, query)
                })
                .collect();
            clauses.push((Occur::Must, Box::new(BooleanQuery::new(kinds))));
        }

        match query.scope {
            ArchiveScope::All => {}
            ArchiveScope::Active | ArchiveScope::Archived => {
                let wanted = if query.scope == ArchiveScope::Archived {
                    "yes"
                } else {
                    "no"
                };
                clauses.push((
                    Occur::Must,
                    Box::new(TermQuery::new(
                        Term::from_field_text(self.fields.archived, wanted),
                        IndexRecordOption::Basic,
                    )),
                ));
            }
        }

        if clauses.is_empty() {
            // An empty search box is not a search for nothing — it is the list.
            return Box::new(AllQuery);
        }
        Box::new(BooleanQuery::new(clauses))
    }
}

impl std::fmt::Debug for SearchIndex {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SearchIndex")
            .field("schema", &self.index.schema())
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn indexed() -> SearchIndex {
        let index = SearchIndex::open().unwrap();
        index
            .put(CatalogKind::Domain, "dom-1", false, "Science SCI_204")
            .unwrap();
        index
            .put(CatalogKind::Question, "q-1", false, "Which planet is red?")
            .unwrap();
        index
            .put(CatalogKind::Question, "q-2", true, "An archived question")
            .unwrap();
        index
    }

    #[test]
    fn a_prefix_finds_the_word_an_operator_is_halfway_through_typing() {
        let index = indexed();
        let hits = index.search(&SearchQuery::new("sci")).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "dom-1");
    }

    #[test]
    fn every_term_has_to_match_somewhere() {
        let index = indexed();
        assert_eq!(
            index.search(&SearchQuery::new("planet red")).unwrap().len(),
            1
        );
        assert!(
            index
                .search(&SearchQuery::new("planet banana"))
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn the_scope_and_the_kind_filter_the_same_query() {
        let index = indexed();
        assert!(
            index
                .search(&SearchQuery::new("archived"))
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            index
                .search(&SearchQuery::new("archived").scope(ArchiveScope::Archived))
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            index
                .search(
                    &SearchQuery::new("")
                        .scope(ArchiveScope::All)
                        .kinds(vec![CatalogKind::Domain])
                )
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn an_empty_query_is_the_list_not_a_search_for_nothing() {
        let index = indexed();
        let hits = index
            .search(&SearchQuery::new("   ").scope(ArchiveScope::All))
            .unwrap();
        assert_eq!(hits.len(), 3);
    }

    #[test]
    fn reindexing_a_row_replaces_it_rather_than_duplicating_it() {
        let index = indexed();
        index
            .put(CatalogKind::Question, "q-1", false, "Which planet is blue?")
            .unwrap();
        assert_eq!(index.search(&SearchQuery::new("blue")).unwrap().len(), 1);
        assert!(index.search(&SearchQuery::new("red")).unwrap().is_empty());
    }
}

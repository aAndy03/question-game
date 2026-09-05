//! Notices (§14).
//!
//! One frontend family, one host shape: `{ code, severity, target_path,
//! actions[] }`. **Studio owns the presentation and the copy** — the host emits
//! action *ids*, never labels, and never a sentence. Anything the operator has
//! to read that is not a constant goes in [`Notice::detail`], where Studio
//! interpolates it into its own string.
//!
//! §14 caps a notice at **2, max 3** solve actions; dismiss is not one of them
//! (dismiss always exists, and it means "continue, state unchanged"). A notice
//! that only reports something carries zero.
//!
//! P6 raises exactly the monitor notices ([`crate::monitor`]). P10 owns the
//! rest of the family; the shape is here so it is one shape.

use std::collections::BTreeMap;

use serde::Serialize;

/// §14. `Block` is the one that must be faced now — everything else may sit in
/// the collector.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Info,
    Warn,
    Error,
    Block,
}

/// §14: "A notice carries 2, max 3 solve actions."
pub const MAX_ACTIONS: usize = 3;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    /// Stable id. Studio keys its copy off this, so it never changes meaning.
    pub code: &'static str,
    pub severity: Severity,
    /// The row or settings key the operator has to look at, if there is one.
    pub target_path: Option<String>,
    /// Solve-action ids, in the order Studio should offer them. The first is
    /// the recommended one.
    pub actions: Vec<&'static str>,
    /// Values Studio interpolates into its own copy — a monitor name, a count.
    /// Never a sentence: the host does not write UI strings.
    pub detail: BTreeMap<&'static str, String>,
}

impl Notice {
    /// Panics in debug on more than [`MAX_ACTIONS`], because a notice with four
    /// buttons is a design bug and §14 is the design.
    pub fn new(code: &'static str, severity: Severity, actions: &[&'static str]) -> Self {
        debug_assert!(
            actions.len() <= MAX_ACTIONS,
            "{code}: {} actions, §14 allows {MAX_ACTIONS}",
            actions.len(),
        );
        Notice {
            code,
            severity,
            target_path: None,
            actions: actions.to_vec(),
            detail: BTreeMap::new(),
        }
    }

    pub fn at(mut self, target_path: impl Into<String>) -> Self {
        self.target_path = Some(target_path.into());
        self
    }

    pub fn with(mut self, key: &'static str, value: impl Into<String>) -> Self {
        self.detail.insert(key, value.into());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_notice_carries_the_ids_and_none_of_the_copy() {
        let notice = Notice::new("stage.monitor_lost", Severity::Warn, &["pick_monitor"])
            .at("stage.monitor_id")
            .with("monitor", "BenQ EL2870U");

        let json = serde_json::to_value(&notice).expect("serializes");
        assert_eq!(json["code"], "stage.monitor_lost");
        assert_eq!(json["severity"], "warn");
        assert_eq!(json["targetPath"], "stage.monitor_id");
        assert_eq!(json["actions"][0], "pick_monitor");
        assert_eq!(json["detail"]["monitor"], "BenQ EL2870U");
    }

    #[test]
    #[should_panic(expected = "§14 allows 3")]
    fn four_solve_actions_is_a_design_bug() {
        Notice::new("x", Severity::Info, &["a", "b", "c", "d"]);
    }
}

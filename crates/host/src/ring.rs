//! The turn ring — who holds the token, and who may receive it next.
//!
//! **The round invariant (§5.4), for any team count `n` including `n = 1`:**
//!
//! ```text
//! max(turns) - min(turns) <= 1   over the active teams
//! ```
//!
//! A team receives its `r+1`-th token only once every active team has received
//! `r`. With `round_index = r`, the legal targets of `give_token` are the
//! active teams whose `turns == r - 1` — the ones not yet served this round,
//! never the team currently holding the token. The ring **completes the round
//! rather than skipping a team** to satisfy an override; no command can jump
//! one team ahead of another.
//!
//! The four-team arrays in the docs are illustrations. This module implements
//! the invariant, and `proptest` checks it over 1..=12 teams.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::error::{MatchError, MatchResult};
use crate::ids::TeamId;

/// Ring truth: the sequence, the token, the round, and every team's tally.
///
/// `turns` and `active` live here rather than on the team rows because they are
/// Play facts, not roster facts — the snapshot's team bodies never change
/// during a Play (§4.3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ring {
    /// Playing sequence: recipe order with any operator reordering applied.
    order: Vec<TeamId>,
    /// `None` between a token-ending resolve and the next `give_token`.
    current: Option<TeamId>,
    /// 1-based. Every active team receives exactly one token per round.
    round_index: u32,
    turns: BTreeMap<TeamId, u32>,
    active: BTreeSet<TeamId>,
}

impl Ring {
    /// The ring a `loaded` Play has: the sequence is known, nobody holds the
    /// token yet. `play_start` calls [`Ring::start`].
    pub fn idle(order: Vec<TeamId>) -> Self {
        let turns: BTreeMap<TeamId, u32> = order.iter().map(|id| (id.clone(), 0)).collect();
        let active: BTreeSet<TeamId> = order.iter().cloned().collect();
        Ring {
            order,
            current: None,
            round_index: 1,
            turns,
            active,
        }
    }

    /// Round 1 opens with the first team holding the token (§4.3 step 8), so its
    /// tally starts at 1 and it is not a legal target of the next `give_token`.
    pub fn start(&mut self) {
        if let Some(first) = self.order.first().cloned() {
            self.take_token(first);
        }
    }

    /// An idle ring with the first token already handed out — `idle` + `start`.
    pub fn open(order: Vec<TeamId>) -> Self {
        let mut ring = Ring::idle(order);
        ring.start();
        ring
    }

    pub fn order(&self) -> &[TeamId] {
        &self.order
    }

    pub fn current(&self) -> Option<&TeamId> {
        self.current.as_ref()
    }

    pub fn round_index(&self) -> u32 {
        self.round_index
    }

    pub fn turns(&self, team: &TeamId) -> u32 {
        self.turns.get(team).copied().unwrap_or(0)
    }

    pub fn is_active(&self, team: &TeamId) -> bool {
        self.active.contains(team)
    }

    pub fn active_teams(&self) -> impl Iterator<Item = &TeamId> {
        self.order.iter().filter(|id| self.active.contains(*id))
    }

    /// The active teams that have not yet been served this round, in ring
    /// order, minus whoever holds the token.
    pub fn legal_targets(&self) -> Vec<TeamId> {
        let owed = self.round_index.saturating_sub(1);
        self.order
            .iter()
            .filter(|id| self.active.contains(*id))
            .filter(|id| self.turns(id) == owed)
            .filter(|id| Some(*id) != self.current.as_ref())
            .cloned()
            .collect()
    }

    /// What the Action Panel arms by default: the next legal target after the
    /// current team in ring order, wrapping. The operator may still pick any
    /// other legal target — this is a default, not a rule.
    pub fn default_next(&self) -> Option<TeamId> {
        let legal = self.legal_targets();
        if legal.is_empty() {
            return None;
        }
        let from = self
            .current
            .as_ref()
            .and_then(|id| self.order.iter().position(|o| o == id))
            .map(|i| i + 1)
            .unwrap_or(0);
        let len = self.order.len();
        (0..len)
            .map(|step| self.order[(from + step) % len].clone())
            .find(|id| legal.contains(id))
    }

    pub fn is_legal_target(&self, team: &TeamId) -> bool {
        self.legal_targets().contains(team)
    }

    /// Hand the token to `target`. Rejects a target that would break the round
    /// invariant, and rejects the current holder (no consecutive self-override).
    pub fn give_token(&mut self, target: &TeamId) -> MatchResult<()> {
        if !self.turns.contains_key(target) {
            return Err(MatchError::UnknownTeam(target.clone()));
        }
        if !self.is_legal_target(target) {
            return Err(MatchError::IllegalTokenTarget {
                target: target.clone(),
                legal: self.legal_targets(),
            });
        }
        self.take_token(target.clone());
        Ok(())
    }

    /// The token ends without moving — a wrong answer, or a cap. The round does
    /// not advance; the next `give_token` still owes the same teams.
    pub fn end_token(&mut self) {
        self.current = None;
    }

    /// True once every active team has been served in the current round.
    pub fn round_complete(&self) -> bool {
        self.active_teams()
            .all(|id| self.turns(id) >= self.round_index)
    }

    fn take_token(&mut self, target: TeamId) {
        *self.turns.entry(target.clone()).or_insert(0) += 1;
        self.current = Some(target);
        // The round rolls over the moment the last owed team is served, so
        // `legal_targets` is never empty while a team is still owed a token.
        if self.round_complete() {
            self.round_index += 1;
        }
    }

    /// Reorder the **future** ring only (§5.4). Teams already served this round,
    /// and the token holder, keep their positions; the rest may be permuted
    /// freely. The set of teams may not change.
    pub fn reorder(&mut self, next: Vec<TeamId>) -> MatchResult<()> {
        let before: BTreeSet<&TeamId> = self.order.iter().collect();
        let after: BTreeSet<&TeamId> = next.iter().collect();
        if next.len() != self.order.len() || before != after {
            return Err(MatchError::IllegalReorder(
                "a reorder must list every team exactly once",
            ));
        }
        for (index, team) in self.order.iter().enumerate() {
            if self.is_frozen_in_place(team) && next[index] != *team {
                return Err(MatchError::IllegalReorder(
                    "only teams that have not played this round may be reordered",
                ));
            }
        }
        self.order = next;
        Ok(())
    }

    /// A team that has already been served this round — or holds the token — is
    /// history, and history does not move. Nor does an inactive team.
    fn is_frozen_in_place(&self, team: &TeamId) -> bool {
        Some(team) == self.current.as_ref()
            || !self.active.contains(team)
            || self.turns(team) >= self.round_index
    }

    /// The invariant itself, so tests and the Viewer assert the same predicate
    /// rather than two lookalikes.
    pub fn invariant_holds(&self) -> bool {
        let turns: Vec<u32> = self.active_teams().map(|id| self.turns(id)).collect();
        match (turns.iter().max(), turns.iter().min()) {
            (Some(max), Some(min)) => max - min <= 1,
            _ => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(i: usize) -> TeamId {
        TeamId::new(format!("t{i}"))
    }

    fn ring(n: usize) -> Ring {
        Ring::open((0..n).map(t).collect())
    }

    #[test]
    fn opens_with_the_first_team_holding_the_token() {
        let r = ring(4);
        assert_eq!(r.current(), Some(&t(0)));
        assert_eq!(r.turns(&t(0)), 1);
        assert_eq!(r.round_index(), 1);
        assert_eq!(r.legal_targets(), vec![t(1), t(2), t(3)]);
    }

    #[test]
    fn a_team_cannot_take_a_second_token_before_the_round_completes() {
        let mut r = ring(4);
        r.give_token(&t(1)).unwrap();
        // turns [1,1,0,0] — t0 wants a second token, the round says no.
        let err = r.give_token(&t(0)).unwrap_err();
        assert!(matches!(err, MatchError::IllegalTokenTarget { .. }));
        assert_eq!(r.legal_targets(), vec![t(2), t(3)]);
    }

    #[test]
    fn the_round_rolls_over_only_when_every_team_has_played() {
        let mut r = ring(4);
        for i in 1..4 {
            assert_eq!(r.round_index(), 1);
            r.give_token(&t(i)).unwrap();
        }
        assert_eq!(r.round_index(), 2);
        assert_eq!(r.legal_targets(), vec![t(0), t(1), t(2)]);
    }

    #[test]
    fn the_token_holder_is_never_a_legal_target() {
        let mut r = ring(2);
        r.give_token(&t(1)).unwrap();
        assert_eq!(r.legal_targets(), vec![t(0)]);
        assert!(r.give_token(&t(1)).is_err());
    }

    #[test]
    fn a_solo_rehearsal_play_hands_the_token_back_each_round() {
        let mut r = ring(1);
        assert_eq!(r.round_index(), 2, "one team completes round 1 immediately");
        r.end_token();
        assert_eq!(r.legal_targets(), vec![t(0)]);
        r.give_token(&t(0)).unwrap();
        assert_eq!(r.turns(&t(0)), 2);
        assert!(r.invariant_holds());
    }

    #[test]
    fn default_next_walks_the_ring_from_the_current_team() {
        let mut r = ring(4);
        assert_eq!(r.default_next(), Some(t(1)));
        r.give_token(&t(2)).unwrap();
        assert_eq!(r.default_next(), Some(t(3)));
        r.give_token(&t(3)).unwrap();
        assert_eq!(r.default_next(), Some(t(1)));
    }

    #[test]
    fn reorder_refuses_to_move_a_team_that_already_played_this_round() {
        let mut r = ring(4);
        r.give_token(&t(1)).unwrap();
        // t0 is history and t1 holds the token; t2 and t3 may swap.
        r.reorder(vec![t(0), t(1), t(3), t(2)]).unwrap();
        assert_eq!(r.order(), &[t(0), t(1), t(3), t(2)]);

        let err = r.reorder(vec![t(1), t(0), t(3), t(2)]).unwrap_err();
        assert!(matches!(err, MatchError::IllegalReorder(_)));
    }

    #[test]
    fn reorder_refuses_a_different_roster() {
        let mut r = ring(3);
        assert!(r.reorder(vec![t(0), t(1)]).is_err());
        assert!(r.reorder(vec![t(0), t(1), t(1)]).is_err());
    }
}

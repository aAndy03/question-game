//! P4 exit criterion 1, at the ring level: for team counts 1–12 and random
//! command sequences, `max(turns) − min(turns) ≤ 1` always holds and no team is
//! overridden into consecutive turns.
//!
//! The service-level version of the same property (random *legal* sequences of
//! real commands, including resolves) lives in `tests/match_service.rs`. This
//! one hammers the ring directly, including illegal input, because that is
//! where the invariant is implemented.

use proptest::prelude::*;
use questiongame_host::{MatchError, Ring, TeamId};

fn team(i: usize) -> TeamId {
    TeamId::new(format!("t{i}"))
}

fn ring_of(n: usize) -> Ring {
    Ring::open((0..n).map(team).collect())
}

/// What an operator can do to the ring between resolves.
#[derive(Debug, Clone)]
enum Move {
    /// A token-ending resolve: wrong answer, or the cap.
    EndToken,
    /// `give_token`, aimed at *any* team — legal or not.
    Give(usize),
}

fn moves(n: usize) -> impl Strategy<Value = Vec<Move>> {
    proptest::collection::vec(
        prop_oneof![
            1 => Just(Move::EndToken),
            4 => (0..n).prop_map(Move::Give),
        ],
        0..60,
    )
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(300))]

    #[test]
    fn the_round_invariant_survives_any_sequence(
        n in 1usize..=12,
        script in (1usize..=12).prop_flat_map(moves),
    ) {
        let mut ring = ring_of(n);
        // Which teams have been served in the round that is currently open.
        let mut round = ring.round_index();
        let mut served_this_round: Vec<TeamId> = ring
            .active_teams()
            .filter(|id| ring.turns(id) >= round)
            .cloned()
            .collect();

        prop_assert!(ring.invariant_holds());

        for step in script {
            match step {
                Move::EndToken => ring.end_token(),
                Move::Give(index) => {
                    let target = team(index % n);
                    let before = ring.clone();
                    let legal = ring.legal_targets();

                    match ring.give_token(&target) {
                        Ok(()) => {
                            prop_assert!(
                                legal.contains(&target),
                                "accepted a target it had not listed as legal",
                            );
                            prop_assert_eq!(
                                ring.current(),
                                Some(&target),
                                "give_token must move the token",
                            );
                            prop_assert!(
                                !served_this_round.contains(&target),
                                "{:?} received two tokens in round {}",
                                target,
                                round,
                            );
                            served_this_round.push(target.clone());
                        }
                        Err(MatchError::IllegalTokenTarget { .. }) => {
                            prop_assert!(!legal.contains(&target));
                            prop_assert_eq!(
                                &ring,
                                &before,
                                "a refused give_token must leave the ring untouched",
                            );
                        }
                        Err(other) => prop_assert!(false, "unexpected error {:?}", other),
                    }
                }
            }

            prop_assert!(
                ring.invariant_holds(),
                "max(turns) - min(turns) > 1 after {:?}",
                ring,
            );

            // A round rolls over only when every active team has been served,
            // so the "served" ledger empties exactly at the rollover.
            if ring.round_index() != round {
                prop_assert_eq!(
                    served_this_round.len(),
                    n,
                    "round {} advanced with teams still owed a token",
                    round,
                );
                round = ring.round_index();
                served_this_round.clear();
            }
        }
    }

    /// The engine completes a round rather than skipping a team: while any
    /// active team is owed a token, every other team is refused.
    #[test]
    fn a_team_is_never_skipped(n in 2usize..=12, target in 0usize..12) {
        let mut ring = ring_of(n);
        let target = team(target % n);

        // Serve everyone but the last team in the ring.
        for i in 1..n - 1 {
            ring.give_token(&team(i)).unwrap();
        }
        let owed = team(n - 1);

        if target != owed {
            prop_assert!(ring.give_token(&target).is_err());
        }
        prop_assert_eq!(ring.legal_targets(), vec![owed.clone()]);
        prop_assert!(ring.give_token(&owed).is_ok());
        prop_assert!(ring.invariant_holds());
    }
}

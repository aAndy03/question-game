//! Operator pins (§2.15): optional, set on the Operators tab only, **hashed in
//! the host and never in the webview**.
//!
//! The digits cross the wire once, from the field to `operator_set_pin` or
//! `operator_activate`, and are gone. What the catalog keeps is a PHC string
//! (`$argon2id$…`) with its own random salt, so two operators with the same
//! pin store different hashes and `pin_hash` never leaks the pin's length.
//!
//! A pin is not a security boundary — the machine is local and the operator
//! has the keyboard. It is a courtesy lock on *switching to* a pinned operator
//! and on the two data actions, which is why the cost is modest and there is
//! no lockout. Live Play commands never ask for it.

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rand_core::OsRng;
use thiserror::Error;

/// A pin is 4–8 ASCII digits — the shape of a keypad entry, and short enough
/// to type between two questions.
pub const PIN_MIN: usize = 4;
pub const PIN_MAX: usize = 8;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum PinError {
    #[error("a pin is 4-8 digits")]
    Shape,
    #[error("the pin could not be hashed")]
    Hash,
}

/// The §2.15 shape rule. Checked before hashing so a refusal names the field.
pub fn validate_pin_format(pin: &str) -> Result<(), PinError> {
    let digits = pin.chars().all(|c| c.is_ascii_digit());
    if !digits || pin.len() < PIN_MIN || pin.len() > PIN_MAX {
        return Err(PinError::Shape);
    }
    Ok(())
}

/// Digits in, PHC string out. Default argon2id parameters: a few tens of
/// milliseconds, once per switch — not a hot path.
pub fn hash_pin(pin: &str) -> Result<String, PinError> {
    validate_pin_format(pin)?;
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(pin.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|_| PinError::Hash)
}

/// `true` only for the pin that made `hash`. A malformed hash verifies nothing,
/// which is the safe answer for a row an older build might have written.
pub fn verify_pin(pin: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(pin.as_bytes(), &parsed)
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pin_round_trips_and_a_wrong_one_does_not() {
        let hash = hash_pin("2468").unwrap();
        assert!(hash.starts_with("$argon2id$"));
        assert!(verify_pin("2468", &hash));
        assert!(!verify_pin("2469", &hash));
        assert!(!verify_pin("", &hash));
    }

    #[test]
    fn two_hashes_of_one_pin_differ_by_salt() {
        let a = hash_pin("1234").unwrap();
        let b = hash_pin("1234").unwrap();
        assert_ne!(a, b);
        assert!(verify_pin("1234", &a) && verify_pin("1234", &b));
    }

    #[test]
    fn the_shape_is_four_to_eight_digits() {
        assert_eq!(validate_pin_format("123"), Err(PinError::Shape));
        assert_eq!(validate_pin_format("123456789"), Err(PinError::Shape));
        assert_eq!(validate_pin_format("12a4"), Err(PinError::Shape));
        assert_eq!(validate_pin_format("１２３４"), Err(PinError::Shape));
        assert_eq!(validate_pin_format("1234"), Ok(()));
        assert_eq!(validate_pin_format("12345678"), Ok(()));
    }

    #[test]
    fn a_malformed_hash_verifies_nothing() {
        assert!(!verify_pin("1234", "not-a-phc-string"));
        assert!(!verify_pin("1234", ""));
    }
}

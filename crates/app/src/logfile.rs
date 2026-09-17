//! `questiongame.log`, bounded (P12.1).
//!
//! The log appends — two processes may share it, and truncating erased the
//! older one's evidence (2026-09-08) — so without this it grew for the life of
//! the install. At boot, before the file is opened, a log past the threshold
//! is shifted: `.2 → .3`, `.1 → .2`, current `→ .1`, the oldest dropped.

use std::path::Path;

/// A log past this size is rotated at boot.
pub const ROTATE_AT_BYTES: u64 = 10 * 1024 * 1024;
/// How many rotated files are kept beside the current one.
pub const KEEP_ROTATED: usize = 3;

/// `questiongame.log` → `questiongame.1.log`.
pub fn rotated_name(file: &str, n: usize) -> String {
    match file.rsplit_once('.') {
        Some((stem, ext)) => format!("{stem}.{n}.{ext}"),
        None => format!("{file}.{n}"),
    }
}

/// Rotate `dir/file` if it is larger than `at_bytes`. `Ok(true)` when it did.
pub fn rotate(dir: &Path, file: &str, at_bytes: u64, keep: usize) -> std::io::Result<bool> {
    let current = dir.join(file);
    let Ok(meta) = std::fs::metadata(&current) else {
        return Ok(false);
    };
    if meta.len() <= at_bytes || keep == 0 {
        return Ok(false);
    }
    let _ = std::fs::remove_file(dir.join(rotated_name(file, keep)));
    for n in (1..keep).rev() {
        let from = dir.join(rotated_name(file, n));
        if from.exists() {
            std::fs::rename(&from, dir.join(rotated_name(file, n + 1)))?;
        }
    }
    std::fs::rename(&current, dir.join(rotated_name(file, 1)))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("qg-log-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_rotated_name_keeps_the_extension() {
        assert_eq!(rotated_name("questiongame.log", 1), "questiongame.1.log");
        assert_eq!(rotated_name("noext", 2), "noext.2");
    }

    #[test]
    fn a_small_log_is_left_alone() {
        let dir = scratch("small");
        std::fs::write(dir.join("q.log"), "short").unwrap();
        assert!(!rotate(&dir, "q.log", 10, 3).unwrap());
        assert_eq!(std::fs::read_to_string(dir.join("q.log")).unwrap(), "short");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_large_log_shifts_and_the_oldest_falls_off() {
        let dir = scratch("large");
        std::fs::write(dir.join("q.log"), "current-log-over-ten").unwrap();
        std::fs::write(dir.join("q.1.log"), "one").unwrap();
        std::fs::write(dir.join("q.2.log"), "two").unwrap();
        std::fs::write(dir.join("q.3.log"), "three").unwrap();
        assert!(rotate(&dir, "q.log", 10, 3).unwrap());
        assert!(!dir.join("q.log").exists());
        assert_eq!(std::fs::read_to_string(dir.join("q.1.log")).unwrap(), "current-log-over-ten");
        assert_eq!(std::fs::read_to_string(dir.join("q.2.log")).unwrap(), "one");
        assert_eq!(std::fs::read_to_string(dir.join("q.3.log")).unwrap(), "two");
        assert!(!dir.join("q.4.log").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_log_yet_is_not_an_error() {
        let dir = scratch("none");
        assert!(!rotate(&dir, "q.log", 10, 3).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

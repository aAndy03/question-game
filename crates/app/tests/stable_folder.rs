//! questiongame Beta never writes the stable folder (P13.1). The first line of
//! that is that almost nothing can name it: `identity.rs` declares it and
//! `stable_copy.rs` reads from it, read-only. Code anywhere else that names
//! it is a new path into a show's library, and has to be argued for here.

use std::path::Path;

const ALLOWED: [&str; 2] = ["identity.rs", "stable_copy.rs"];

/// Code with `//` comments removed: a doc comment may name the folder.
fn code_of(text: &str) -> String {
    text.lines().map(|l| l.split("//").next().unwrap_or("")).collect::<Vec<_>>().join("\n")
}

fn walk(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    for entry in std::fs::read_dir(dir).unwrap().flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

#[test]
fn only_two_files_name_the_stable_folder() {
    let mut files = Vec::new();
    walk(&Path::new(env!("CARGO_MANIFEST_DIR")).join("src"), &mut files);
    let mut naming: Vec<String> = files
        .iter()
        .filter(|p| {
            let code = code_of(&std::fs::read_to_string(p).unwrap());
            code.contains("RELEASE_IDENTIFIER") || code.contains("org.questiongame.desktop")
        })
        .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
        .collect();
    naming.sort();
    assert_eq!(naming, ALLOWED, "only these may name the stable folder");
}

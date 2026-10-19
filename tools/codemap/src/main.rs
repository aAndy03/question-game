//! `codemap [--root <repo>]` — print the Rust half of codemap.yaml as JSON.
//!
//! `scripts/codemap.ts` runs this, merges the TypeScript half and writes the
//! YAML. Everything printed is sorted and repo-relative: the output is a pure
//! function of the sources.

use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut root = PathBuf::from(".");
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--root" => match args.next() {
                Some(value) => root = PathBuf::from(value),
                None => {
                    eprintln!("codemap: --root needs a path");
                    return ExitCode::from(2);
                }
            },
            other => {
                eprintln!("codemap: unknown argument {other}");
                return ExitCode::from(2);
            }
        }
    }
    match codemap::extract(&root) {
        Ok(map) => match serde_json::to_string(&map) {
            Ok(json) => {
                println!("{json}");
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("codemap: {error}");
                ExitCode::FAILURE
            }
        },
        Err(error) => {
            eprintln!("codemap: {error}");
            ExitCode::FAILURE
        }
    }
}

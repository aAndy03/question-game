// Windows: no console window standing behind the app in a release build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    questiongame_app::run();
}

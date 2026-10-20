//! Plays a running questiongame for the end-to-end suite (P13.1): holds the
//! exclusive lock on `<dir>/questiongame.lock`, the way a running app does,
//! until it is killed. Never shipped — an example, not a binary.
//!
//! ```text
//! cargo run -q -p questiongame-app --example hold_lock -- <dir>
//! ```

fn main() {
    let dir = std::env::args().nth(1).expect("usage: hold_lock <dir>");
    let file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(std::path::Path::new(&dir).join("questiongame.lock"))
        .expect("the lock file");
    file.try_lock().expect("the lock is free");
    println!("held");
    loop {
        std::thread::sleep(std::time::Duration::from_secs(3600));
    }
}

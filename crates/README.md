Rust host (Tauri 2 + MatchService / CatalogService / FlagService).

`host/` is `MatchService` as of P4: a plain library, zero `tauri::` imports,
no database. `CatalogService` and `FlagService` land at P5, Tauri at P6.

```bash
npm run test:host   # cargo test  (unit + integration + proptest)
npm run lint:host   # cargo clippy --all-targets -D warnings
cargo fmt --all
```

Read `host/src/lib.rs` for the module map, then `host/src/service.rs` — the
§13 command surface and the only writer of a Play. See `docs/v1/04_ROADMAP.md`.

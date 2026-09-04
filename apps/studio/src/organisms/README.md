<!-- Atomic design convention: docs/v1/04_ROADMAP.md.
     The one-way import rule is enforced by eslint.config.js. -->

# studio/organisms

A self-contained region. **The first level allowed to know the domain** —
reads `play-state` (Stage) or dispatches commands (Studio).

Reveal state lives here, never in an atom: an atom unmounting would reset a
reveal, which spec §2.6 forbids.

May import: molecules, atoms.

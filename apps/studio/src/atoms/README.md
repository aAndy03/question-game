<!-- Atomic design convention: docs/v1/04_ROADMAP.md.
     The one-way import rule is enforced by eslint.config.js. -->

# studio/atoms

One element. No composition, no data fetching, no play-state, no host calls.
Props in, markup out, fully token-driven.

May import: nothing from this app except other atoms.

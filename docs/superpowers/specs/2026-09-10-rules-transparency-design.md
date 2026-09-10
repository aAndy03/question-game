# P11.12 — Rules you can see, awards you can explain

Status: design, 2026-09-10.

The operator can set fourteen keys that move a number and has no way to see
what any of them does, alone or together. Four of them silently neutralise
others. One of them — `scoring.difficulty_map` set to Bands — renders *nothing
at all* in Game ▸ Rules, so the operator picks it and the panel goes blank.

This phase makes the rules visible before a Play and the awards explainable
after one, and adds the two scoring keys that make the speed factor
predictable rather than merely deterministic.

---

## 1. The award surface

Every setting that can move a number, in the order it applies:

```text
base ──┬─ scoring.flat_points            mode=flat, or mode=lock_speed & base=flat
       └─ scoring.difficulty_map(d)      mode=difficulty, or mode=lock_speed & base=difficulty
            ├─ linear{factor}  → floor(d × factor)
            └─ bands[]         → first band with up_to ≥ d, else the last band

×speed ─ 1.0 unless (mode=lock_speed OR lock_speed_enabled)
         1 + speed_weight × progress
         progress = 0 (so ×1.0) when: timer off · never locked · weight 0
                                    · the lock fell outside speed_window
         duration from the §2.18 cascade: question overlay → recipe → globals

scaled = floor(base × speed)

verdict ─┬ correct   → scaled
         ├ partial   → floor(scaled × (correct_locked − incorrect_locked)/correct_total)
         │             only when judging.partial_credit; else 0
         └ incorrect → 0   (judging.order_matters can turn a right set into this)

+bonus ─ turn.bonus_after_consecutive when correct AND streak == count (once per token)
 cap   ─ turn.max_consecutive_correct ends the token at streak ≥ cap;
         that answer still scores (§4.4)

total = points + bonus
```

**The award is a pure function of `(difficulty, verdict, lock progress,
streak)` and the frozen settings.** It never reads the domain, the team, the
round, or the position in the board. Difficulty 21 pays the same everywhere.
That is an invariant, and P11.12 gives it a property test rather than leaving
it an emergent property of four modules.

---

## 2. Predictable speed: two new keys

Today the speed factor is `1 + weight × remaining/duration` — a *ratio* of
whatever clock that question happened to get. A one-second answer on a 30 s
clock is worth `0.967 × weight`; on a 10 s clock, `0.9 × weight`. Deterministic,
but not predictable in the operator's sense: the same answer time is worth
different amounts on different questions.

Two keys on `ScoringSettings`, both defaulting to exactly today's behaviour:

```rust
/// Where the lock-speed bonus reaches zero.
pub enum SpeedWindow {
    /// A share of that question's own clock. `1.0` is the whole clock —
    /// the P4 formula unchanged, and the default.
    Fraction(f64),
    /// Absolute milliseconds, clamped to the clock. The same answer time is
    /// worth the same on every question whatever its duration.
    Ms(u32),
}

pub struct ScoringSettings {
    // …existing…
    pub speed_window: SpeedWindow,      // default Fraction(1.0)
    /// Quantize the bonus into n equal bands across the window, so every
    /// answer inside a band is worth identically the same. `None` = continuous.
    pub speed_steps: Option<u32>,       // default None
}
```

```text
window_ms = match speed_window {
    Fraction(f) => duration_ms × clamp(f, 0..=1)
    Ms(n)       => min(n, duration_ms)
}
elapsed = duration_ms − remaining_ms_at_lock
progress = if window_ms == 0 || elapsed >= window_ms { 0.0 }
           else { 1 − elapsed / window_ms }
progress = match speed_steps { Some(n) => ceil(progress × n) / n, None => progress }
multiplier = 1 + speed_weight × progress
```

`Fraction(1.0)` with no steps gives `progress = remaining/duration`, which is
the current formula byte for byte — so **no snapshot migration**: both fields
carry `#[serde(default)]` and an old `PlaySnapshot` deserialises into today's
behaviour, which is what it was played under.

`Fraction(0.333)` is "no speed bonus after a third of the clock".
`Ms(10_000)` is "the bonus decays over ten seconds, whatever the clock".
`speed_steps: Some(3)` is fast / medium / slow bands, where every answer in a
band pays exactly the same.

**Validation** (`ScoringSettings::validate`, so `play_load` runs the same
table): a `Fraction` must be finite and in `(0, 1]`; `Ms` must be `> 0`;
`speed_steps` must be `>= 1` when present. A window of zero would mean the
bonus can never be paid — refused with "switch lock-speed off instead", the
same shape as the existing `max_consecutive_correct == Some(0)` refusal.

---

## 3. Host — one arithmetic

`crates/host/src/explain.rs`, pure, beside `award.rs`.

```rust
pub struct AwardBreakdown {
    pub judgement: Judgement,          // verdict + correct/incorrect/total locked
    pub base: u32,
    pub base_from: BaseSource,         // Flat | Linear{factor,difficulty}
                                       // | Band{index,from,up_to,points,above_last}
    pub speed: SpeedFactor,            // Off{reason} | On{weight,window_ms,elapsed_ms,
                                       //                 steps,progress,multiplier}
    pub scaled: u32,
    pub share: Option<PartialShare>,
    pub points: u32,
    pub bonus: Option<BonusAward>,     // {streak, count, award}
    pub total: u32,
}
```

**`award_points` becomes `explain(..).points`.** One arithmetic, so the ledger
and the scoreboard cannot drift; a property test asserts the two agree over the
generated compound space during and after the refactor.

`BaseSource::Band` naming the band that paid — its index, its resolved
`from..=up_to` span, and whether the difficulty fell above the last band — is
what answers "what do Bands do" *in the data*, not only in a tooltip.

`SpeedFactor::Off` carries why: `ModeOff` · `OperatorPace` · `NeverLocked` ·
`WeightZero` · `OutsideWindow`. Five distinct reasons a control the operator set
did nothing.

---

## 4. Host — one interlock table, `rules_preview`

`FlagService::disabled()` only answers for the recipe **in Control**, so
`RulesSection` re-derives `weightInert` and `timerOff` client-side today —
against the rule that nothing in Studio recomputes an interlock. The §4.2 table
is factored to run over any `GameSettings` + a `RuntimeContext`; `disabled()`
calls it, and Studio's copies go.

New §13 command, `rules_preview`, on `FlagService` (it owns the settings
document and the interlocks). It takes the settings document to explain and the
board to explain it over, and answers one document:

```rust
pub struct RulesPreview {
    pub path: AwardPath,          // which branch of §1 is live, and why each dead one is dead
    pub bands: Option<Vec<BandSpan>>,   // bands resolved to explicit from..=up_to → points
    pub timer: TimerResolution,   // which cascade level supplied the duration
    pub columns: Vec<PreviewColumn>,    // lock samples: instant · ¼ · ½ · ¾ · buzzer · never
    pub rows: Vec<PreviewRow>,    // one per distinct board difficulty
    pub board: BoardShape,        // §5
    pub effects: Vec<RuleEffect>, // key → live | inert(by which sibling) | frozen | feature-off
    pub warnings: Vec<PreviewWarning>,
}
```

`RuleEffect` carries **codes, not English** — Studio renders the strings from
`copy/`, the way `disabledReasonText` and `RING_ROLE` already do.

`PreviewRow` is one difficulty, with the count of board questions sitting at it,
the domains they belong to, the base, and the total a correct answer pays at
each lock sample; plus the partial row when `partial_credit` is on. Rows come
from the recipe's **real board**; an empty board (or the globals form, which has
no board) falls back to 1 / 25 / 50 / 75 / 100. More than eight distinct
difficulties bucket to eight.

`PreviewWarning` covers the things that break "the same answer is worth the
same": a per-question `duration_ms` overlay on the board (the speed factor is
not comparable across questions unless `SpeedWindow::Ms` is used), a bonus that
can never be reached, a band table that is not monotonic, a difficulty above the
last band.

---

## 5. The board's shape

Uneven domains are **not an award problem**. The award never reads domain
membership, so a 3-question domain and a 30-question one pay the same for
difficulty 21. What they change is the *ceiling* (a 3-question domain is
exhausted in three turns) and the *walk* (easy→hard inside a domain has fewer
rungs). That is board design, and it belongs in the Board section as
information — not in Rules as a rule.

```rust
pub enum BoardShape {
    /// Same question count and the same difficulty ladder in every domain.
    Aligned { rungs: Vec<Rung> },       // rung index → difficulty → award
    /// Same count, different ladders.
    Uniform { per_domain: u32, domains: Vec<DomainLadder> },
    /// Counts differ.
    Ragged { domains: Vec<DomainLadder> },
    Empty,
}
```

The presentation **adapts to the shape**, which is the point: an aligned board
collapses to one small rung table — "every domain's 3rd question is difficulty
70 and pays 700" — because every domain walks the same ladder and one table is
the whole truth. Uniform and Ragged show the per-domain ladders side by side,
with the divergence marked.

`DomainLadder` carries the domain's name, its question count, its difficulty
span, its ladder in walk order, and the total points available if every question
were answered correctly at no speed bonus — the honest ceiling.

---

## 6. Studio

**Game ▸ Rules** — `RulesPreviewPanel` beside the form:

1. the **path strip**: §1's diagram with the live branch lit, dead branches
   greyed with the reason, and the current numbers substituted;
2. the **matrix**: difficulty rows × lock-speed columns, real board data;
3. the **band ladder** when the base is Bands, showing resolved spans;
4. the **effects table**: one row per key — what it changes, what it currently
   makes inert, and which sibling did it.

And the bug: **`DifficultyMapField` is wired into `RulesSection`**, replacing
the ad-hoc `SelectField` that renders nothing for Bands. One molecule, both call
sites (Game ▸ Rules and Settings ▸ Settings).

**Game ▸ Board** — a `BoardBalance` block above the domain list showing the
shape, plus a **Worth** column on every question row: what this question pays
under the current rules. Team names and question difficulties come from the
recipe, never from a placeholder.

**Statistics ▸ Live** — `AwardLedger`. `stats_query` gains `detail: u32` (how
many turn rows, newest first; `0` = none — one command, one document, as §13.1
requires) and `StatsResult` gains `turns: Vec<TurnAward>` = `TurnFact` +
`AwardBreakdown`. `TurnFact` gains `streak` and `token_ends`, both free from the
log.

One row per resolved turn: # · team · domain · question · difficulty · verdict ·
lock · **base · ×speed · share · bonus · TOTAL**, expanding to the prose reason
naming the settings that produced it. It recomputes from the Play's **frozen**
snapshot settings, so a rules edit never rewrites history. A "Show working"
toggle (chrome, per operator) collapses the working columns. Live is scoped to
the open Play and refreshes on `operator.eventCount`, so the Statistics window
gets the ledger for free.

Statistics stays a projector: no file under it imports `useHostCommand`, and the
existing grep test still passes.

---

## 7. Tests

- `proptest` over the compound space — mode × lock-speed base × option × weight
  × window × steps × linear|bands × partial × order × cap × bonus × cascade:
  - `explain(..).points == award_points(..)` for every combination;
  - the speed factor is applied exactly once;
  - operator pace and "never locked" always give ×1.0;
  - an incorrect verdict is always 0, whatever else is set;
  - the award depends on `(difficulty, verdict, progress, streak)` and nothing
    else — same inputs, different domain or team, same number;
  - `speed_steps: Some(n)` puts every lock inside a band at the identical
    multiplier;
  - `Fraction(1.0)` with no steps equals the pre-P11.12 formula.
- `demo_scenarios.rs`: every ledger row's recomputed total equals the
  `TurnResolved` recorded in that Play's log.
- `RulesSection.test.tsx`: choosing Bands renders an editable band table.
- `rules_preview.rs`: an aligned board reports `Aligned`; changing one domain's
  count makes it `Ragged`; a per-question duration raises the comparability
  warning.
- `pages/statistics.test.tsx`: the ledger imports no `useHostCommand`.

---

## 8. Not in this phase

- No change to how a Play is scored by default. Both new keys default to the
  current formula, so an existing recipe pays exactly what it paid yesterday.
- No board *editing* from the balance readout — it reports, the Board list
  edits.
- No award override. Reveal is still the only thing that scores.

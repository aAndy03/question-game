import { Chip, Panel, Skeleton, Text } from "@/atoms";
import { AwardMatrix, BandLadder, RuleEffects } from "@/molecules";
import { PREVIEW } from "@/copy/preview";
import { useRulesPreview } from "@/host/queries";

export interface RulesPreviewPanelProps {
  /** The recipe to explain. `null` previews the all-games defaults. */
  recipeId: string | null;
  /** Bumped by every settings write, so the explanation refetches with it. */
  rev?: number | null | undefined;
}

/**
 * What these rules pay, beside the form that sets them (P11.12).
 *
 * Four things, in the order the operator needs them:
 *
 * 1. **the countdown** — which level of the §2.18 cascade answered, and how
 *    much of it the speed bonus is paid over;
 * 2. **the matrix** — this game's own difficulties × answer speed, every cell
 *    an exact number;
 * 3. **the band ladder**, when the base is banded — the answer to "what does
 *    Bands do", drawn as ranges rather than ceilings;
 * 4. **the effects table** — every award key, what it changes, and which
 *    sibling is currently switching it off.
 *
 * Every number is the host's, computed with the same function that scores a
 * real answer, so this panel cannot promise something a Play would not pay.
 * Studio formats and explains; it never multiplies.
 */
export function RulesPreviewPanel({ recipeId, rev }: RulesPreviewPanelProps) {
  const preview = useRulesPreview(recipeId, rev ?? null);

  if (!preview.data) {
    return (
      <Panel className="flex flex-col gap-3">
        <Text variant="studio-heading">{PREVIEW.title}</Text>
        <Skeleton shape="card" count={2} />
      </Panel>
    );
  }
  const p = preview.data;
  const sampled = p.rows.every((row) => row.questionCount === 0);

  return (
    // `Panel` takes named props only, so a `data-` hook on it is silently
    // dropped — and a test keying on one would be asserting nothing.
    <div data-rules-preview>
      <Panel className="flex flex-col gap-5">
        <div className="flex flex-col gap-0.5">
          <Text variant="studio-heading">{PREVIEW.title}</Text>
          <Text variant="studio-caption" tone="muted">
            {PREVIEW.hint}
          </Text>
        </div>

        {p.warnings.length > 0 ? (
          <div className="flex flex-col gap-1" data-preview-warnings>
            {p.warnings.map((warning, index) => (
              <Text key={index} variant="studio-caption" tone="warning">
                {PREVIEW.warning(warning)}
              </Text>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Text variant="studio-label">{PREVIEW.timer.title}</Text>
          {p.timer.durationMs === null ? (
            <Chip tone="warning">{PREVIEW.timer.operatorPace}</Chip>
          ) : (
            <>
              <Chip tone="default">
                {PREVIEW.seconds(p.timer.durationMs)}{" "}
                {PREVIEW.timer.from(p.timer.source)}
              </Chip>
              {p.timer.speedWindowMs !== null ? (
                <Text variant="studio-caption" tone="muted">
                  {PREVIEW.timer.window(
                    p.timer.speedWindowMs,
                    p.timer.durationMs,
                  )}
                </Text>
              ) : null}
            </>
          )}
          {p.timer.perQuestion > 0 ? (
            <Text variant="studio-caption" tone="muted">
              {PREVIEW.timer.perQuestion(p.timer.perQuestion)}
            </Text>
          ) : null}
        </div>

        <AwardMatrix preview={p} sampled={sampled} />
        <BandLadder bands={p.bands} />
        <RuleEffects preview={p} />
      </Panel>
    </div>
  );
}

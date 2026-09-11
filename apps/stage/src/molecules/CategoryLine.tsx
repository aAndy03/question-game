import { SPACE } from '@questiongame/design-stage'
import { Rule, Text } from '@/atoms'
import { useCopy } from '@/copy'
import { hud } from '@/copy/format'

/**
 * The line over the stem: `domain // technology | TEAM ALPHA`. The label is
 * copy; the domain and team names are derived. The team half is omitted
 * when nobody holds the token.
 */

export interface CategoryLineProps {
  nodeId: string
  domainName: string | null
  teamName: string | null
}

export function CategoryLine({ nodeId, domainName, teamName }: CategoryLineProps) {
  const copy = useCopy()
  return (
    <div data-node-id={nodeId} style={{ display: 'flex', alignItems: 'center', gap: SPACE[2] }}>
      <Text variant="stage-hud" transition="swap" tone="heading">
        {hud(copy, copy.domainLabel, domainName)}
      </Text>
      {teamName ? (
        <>
          <Rule orientation="vertical" weight="thin" />
          <Text variant="stage-team-tag" transition="swap" tone="primary">
            {teamName}
          </Text>
        </>
      ) : null}
    </div>
  )
}

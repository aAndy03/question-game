/**
 * The copied decorative SVGs, inlined so a body can take a design-system
 * colour. The Figma export bakes a fill and a rotation into each path; the
 * fill is replaced with `currentColor`, the rotation is kept (it is part of
 * the look) and the seeded rotation is applied on top.
 *
 * Never redraw these (design system: "Iconography").
 */

import plus from '@questiongame/design-stage/assets/decorative_plus_minus/+.svg?raw'
import minus from '@questiongame/design-stage/assets/decorative_plus_minus/-.svg?raw'
import bang from '@questiongame/design-stage/assets/decorative_domain_screen/!.svg?raw'
import domainC from '@questiongame/design-stage/assets/decorative_domain_screen/C.svg?raw'
import domainH from '@questiongame/design-stage/assets/decorative_domain_screen/H.svg?raw'
import domainO from '@questiongame/design-stage/assets/decorative_domain_screen/O.svg?raw'
import domainO1 from '@questiongame/design-stage/assets/decorative_domain_screen/O-1.svg?raw'
import domainS from '@questiongame/design-stage/assets/decorative_domain_screen/S.svg?raw'
import domainE from '@questiongame/design-stage/assets/decorative_domain_screen/E.svg?raw'
import orderR from '@questiongame/design-stage/assets/deocrative_turn_order/R.svg?raw'
import orderE from '@questiongame/design-stage/assets/deocrative_turn_order/E.svg?raw'
import orderA from '@questiongame/design-stage/assets/deocrative_turn_order/A.svg?raw'
import orderD from '@questiongame/design-stage/assets/deocrative_turn_order/D.svg?raw'
import orderY from '@questiongame/design-stage/assets/deocrative_turn_order/Y.svg?raw'
import orderUnderscore from '@questiongame/design-stage/assets/deocrative_turn_order/_.svg?raw'
import boardBar from '@questiongame/design-stage/assets/decorative_up_down_scoreboard/Rectangle 1.svg?raw'
import boardUnion from '@questiongame/design-stage/assets/decorative_up_down_scoreboard/Union.svg?raw'
import boardUnion1 from '@questiongame/design-stage/assets/decorative_up_down_scoreboard/Union-1.svg?raw'
import leaderW from '@questiongame/design-stage/assets/devorative_leaderboard_screen/W.svg?raw'
import leaderI from '@questiongame/design-stage/assets/devorative_leaderboard_screen/I.svg?raw'
import leaderN from '@questiongame/design-stage/assets/devorative_leaderboard_screen/N.svg?raw'
import leaderN1 from '@questiongame/design-stage/assets/devorative_leaderboard_screen/N-1.svg?raw'
import leaderE from '@questiongame/design-stage/assets/devorative_leaderboard_screen/E.svg?raw'
import leaderR from '@questiongame/design-stage/assets/devorative_leaderboard_screen/R.svg?raw'
import leaderI1 from '@questiongame/design-stage/assets/devorative_leaderboard_screen/I-1.svg?raw'

const RAW = {
  plus,
  minus,
  bang,
  'domain-C': domainC,
  'domain-H': domainH,
  'domain-O': domainO,
  'domain-O-1': domainO1,
  'domain-S': domainS,
  'domain-E': domainE,
  'order-R': orderR,
  'order-E': orderE,
  'order-A': orderA,
  'order-D': orderD,
  'order-Y': orderY,
  'order-_': orderUnderscore,
  'board-bar': boardBar,
  'board-union': boardUnion,
  'board-union-1': boardUnion1,
  'leader-W': leaderW,
  'leader-I': leaderI,
  'leader-N': leaderN,
  'leader-N-1': leaderN1,
  'leader-E': leaderE,
  'leader-R': leaderR,
  'leader-I-1': leaderI1,
} as const

export type DecorAssetId = keyof typeof RAW

export interface DecorAsset {
  readonly id: DecorAssetId
  /** Natural size from the viewBox — the assets are cut at 1920-canvas scale. */
  readonly width: number
  readonly height: number
  /** Markup with fills replaced by `currentColor` and no fixed size. */
  readonly markup: string
}

function parse(id: DecorAssetId, raw: string): DecorAsset {
  const vb = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(raw)
  const width = vb ? Number(vb[3]) : 0
  const height = vb ? Number(vb[4]) : 0
  const markup = raw
    .replace(
      /<svg([^>]*)>/,
      (_m, attrs: string) =>
        `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`,
    )
    .replace(/fill="#[0-9a-fA-F]{3,8}"/g, 'fill="currentColor"')
    .replace(/stroke="#[0-9a-fA-F]{3,8}"/g, 'stroke="currentColor"')
  return { id, width, height, markup }
}

const ASSETS = Object.fromEntries(
  (Object.keys(RAW) as DecorAssetId[]).map((id) => [id, parse(id, RAW[id])]),
) as Record<DecorAssetId, DecorAsset>

export function decorAsset(id: string): DecorAsset {
  const a = ASSETS[id as DecorAssetId]
  if (!a) throw new Error(`unknown decor asset "${id}"`)
  return a
}

export const DECOR_ASSET_IDS = Object.keys(ASSETS) as DecorAssetId[]

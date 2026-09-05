import { Avatar as HeroAvatar } from '@heroui/react'

export interface TeamMarkData {
  readonly color: string
  readonly shortCode: string
  readonly logoUrl?: string | null | undefined
  readonly name?: string | undefined
}

export interface AvatarProps {
  mark: TeamMarkData
  size?: 'sm' | 'md' | 'lg'
  className?: string | undefined
}

/**
 * The team mark, everywhere in Studio: the logo when there is one, otherwise
 * the short code on the team colour. HeroUI `Avatar` under the hood.
 */
export function Avatar({ mark, size = 'md', className }: AvatarProps) {
  const initials = mark.shortCode.slice(0, 3).toUpperCase() || (mark.name ?? '?').slice(0, 2).toUpperCase()
  return (
    <HeroAvatar size={size} className={className}>
      {mark.logoUrl ? <HeroAvatar.Image src={mark.logoUrl} alt={mark.name ?? mark.shortCode} /> : null}
      <HeroAvatar.Fallback
        className="font-medium"
        style={{ background: mark.color, color: 'var(--accent-foreground)' }}
      >
        {initials}
      </HeroAvatar.Fallback>
    </HeroAvatar>
  )
}

export interface InitialsAvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  tone?: 'default' | 'accent'
}

/** An operator: initials on a neutral ground. */
export function InitialsAvatar({ name, size = 'sm', tone = 'default' }: InitialsAvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <HeroAvatar size={size} color={tone} variant="soft">
      <HeroAvatar.Fallback>{initials || '?'}</HeroAvatar.Fallback>
    </HeroAvatar>
  )
}

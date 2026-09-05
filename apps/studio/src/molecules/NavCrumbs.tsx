import { Breadcrumbs } from '@heroui/react'

export interface Crumb {
  readonly label: string
  /** Absent on the current page. */
  readonly onPress?: (() => void) | undefined
}

export interface NavCrumbsProps {
  crumbs: readonly Crumb[]
}

/** HeroUI `Breadcrumbs` bound to the route stack; the last crumb is the page. */
export function NavCrumbs({ crumbs }: NavCrumbsProps) {
  return (
    <Breadcrumbs>
      {crumbs.map((crumb, i) =>
        crumb.onPress && i < crumbs.length - 1 ? (
          <Breadcrumbs.Item key={`${crumb.label}-${i}`} href="#" onPress={crumb.onPress}>
            {crumb.label}
          </Breadcrumbs.Item>
        ) : (
          <Breadcrumbs.Item key={`${crumb.label}-${i}`}>{crumb.label}</Breadcrumbs.Item>
        ),
      )}
    </Breadcrumbs>
  )
}

import { useEffect, useState } from 'react'
import { Text } from '@/atoms'
import { SettingsGroup } from '@/molecules'
import { SETTINGS } from '@/copy/settings'
import { useAppInfo } from '@/host/queries'

type Loaded = { state: 'loading' } | { state: 'ready'; text: string } | { state: 'missing' }

/**
 * A text file shipped beside Studio (`dist/studio/notices/`, written by
 * `npm run notices`). A dev server has none and answers `index.html`
 * instead, which is what the `<` check catches.
 */
function useShippedText(file: string): Loaded {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  useEffect(() => {
    let live = true
    const url = `${import.meta.env.BASE_URL}notices/${file}`
    void (async () => {
      try {
        const res = await fetch(url)
        const text = res.ok ? await res.text() : ''
        if (!live) return
        setLoaded(text && !text.trimStart().startsWith('<') ? { state: 'ready', text } : { state: 'missing' })
      } catch {
        if (live) setLoaded({ state: 'missing' })
      }
    })()
    return () => {
      live = false
    }
  }, [file])
  return loaded
}

function ShippedText({ loaded }: { loaded: Loaded }) {
  if (loaded.state === 'loading') return <Text tone="muted">{SETTINGS.about.loading}</Text>
  if (loaded.state === 'missing') return <Text tone="muted">{SETTINGS.about.notGenerated}</Text>
  return (
    <Text as="pre" variant="studio-mono" className="max-h-80 overflow-auto whitespace-pre-wrap">
      {loaded.text}
    </Text>
  )
}

/**
 * Settings ▸ About (P12.3, `05_STUDIO_DESIGN.md` §18.3): what this build is,
 * the licence it ships under, the GSAP permission, and what it is made of.
 */
export function AboutPanel() {
  const info = useAppInfo()
  const licence = useShippedText('LICENSE.txt')
  const notices = useShippedText('THIRD-PARTY-NOTICES.txt')

  return (
    <div className="flex flex-col gap-4" data-about>
      <SettingsGroup title={SETTINGS.about.title} description={SETTINGS.about.tagline}>
        <Text as="div" variant="studio-body">
          {info.data ? SETTINGS.about.version(info.data.version, info.data.build) : SETTINGS.about.loading}
        </Text>
        {info.data ? (
          <Text as="div" variant="studio-caption" tone="muted">
            {info.data.identifier}
          </Text>
        ) : null}
      </SettingsGroup>
      <SettingsGroup title={SETTINGS.about.licenceTitle}>
        <Text as="p" variant="studio-body">
          {SETTINGS.about.gplSummary}
        </Text>
        <Text as="p" variant="studio-body" className="pt-2">
          {SETTINGS.about.gsapPermission}
        </Text>
        <div className="pt-3">
          <ShippedText loaded={licence} />
        </div>
      </SettingsGroup>
      <SettingsGroup title={SETTINGS.about.noticesTitle} description={SETTINGS.about.noticesHint}>
        <ShippedText loaded={notices} />
      </SettingsGroup>
    </div>
  )
}

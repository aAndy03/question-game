import { Tabs } from '@heroui/react'
import { PageHeader, SectionIndex } from '@/molecules'
import { AboutPanel, MonitorsSettings, SettingsForm, ShortcutsEditor } from '@/organisms'
import { SettingsLayout } from '@/templates'
import { useChromeStore, useSettingsInner, type SettingsInner } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { TABS } from '@/copy'
import { SETTINGS, SETTINGS_GROUPS } from '@/copy/settings'

export interface SettingsPageProps {
  /** The route's inner tab; wins over the remembered one so a notice can deep-link. */
  inner?: SettingsInner | undefined
}

const INNER: readonly SettingsInner[] = ['monitors', 'settings', 'shortcuts', 'about']

/** Settings — Monitors | Settings | Keyboard shortcuts | About (§2.20, 05_STUDIO_DESIGN.md §12.2, §18.3). */
export function SettingsPage({ inner }: SettingsPageProps) {
  const remembered = useSettingsInner()
  const setInner = useChromeStore((s) => s.setSettingsInner)
  const replace = useNavStore((s) => s.replace)
  const selected = inner ?? remembered

  const select = (next: SettingsInner) => {
    setInner(next)
    replace({ tab: 'settings', inner: next })
  }

  return (
    <SettingsLayout
      aside={selected === 'settings' ? <SectionIndex entries={SETTINGS_GROUPS.map((g) => ({ id: `settings-${g.id}`, title: g.title }))} /> : undefined}
      header={<PageHeader title={TABS.settings.label} description={TABS.settings.hint} />}
      tabs={
        <Tabs
          variant="secondary"
          selectedKey={selected}
          onSelectionChange={(key) => {
            if (typeof key === 'string' && (INNER as readonly string[]).includes(key)) select(key as SettingsInner)
          }}
        >
          <Tabs.ListContainer>
            {/* As wide as their labels (P20): four tabs spread over the window read as a ruler. */}
            <Tabs.List aria-label={TABS.settings.label} className="w-fit">
              {INNER.map((id) => (
                <Tabs.Tab key={id} id={id}>
                  {SETTINGS.inner[id]}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      }
    >
      {selected === 'monitors' ? (
        <MonitorsSettings />
      ) : selected === 'shortcuts' ? (
        <ShortcutsEditor />
      ) : selected === 'about' ? (
        <AboutPanel />
      ) : (
        <SettingsForm />
      )}
    </SettingsLayout>
  )
}

import { Button as HeroButton, Dropdown, Label } from '@heroui/react'
import { IconButton, Icon, Text } from '@/atoms'
import { OperatorBadge, PlayStatusPill } from '@/molecules'
import { useChromeStore, usePrefs, type ThemeChoice } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { CHROME } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { usePlayState } from '@/host/playState'
import { useCatalogList, useRecipe, useSettings } from '@/host/queries'
import type { GlobalSetting } from '@/host/types'

/**
 * Recipe name if loaded · play status · current operator (spec §11.I), plus
 * back/forward and the theme toggle. The status comes from `play-state`; the
 * operator from `settings_get`; nothing here is remembered locally.
 */
export function TopBar() {
  const play = usePlayState()
  const settings = useSettings()
  const back = useNavStore((s) => s.back)
  const forward = useNavStore((s) => s.forward)
  const goBack = useNavStore((s) => s.goBack)
  const goForward = useNavStore((s) => s.goForward)
  const go = useNavStore((s) => s.go)
  const { theme } = usePrefs()
  const setTheme = useChromeStore((s) => s.setTheme)
  const run = useHostCommand()

  const recipe = useRecipe(play?.operator.recipeId ?? null)
  const operators = useCatalogList('operator', 'active')
  const activeId = settings.data?.globals.active_operator_id ?? null
  const active = operators.data?.find((o) => o.id === activeId) ?? null

  const switchOperator = (id: string) => {
    const setting: GlobalSetting = { key: 'active_operator_id', value: id }
    void run('settings_set_global', { setting })
  }

  return (
    <header
      className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border)] px-3"
      style={{ background: 'var(--surface)' }}
    >
      <div className="flex items-center gap-1">
        <IconButton icon="back" label={CHROME.back} size="sm" isDisabled={back.length === 0} onPress={() => void goBack()} />
        <IconButton icon="forward" label={CHROME.forward} size="sm" isDisabled={forward.length === 0} onPress={() => void goForward()} />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <PlayStatusPill status={play?.status ?? null} recipeName={recipe.data?.name ?? null} />
      </div>
      <div className="flex items-center gap-1">
        <Dropdown>
          <Dropdown.Trigger>
            <IconButton
              icon={theme === 'dark' ? 'themeDark' : theme === 'light' ? 'themeLight' : 'themeSystem'}
              label={CHROME.theme}
              size="sm"
              hideTooltip
            />
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              selectionMode="single"
              selectedKeys={[theme]}
              onSelectionChange={(keys) => {
                const next = [...keys][0]
                if (next === 'system' || next === 'light' || next === 'dark') setTheme(next as ThemeChoice)
              }}
            >
              <Dropdown.Item id="system" textValue={CHROME.themeSystem}>
                <Label>{CHROME.themeSystem}</Label>
                <Dropdown.ItemIndicator />
              </Dropdown.Item>
              <Dropdown.Item id="light" textValue={CHROME.themeLight}>
                <Label>{CHROME.themeLight}</Label>
                <Dropdown.ItemIndicator />
              </Dropdown.Item>
              <Dropdown.Item id="dark" textValue={CHROME.themeDark}>
                <Label>{CHROME.themeDark}</Label>
                <Dropdown.ItemIndicator />
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        <Dropdown>
          <Dropdown.Trigger>
            <HeroButton variant="ghost" size="sm" aria-label={CHROME.operator} className="rounded-full pl-1 pr-2">
              <OperatorBadge name={active?.displayName ?? null} isActive={active !== null} />
              <Icon name="chevronDown" size="sm" className="opacity-60" />
            </HeroButton>
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              onAction={(key) => {
                if (key === '__manage') void go({ tab: 'operators' })
                else switchOperator(String(key))
              }}
            >
              <Dropdown.Section>
                <Text as="div" variant="studio-caption" tone="muted" className="px-2 py-1">
                  {CHROME.switchOperator}
                </Text>
                {(operators.data ?? []).map((o) => (
                  <Dropdown.Item key={o.id} id={o.id} textValue={o.displayName}>
                    <Label>{o.displayName}</Label>
                    {o.id === activeId ? <Dropdown.ItemIndicator /> : null}
                  </Dropdown.Item>
                ))}
              </Dropdown.Section>
              <Dropdown.Item id="__manage" textValue={CHROME.manageOperators}>
                <Label>{CHROME.manageOperators}</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
    </header>
  )
}

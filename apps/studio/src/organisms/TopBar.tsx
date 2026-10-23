import { Button as HeroButton, Dropdown, Header, Label } from '@heroui/react'
import { IconButton, Icon } from '@/atoms'
import { OperatorBadge, PlayStatusPill } from '@/molecules'
import { ControlTools } from './ControlTools'
import { UnloadGame } from './UnloadGame'
import { useActivateOperator } from './useActivateOperator'
import { useChromeStore, usePrefs, type ThemeChoice } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { CHROME } from '@/copy'
import { usePlayState } from '@/host/playState'
import { useCatalogList, useRecipe, useSettings } from '@/host/queries'

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
  const onControl = useNavStore((s) => s.route.tab === 'control')
  const { theme } = usePrefs()
  const setTheme = useChromeStore((s) => s.setTheme)
  const { activate, prompt } = useActivateOperator()

  const recipe = useRecipe(play?.operator.recipeId ?? null)
  const operators = useCatalogList('operator', 'active')
  const activeId = settings.data?.globals.active_operator_id ?? null
  const active = operators.data?.find((o) => o.id === activeId) ?? null

  const switchOperator = (id: string) => {
    const target = operators.data?.find((o) => o.id === id)
    if (target) activate(target)
  }

  return (
    <header
      className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--chrome-line)] px-3"
      style={{ background: 'var(--chrome)' }}
    >
      <div className="flex items-center gap-1">
        <IconButton icon="back" label={CHROME.back} size="sm" isDisabled={back.length === 0} onPress={() => void goBack()} />
        <IconButton icon="forward" label={CHROME.forward} size="sm" isDisabled={forward.length === 0} onPress={() => void goForward()} />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
        <PlayStatusPill status={play?.status ?? null} recipeName={recipe.data?.name ?? null} />
        {/* Beside the game it unloads (P21.5), on Control with the other tools. */}
        {onControl ? <UnloadGame /> : null}
      </div>
      <div className="flex items-center gap-1">
        {/* Control's own tools, only while Control is open (P21.4). */}
        {onControl ? <ControlTools /> : null}
        <Dropdown>
          {/* The button *is* the trigger. `Dropdown.Trigger` renders a
            * `<button>` around its child, so wrapping one nests two buttons —
            * invalid HTML and a React error on every boot. HeroUI v3's own
            * usage example puts the Button directly under `Dropdown`. */}
          <HeroButton variant="ghost" size="sm" isIconOnly aria-label={CHROME.theme}>
            <Icon name={theme === 'dark' ? 'themeDark' : theme === 'light' ? 'themeLight' : 'themeSystem'} size="sm" />
          </HeroButton>
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
          <HeroButton variant="ghost" size="sm" aria-label={CHROME.operator} className="rounded-full pl-1 pr-2">
            <OperatorBadge name={active?.displayName ?? null} isActive={active !== null} />
            <Icon name="chevronDown" size="sm" className="opacity-60" />
          </HeroButton>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              onAction={(key) => {
                if (key === '__manage') void go({ tab: 'operators' })
                else switchOperator(String(key))
              }}
            >
              <Dropdown.Section>
                <Header>{CHROME.switchOperator}</Header>
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
        {prompt}
      </div>
    </header>
  )
}

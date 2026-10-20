import { Dropdown, Header, Label, Pagination, Popover } from '@heroui/react'
import { Button, CheckboxField, IconButton, NumberField, SegmentedField, SwitchField, Text } from '@/atoms'
import { LIST } from '@/copy'

/**
 * The list controls every library tab shows (stable 1.1, 05_STUDIO_DESIGN.md
 * §20), in the toolbar's order: Filters · Sort · Group — then, under the
 * list, the page footer. They only draw and report; `useListView` decides.
 * The shapes are structural so molecules import nothing from `host/`.
 */

export type ChangedWindow = 'any' | 'today' | '7d' | '30d'
export type FilterControlValue = readonly string[] | { readonly min: number; readonly max: number } | boolean | string
export interface FilterControl {
  readonly id: string
  readonly label: string
  readonly kind: 'multi' | 'choice' | 'range' | 'toggle'
  readonly options?: readonly { readonly value: string; readonly label: string }[]
  readonly bounds?: { readonly min: number; readonly max: number }
}

export interface FilterMenuProps {
  filters: readonly FilterControl[]
  values: Readonly<Record<string, FilterControlValue | null>>
  changed: ChangedWindow
  onChange(id: string, value: FilterControlValue | null): void
  onChanged(changed: ChangedWindow): void
  activeCount: number
  /** A line under the title, e.g. how many questions are incomplete. */
  hint?: string | undefined
}

const WINDOWS: readonly ChangedWindow[] = ['any', 'today', '7d', '30d']

function FilterField({ f, value, onChange }: { f: FilterControl; value: FilterControlValue | null | undefined; onChange: (v: FilterControlValue | null) => void }) {
  if (f.kind === 'toggle') {
    return <SwitchField label={f.label} isSelected={value === true} onChange={(on) => onChange(on ? true : null)} size="sm" />
  }
  if (f.kind === 'choice') {
    const options = [{ value: '', label: LIST.all }, ...(f.options ?? [])]
    return <SegmentedField label={f.label} value={typeof value === 'string' ? value : ''} onChange={(v) => onChange(v === '' ? null : v)} options={options} size="sm" />
  }
  if (f.kind === 'range') {
    const bounds = f.bounds ?? { min: 0, max: 100 }
    const range = value !== null && typeof value === 'object' && 'min' in value ? value : null
    const set = (min: number | null, max: number | null) =>
      onChange(min === null && max === null ? null : { min: min ?? bounds.min, max: max ?? bounds.max })
    return (
      <fieldset className="flex flex-col gap-1">
        <Text as="div" variant="studio-label">
          {f.label}
        </Text>
        <div className="flex gap-2">
          <NumberField label={`${f.label} from`} hideLabel value={range?.min ?? null} minValue={bounds.min} maxValue={bounds.max} onChange={(v) => set(v, range?.max ?? null)} />
          <NumberField label={`${f.label} to`} hideLabel value={range?.max ?? null} minValue={bounds.min} maxValue={bounds.max} onChange={(v) => set(range?.min ?? null, v)} />
        </div>
      </fieldset>
    )
  }
  const chosen = Array.isArray(value) ? (value as readonly string[]) : []
  return (
    <fieldset className="flex flex-col gap-1">
      <Text as="div" variant="studio-label">
        {f.label}
      </Text>
      {(f.options ?? []).map((o) => (
        <CheckboxField
          key={o.value}
          label={o.label}
          isSelected={chosen.includes(o.value)}
          onChange={(on) => {
            const next = on ? [...chosen, o.value] : chosen.filter((v) => v !== o.value)
            onChange(next.length === 0 ? null : next)
          }}
        />
      ))}
    </fieldset>
  )
}

/** One button, a popover of the tab's own filters and the shared *Changed* window. */
export function FilterMenu({ filters, values, changed, onChange, onChanged, activeCount, hint }: FilterMenuProps) {
  return (
    <Popover>
      <Button variant="secondary" size="sm" icon="filter">
        {activeCount > 0 ? `${LIST.filters} · ${activeCount}` : LIST.filters}
      </Button>
      <Popover.Content className="w-96" placement="bottom start">
        <Popover.Dialog aria-label={LIST.filters} className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
          <Popover.Heading>{LIST.filters}</Popover.Heading>
          {hint ? (
            <Text as="div" variant="studio-caption" tone="muted">
              {hint}
            </Text>
          ) : null}
          {filters.map((f) => (
            <FilterField key={f.id} f={f} value={values[f.id]} onChange={(v) => onChange(f.id, v)} />
          ))}
          <SegmentedField label={LIST.changed} value={changed} onChange={onChanged} options={WINDOWS.map((w) => ({ value: w, label: LIST.changedWindow[w] }))} size="sm" />
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}

export interface ActiveFiltersProps {
  items: readonly { readonly id: string; readonly label: string; readonly valueLabel: string }[]
  onRemove(id: string): void
  onClearAll(): void
}

/** The filters in force, under the toolbar: each removable, and *Clear all*. */
export function ActiveFilters({ items, onRemove, onClearAll }: ActiveFiltersProps) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2" data-active-filters>
      <ul aria-label={LIST.filters} className="flex flex-wrap items-center gap-2">
        {items.map((f) => {
          const label = f.valueLabel ? `${f.label}: ${f.valueLabel}` : f.label
          return (
            <li key={f.id} className="flex items-center gap-1 rounded-full border border-[var(--border)] py-0.5 pl-3 pr-1" style={{ background: 'var(--surface-secondary)' }}>
              <Text variant="studio-caption">{label}</Text>
              <IconButton icon="close" size="sm" label={LIST.removeFilter(label)} hideTooltip onPress={() => onRemove(f.id)} />
            </li>
          )
        })}
      </ul>
      <Button variant="tertiary" size="sm" onPress={onClearAll}>
        {LIST.clearAll}
      </Button>
    </div>
  )
}

export interface SortMenuProps {
  sorts: readonly { readonly id: string; readonly label: string }[]
  value: { readonly id: string; readonly desc: boolean }
  /** A field picked: the hook gives it its own default direction. */
  onField(id: string): void
  onDirection(desc: boolean): void
  /** While Search has text: *Best match* is offered (and chosen by the hook). */
  showMatch: boolean
}

/** Field, then direction — one menu. */
export function SortMenu({ sorts, value, onField, onDirection, showMatch }: SortMenuProps) {
  const fields = showMatch ? [{ id: 'match', label: LIST.bestMatch }, ...sorts] : sorts
  const current = fields.find((s) => s.id === value.id)?.label ?? LIST.sort
  return (
    <Dropdown>
      <Button variant="secondary" size="sm" icon="sort">
        {`${LIST.sort}: ${current}`}
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          aria-label={LIST.sort}
          selectionMode="single"
          selectedKeys={new Set([value.id, value.desc ? 'desc' : 'asc'])}
          onAction={(key) => {
            const k = String(key)
            if (k === 'asc' || k === 'desc') onDirection(k === 'desc')
            else if (k !== value.id) onField(k)
          }}
        >
          <Dropdown.Section>
            <Header>{LIST.sortBy}</Header>
            {fields.map((s) => (
              <Dropdown.Item key={s.id} id={s.id} textValue={s.label}>
                <Dropdown.ItemIndicator />
                <Label>{s.label}</Label>
              </Dropdown.Item>
            ))}
          </Dropdown.Section>
          {value.id === 'match' ? null : (
            <Dropdown.Section>
              <Header>{LIST.order}</Header>
              <Dropdown.Item id="asc" textValue={LIST.ascending}>
                <Dropdown.ItemIndicator />
                <Label>{LIST.ascending}</Label>
              </Dropdown.Item>
              <Dropdown.Item id="desc" textValue={LIST.descending}>
                <Dropdown.ItemIndicator />
                <Label>{LIST.descending}</Label>
              </Dropdown.Item>
            </Dropdown.Section>
          )}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}

export interface GroupMenuProps {
  groups: readonly { readonly id: string; readonly label: string }[]
  value: string | null
  onChange(group: string | null): void
}

/** *None* plus the tab's groupings; nothing at all on a tab that offers none. */
export function GroupMenu({ groups, value, onChange }: GroupMenuProps) {
  if (groups.length === 0) return null
  const current = groups.find((g) => g.id === value)?.label ?? LIST.groupNone
  return (
    <Dropdown>
      <Button variant="secondary" size="sm" icon="layout">
        {`${LIST.group}: ${current}`}
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu aria-label={LIST.group} selectionMode="single" selectedKeys={new Set([value ?? '~none'])} onAction={(key) => onChange(String(key) === '~none' ? null : String(key))}>
          {[{ id: '~none', label: LIST.groupNone }, ...groups].map((g) => (
            <Dropdown.Item key={g.id} id={g.id} textValue={g.label}>
              <Dropdown.ItemIndicator />
              <Label>{g.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}

/** Page links: first · last · current ±1, ellipses between (`1 … 4 5 6 … 30`). */
export function pageLinks(page: number, pageCount: number): readonly (number | 'gap')[] {
  if (pageCount <= 3) return []
  const want = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount))
  const sorted = [...want].sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) out.push('gap')
    out.push(p)
  })
  return out
}

export type PageSizeChoice = 50 | 100 | 250 | 'all'
const SIZES: readonly PageSizeChoice[] = [50, 100, 250, 'all']

export interface PageFooterProps {
  page: number
  pageCount: number
  /** `footerText`: "101–200 of 1,234 questions". */
  text: string
  pageSize: PageSizeChoice
  onPage(page: number): void
  onPageSize(size: PageSizeChoice): void
}

export function PageFooter({ page, pageCount, text, pageSize, onPage, onPageSize }: PageFooterProps) {
  if (text === '') return null
  return (
    <Pagination aria-label={LIST.pages} className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <Pagination.Summary>{text}</Pagination.Summary>
      <div className="flex items-center gap-3">
        <SegmentedField
          label={LIST.rowsPerPage}
          hideLabel
          value={String(pageSize)}
          onChange={(v) => onPageSize(v === 'all' ? 'all' : (Number(v) as PageSizeChoice))}
          options={SIZES.map((s) => ({ value: String(s), label: s === 'all' ? LIST.pageSizeAll : String(s) }))}
          size="sm"
        />
        <Pagination.Content>
          <Pagination.Item>
            <Pagination.Previous isDisabled={page <= 1} onPress={() => onPage(page - 1)} aria-label={LIST.previousPage}>
              <Pagination.PreviousIcon />
            </Pagination.Previous>
          </Pagination.Item>
          {pageLinks(page, pageCount).map((p, i) =>
            p === 'gap' ? (
              <Pagination.Item key={`gap-${i}`}>
                <Pagination.Ellipsis />
              </Pagination.Item>
            ) : (
              <Pagination.Item key={p}>
                <Pagination.Link isActive={p === page} {...(p === page ? { 'aria-current': 'page' as const } : {})} aria-label={LIST.page(p)} onPress={() => onPage(p)}>
                  {p}
                </Pagination.Link>
              </Pagination.Item>
            ),
          )}
          <Pagination.Item>
            <Pagination.Next isDisabled={page >= pageCount} onPress={() => onPage(page + 1)} aria-label={LIST.nextPage}>
              <Pagination.NextIcon />
            </Pagination.Next>
          </Pagination.Item>
        </Pagination.Content>
      </div>
    </Pagination>
  )
}

export interface GroupHeaderProps {
  label: string
  count: number
  continued: boolean
  collapsed: boolean
  onToggle(): void
}

/** A full-width header row: "History · 48", "(continued)" on a later page, a toggle. */
export function GroupHeader({ label, count, continued, collapsed, onToggle }: GroupHeaderProps) {
  return (
    <div role="heading" aria-level={3} className="flex h-10 items-center gap-2 border-b border-[var(--separator)] px-2" data-group-header>
      <IconButton icon={collapsed ? 'chevronRight' : 'chevronDown'} size="sm" label={collapsed ? LIST.showGroup(label) : LIST.hideGroup(label)} hideTooltip onPress={onToggle} />
      <Text variant="studio-label" tone="default">
        {LIST.groupHeader(label, count)}
      </Text>
      {continued ? (
        <Text variant="studio-caption" tone="muted">
          {LIST.continued}
        </Text>
      ) : null}
    </div>
  )
}

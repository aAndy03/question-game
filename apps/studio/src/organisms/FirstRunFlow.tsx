import { useState } from 'react'
import { Button, Panel, PinField, PIN_SHAPE, Text, TextField } from '@/atoms'
import { InlineNotice, PathRow, WizardSteps } from '@/molecules'
import { SETTINGS } from '@/copy/settings'
import { FIRST_RUN, type FirstRunStepId } from '@/copy/firstRun'
import { noticesAt, useNoticeStore } from '@/chrome/notices'
import { useHostCommand } from '@/host/commands'
import { useCatalogList, usePaths } from '@/host/queries'
import type { Operator, SeedDemo, SeedResult } from '@/host/types'
import { SettingsForm } from './SettingsForm'

export interface FirstRunFlowProps {
  /** Where to go when the wizard ends: Teams, or the Demo game if loaded. */
  onFinish(seededRecipeId: string | null): void
}

export interface FirstRunView {
  readonly steps: React.ReactNode
  readonly body: React.ReactNode
  readonly footer: React.ReactNode
}

const ORDER: readonly FirstRunStepId[] = ['paths', 'operator', 'sample', 'defaults']
const MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

/**
 * The four first-run steps (05_STUDIO_DESIGN.md §12.1): where things live →
 * the first Operator (cannot be skipped: required before Play, §2.27) → the
 * sample game → defaults. Progress is component state; a created operator is
 * a catalog row and stays created.
 *
 * Returns the three slots of `WizardLayout` so the page owns the template.
 */
export function useFirstRunFlow({ onFinish }: FirstRunFlowProps): FirstRunView {
  const run = useHostCommand()
  const paths = usePaths()
  const operators = useCatalogList('operator', 'active')
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)
  const [step, setStep] = useState<FirstRunStepId>('paths')
  const [done, setDone] = useState<FirstRunStepId[]>([])
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [seeded, setSeeded] = useState<string | null>(null)
  const operatorExists = (operators.data?.length ?? 0) > 0

  const advance = (from: FirstRunStepId) => {
    setDone((d) => (d.includes(from) ? d : [...d, from]))
    const next = ORDER[ORDER.indexOf(from) + 1]
    if (next) setStep(next)
    else onFinish(seeded)
  }

  const operatorId = `op-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'operator'}`
  const path = `operator.${operatorId}`
  const inline = noticesAt(notices, path)
  const pinOk = pin === '' || (PIN_SHAPE.test(pin) && pin === confirm)
  const canCreate = name.trim().length > 0 && pinOk && !pending

  const createOperator = async () => {
    setPending(true)
    const operator: Operator = {
      id: operatorId,
      displayName: name.trim(),
      pinHash: null,
      lastActiveAt: null,
      playsRun: 0,
      createdAt: 0,
      updatedAt: 0,
      archivedAt: null,
    }
    const saved = await run('catalog_upsert', { item: { kind: 'operator', item: operator } }, { targetPath: path })
    if (saved === null) {
      setPending(false)
      return
    }
    if (pin !== '') {
      const pinned = await run.ok('operator_set_pin', { id: operator.id, pin, currentPin: null }, { targetPath: `${path}.pin` })
      if (!pinned) {
        setPending(false)
        return
      }
    }
    // `operator_activate` answers `()`: the verdict, not the payload (§3.3).
    const active = await run.ok('operator_activate', { id: operator.id, pin: pin || null })
    setPending(false)
    if (!active) return
    advance('operator')
  }

  const loadDemo = async (pick: SeedDemo) => {
    setPending(true)
    // Both sample games go in; the one picked is the one first run opens (§17.5).
    const en = await run<SeedResult>('catalog_seed_demo', { demo: 'en', mode: 'missing' })
    const ro = en ? await run<SeedResult>('catalog_seed_demo', { demo: 'ro', mode: 'missing' }) : null
    setPending(false)
    const picked = pick === 'en' ? en : ro
    if (en && ro && picked) {
      setSeeded(picked.recipeId)
      advance('sample')
    }
  }

  const steps = <WizardSteps steps={FIRST_RUN.steps} current={step} done={done} label={FIRST_RUN.stepsLabel} />

  let body: React.ReactNode
  let footer: React.ReactNode
  switch (step) {
    case 'paths':
      body = (
        <Panel className="flex flex-col gap-4">
          <Heading title={FIRST_RUN.paths.title} body={FIRST_RUN.paths.body} />
          {paths.data ? (
            <div className="flex flex-col divide-y divide-[var(--separator)]">
              <PathRow label={SETTINGS.paths.userData} path={paths.data.userData} onReveal={() => void run('paths_reveal', { which: 'userData' })} />
              <PathRow label={SETTINGS.paths.catalog} path={paths.data.catalog} />
              <PathRow label={SETTINGS.paths.cuePack} path={paths.data.cuePack} onReveal={() => void run('paths_reveal', { which: 'cuePack' })} />
            </div>
          ) : null}
          <Text variant="studio-caption" tone="muted">
            {SETTINGS.paths.reveal(MAC)}
          </Text>
        </Panel>
      )
      footer = (
        <Button variant="primary" onPress={() => advance('paths')}>
          {FIRST_RUN.next}
        </Button>
      )
      break
    case 'operator':
      body = (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (canCreate) void createOperator()
          }}
        >
          <Panel className="flex flex-col gap-4">
            <Heading title={FIRST_RUN.operator.title} body={FIRST_RUN.operator.body} />
            {inline
              .filter((n) => !n.targetPath?.startsWith(`${path}.`))
              .map((n) => (
                <InlineNotice key={n.id} notice={n} onAction={() => dismiss(n.id)} onDismiss={() => dismiss(n.id)} compact />
              ))}
            <TextField label={FIRST_RUN.operator.displayName} description={FIRST_RUN.operator.displayNameHint} value={name} onChange={setName} isRequired autoFocus error={inline.find((n) => n.targetPath === `${path}.name`)?.detail.message ?? null} />
            <div className="grid grid-cols-2 gap-3">
              <PinField label={SETTINGS.pin.label} description={SETTINGS.pin.hint} value={pin} onChange={setPin} error={pin !== '' && !PIN_SHAPE.test(pin) ? SETTINGS.pin.invalid : (inline.find((n) => n.targetPath === `${path}.pin`)?.detail.message ?? null)} />
              <PinField label={SETTINGS.pin.confirm} value={confirm} onChange={setConfirm} error={confirm !== '' && confirm !== pin ? SETTINGS.pin.mismatch : null} isDisabled={pin === ''} />
            </div>
            <Text variant="studio-caption" tone="muted">
              {SETTINGS.pin.optional}
            </Text>
          </Panel>
        </form>
      )
      footer = (
        <>
          <Button variant="tertiary" isDisabled disabledReason={FIRST_RUN.required}>
            {FIRST_RUN.skip}
          </Button>
          {operatorExists ? (
            <Button variant="primary" onPress={() => advance('operator')}>
              {FIRST_RUN.next}
            </Button>
          ) : (
            <Button variant="primary" onPress={() => void createOperator()} isDisabled={!canCreate} isPending={pending}>
              {FIRST_RUN.operator.create}
            </Button>
          )}
        </>
      )
      break
    case 'sample':
      body = (
        <Panel className="flex flex-col gap-4">
          <Heading title={FIRST_RUN.sample.title} body={FIRST_RUN.sample.body} />
          <Text variant="studio-caption" tone="muted">
            {FIRST_RUN.sample.skipHint}
          </Text>
        </Panel>
      )
      footer = (
        <>
          <Button variant="tertiary" onPress={() => advance('sample')} isDisabled={pending}>
            {FIRST_RUN.skip}
          </Button>
          <Button variant="secondary" icon="games" onPress={() => void loadDemo('ro')} isPending={pending}>
            {FIRST_RUN.sample.loadRo}
          </Button>
          <Button variant="primary" icon="games" onPress={() => void loadDemo('en')} isPending={pending}>
            {FIRST_RUN.sample.load}
          </Button>
        </>
      )
      break
    case 'defaults':
      body = (
        <>
          <Heading title={FIRST_RUN.defaults.title} body={FIRST_RUN.defaults.body} />
          <SettingsForm groups={['award', 'timer', 'reveal']} compact />
          <Text variant="studio-caption" tone="muted">
            {FIRST_RUN.defaults.skipHint}
          </Text>
        </>
      )
      footer = (
        <>
          <Button variant="tertiary" onPress={() => onFinish(seeded)}>
            {FIRST_RUN.skip}
          </Button>
          <Button variant="primary" onPress={() => advance('defaults')}>
            {FIRST_RUN.finish}
          </Button>
        </>
      )
      break
  }

  return { steps, body, footer }
}

function Heading({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Text as="h2" variant="studio-title">
        {title}
      </Text>
      <Text as="p" variant="studio-body" tone="muted">
        {body}
      </Text>
    </div>
  )
}

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Panel, SegmentedField, Text } from '@/atoms'
import { WizardLayout } from '@/templates'
import { BETA_WELCOME } from '@/copy/beta'
import { WHATS_NEW_LANGUAGE_NAME, WHATS_NEW_LANGUAGES, type WhatsNewLanguage } from '@/copy/whatsNew'
import { command, type HostError } from '@/host/host'
import { keys, useBetaWelcome, useSettings } from '@/host/queries'

export interface BetaWelcomePageProps {
  /** Told once, when the operator has chosen: `App` unlatches. */
  onDone: () => void
}

/**
 * questiongame Beta's first launch (P13.1, 05_STUDIO_DESIGN.md §19): in the
 * first-run frame, before first run. One sentence — Beta keeps its own
 * library — then *Copy my stable library* or *Start empty*. A copy brings an
 * operator along, so first run does not follow it; *Start empty* leads into
 * first run. A refusal is said here, inline: the shell, and its notice
 * collector, are not up yet.
 */
export function BetaWelcomePage({ onDone }: BetaWelcomePageProps) {
  const welcome = useBetaWelcome()
  const settings = useSettings()
  const client = useQueryClient()
  const [chosen, setChosen] = useState<WhatsNewLanguage | null>(null)
  const language: WhatsNewLanguage = chosen ?? settings.data?.globals.game_defaults.language ?? 'en'
  const copy = BETA_WELCOME[language]
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<HostError | null>(null)
  // A second press lands before React re-renders the first as busy.
  const pressed = useRef(false)

  const stable = refusal?.code === 'beta.stable_running' ? 'running' : (welcome.data?.stable ?? 'missing')
  const failed = refusal !== null && refusal.code !== 'beta.stable_running'

  const finish = async (name: 'beta_copy_stable_library' | 'beta_welcome_done') => {
    if (pressed.current) return
    pressed.current = true
    setBusy(true)
    try {
      await command(name)
      // A copy is a different library: every cached read — operators, settings,
      // the welcome itself — is stale, and first run reads them next.
      if (name === 'beta_copy_stable_library') await client.invalidateQueries()
      onDone()
    } catch (error) {
      const e = error as HostError
      // Work already in the library means a copy already landed (CMD18).
      if (e.code === 'beta.library_not_empty') {
        await client.invalidateQueries()
        onDone()
        return
      }
      setRefusal(e)
      pressed.current = false
      setBusy(false)
    }
  }

  const tryAgain = async () => {
    setRefusal(null)
    await client.invalidateQueries({ queryKey: keys.betaWelcome })
  }

  return (
    <WizardLayout
      brand={copy.title}
      steps={
        <SegmentedField
          label={copy.language}
          hideLabel
          value={language}
          onChange={setChosen}
          options={WHATS_NEW_LANGUAGES.map((value) => ({ value, label: WHATS_NEW_LANGUAGE_NAME[value] }))}
        />
      }
      footer={
        <>
          {stable === 'running' || failed ? (
            <Button variant="secondary" onPress={() => void tryAgain()} isDisabled={busy}>
              {copy.tryAgain}
            </Button>
          ) : null}
          <Button variant={stable === 'missing' ? 'primary' : 'secondary'} onPress={() => void finish('beta_welcome_done')} isDisabled={busy}>
            {copy.empty}
          </Button>
          {stable === 'missing' ? null : (
            <Button
              variant="primary"
              onPress={() => void finish('beta_copy_stable_library')}
              isPending={busy}
              disabledReason={stable === 'running' ? copy.running : null}
            >
              {copy.copy}
            </Button>
          )}
        </>
      }
    >
      <Panel className="flex flex-col gap-4">
        <Text as="h1" variant="studio-heading">
          {copy.heading}
        </Text>
        <Text as="p" variant="studio-body">
          {copy.body}
        </Text>
        <div role="status" aria-live="polite">
          {stable === 'running' ? (
            <Text as="p" variant="studio-body" tone="warning">
              {copy.running}
            </Text>
          ) : null}
          {failed ? (
            <Text as="p" variant="studio-body" tone="danger">
              {copy.failed(refusal.message)}
            </Text>
          ) : null}
        </div>
      </Panel>
    </WizardLayout>
  )
}

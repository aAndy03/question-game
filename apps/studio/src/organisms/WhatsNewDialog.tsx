import { useState } from 'react'
import { Modal } from '@heroui/react'
import { Button, SegmentedField, Text } from '@/atoms'
import { useWhatsNewStore } from '@/chrome/whatsNew'
import {
  WHATS_NEW_COPY,
  WHATS_NEW_LANGUAGE_NAME,
  WHATS_NEW_LANGUAGES,
  type WhatsNewLanguage,
} from '@/copy/whatsNew'
import { useHostCommand } from '@/host/commands'
import { useSettings } from '@/host/queries'

/**
 * *What's new* (P12.10): what changed for the operator, in plain words, in
 * either language the app speaks. Opens itself once after an update and from
 * Settings ▸ About; closing the first records it as seen.
 *
 * The language starts as the one new games are made in — the operator's own,
 * most likely — and the switch changes only this window.
 */
export function WhatsNewDialog() {
  const open = useWhatsNewStore((s) => s.open)
  const close = useWhatsNewStore((s) => s.close)
  const settings = useSettings()
  const run = useHostCommand()
  const [chosen, setChosen] = useState<WhatsNewLanguage | null>(null)
  const language: WhatsNewLanguage = chosen ?? settings.data?.globals.game_defaults.language ?? 'en'
  const copy = WHATS_NEW_COPY[language]

  const done = () => {
    if (open?.markSeen) void run('whats_new_seen')
    close()
  }

  if (!open || open.releases.length === 0) return null
  const newest = open.releases[0]!

  return (
    <Modal.Backdrop isOpen onOpenChange={(isOpen) => !isOpen && done()}>
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog aria-label={WHATS_NEW_COPY.en.title(newest.version)}>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{copy.title(newest.version)}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-5">
            <SegmentedField
              label={copy.language}
              hideLabel
              value={language}
              onChange={setChosen}
              options={WHATS_NEW_LANGUAGES.map((value) => ({ value, label: WHATS_NEW_LANGUAGE_NAME[value] }))}
            />
            {open.releases.map((release) => (
              <section key={release.version} className="flex flex-col gap-4">
                {open.releases.length > 1 ? (
                  <Text as="div" variant="studio-label" tone="muted">
                    {release.version}
                  </Text>
                ) : null}
                <ul className="flex flex-col gap-4">
                  {release.notes[language].map((note) => (
                    <li key={note.title} className="flex flex-col gap-1">
                      <Text as="div" variant="studio-heading">
                        {note.title}
                      </Text>
                      <Text as="div" variant="studio-body" tone="muted">
                        {note.body}
                      </Text>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="primary" onPress={done}>
              {copy.close}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

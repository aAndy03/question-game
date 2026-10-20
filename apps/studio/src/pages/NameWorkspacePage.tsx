import { useRef, useState } from 'react'
import { Button, Panel, Text, TextField } from '@/atoms'
import { WizardLayout } from '@/templates'
import { APP } from '@/copy'
import { WORKSPACE } from '@/copy/workspaces'
import { command, type HostError } from '@/host/host'
import { useWorkspaces } from '@/host/queries'

export interface NameWorkspacePageProps {
  /**
   * `create`: a library with nothing in it — the operator is making their
   * first workspace. `name`: a library that moved into a workspace (1.x, or a
   * copy of the stable library) and only needs its name.
   */
  mode: 'create' | 'name'
  /** Told once the name is stored: `App` unlatches. */
  onDone: () => void
}

/**
 * The workspace the library is in has no name yet (Beta 2.0), so Studio asks
 * before anything else in the shell: one empty field, no placeholder, no
 * suggestion, and *Continue* waits for a name. The host stores it on the
 * workspace that is already there — a fresh library and a migrated one take
 * the same path.
 */
export function NameWorkspacePage({ mode, onDone }: NameWorkspacePageProps) {
  const workspaces = useWorkspaces()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pressed = useRef(false)
  const current = workspaces.data?.current

  const submit = async () => {
    if (pressed.current || !name.trim() || !current) return
    pressed.current = true
    setBusy(true)
    try {
      await command('workspace_rename', { id: current, name })
      onDone()
    } catch (e) {
      setError((e as HostError).message.replace(/^[^:]*:\s*/, ''))
      pressed.current = false
      setBusy(false)
    }
  }

  return (
    <WizardLayout
      brand={APP.name}
      steps={<Text variant="studio-caption" tone="muted">{WORKSPACE.switcher}</Text>}
      footer={
        <Button variant="primary" onPress={() => void submit()} isPending={busy} isDisabled={!name.trim() || !current}>
          {WORKSPACE.continue}
        </Button>
      }
    >
      <Panel className="flex flex-col gap-4" data-name-workspace={mode}>
        <Text as="h1" variant="studio-heading">
          {mode === 'create' ? WORKSPACE.createTitle : WORKSPACE.nameTitle}
        </Text>
        <Text as="p" variant="studio-body">
          {mode === 'create' ? WORKSPACE.createBody : WORKSPACE.nameBody}
        </Text>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <TextField
            label={WORKSPACE.nameLabel}
            value={name}
            onChange={(v) => {
              setName(v)
              setError(null)
            }}
            error={error}
            autoFocus
            maxLength={60}
            isRequired
          />
        </form>
      </Panel>
    </WizardLayout>
  )
}

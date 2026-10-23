import { IconButton } from '@/atoms'
import { useControlLayoutStore } from '@/chrome/control'
import { toast } from '@/chrome/toast'
import { CHROME, CONTROL } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { useSettings } from '@/host/queries'
import { SettingsFloat } from './SettingsFloat'

/**
 * Stage audio, *Reset layout* and the Control settings float — in the top
 * bar beside the theme and the operator while Control is open (P21.4; on
 * Control's own strip until then, with the display pickers that moved to the
 * status bar's displays).
 */
export function ControlTools() {
  const settings = useSettings()
  const run = useHostCommand()
  const resetLayout = useControlLayoutStore((s) => s.resetLayout)
  const muted = settings.data?.control.audio.muted ?? false

  return (
    <div className="flex items-center gap-1" data-control-tools>
      <IconButton
        icon={muted ? 'volumeMuted' : 'volume'}
        label={muted ? CHROME.unmute : CHROME.mute}
        size="sm"
        onPress={() => void run('settings_set_global', { setting: { key: 'audio_muted', value: !muted } })}
      />
      <IconButton
        icon="layout"
        label={CONTROL.resetLayout}
        size="sm"
        onPress={() => {
          resetLayout()
          toast.info(CONTROL.resetLayout)
        }}
      />
      <SettingsFloat />
    </div>
  )
}

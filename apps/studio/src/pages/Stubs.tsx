import { Panel, Text } from '@/atoms'
import { PageHeader } from '@/molecules'
import { BlankLayout } from '@/templates'
import { STUB, TABS } from '@/copy'

function Stub({ body }: { body: string }) {
  return (
    <Panel variant="secondary">
      <Text variant="studio-body" tone="muted">
        {body}
      </Text>
    </Panel>
  )
}

export function ScreensPage() {
  return (
    <BlankLayout header={<PageHeader title={TABS.screens.label} description={TABS.screens.hint} />}>
      <Stub body={STUB.screens.body} />
    </BlankLayout>
  )
}

export function StatisticsPage() {
  return (
    <BlankLayout header={<PageHeader title={TABS.statistics.label} description={TABS.statistics.hint} />}>
      <Stub body={STUB.statistics.body} />
    </BlankLayout>
  )
}

export function SettingsPage() {
  return (
    <BlankLayout header={<PageHeader title={TABS.settings.label} description={TABS.settings.hint} />}>
      <Stub body={STUB.settings.body} />
    </BlankLayout>
  )
}

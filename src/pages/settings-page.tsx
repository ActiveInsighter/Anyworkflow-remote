import { Page, PageHeader } from '@/components/layout/page'
import { SettingsDirectory } from '@/features/settings/components/settings-directory'

export function SettingsPage() {
  return (
    <Page width="detail">
      <PageHeader title="设置" />
      <SettingsDirectory />
    </Page>
  )
}

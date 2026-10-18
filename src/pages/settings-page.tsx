import { Page, PageHeader } from '@/components/layout/page'
import { useSession } from '@/lib/api/session'
import { RuntimeDefaultsCard } from '@/features/runtime-config/components/runtime-defaults-card'
import { AppearanceCard } from '@/features/settings/components/appearance-card'
import { ConnectionCard } from '@/features/settings/components/connection-card'
import { ShortcutsCard } from '@/features/settings/components/shortcuts-card'

export function SettingsPage() {
  const session = useSession()
  return (
    <Page>
      <PageHeader title="设置" description="管理后端连接与界面偏好。" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {session ? <RuntimeDefaultsCard key={`${session.baseUrl}:${session.record.id}`} /> : null}
          <ConnectionCard />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <AppearanceCard />
          <ShortcutsCard />
        </div>
      </div>
    </Page>
  )
}

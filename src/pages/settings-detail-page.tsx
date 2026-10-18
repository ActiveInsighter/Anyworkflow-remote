import { Link, useParams } from 'react-router'
import { Page, PageHeader } from '@/components/layout/page'
import { buttonVariants } from '@/components/ui/button'
import { useSession } from '@/lib/api/session'
import { RuntimeDefaultsCard } from '@/features/runtime-config/components/runtime-defaults-card'
import { AppearanceCard } from '@/features/settings/components/appearance-card'
import { ConnectionCard } from '@/features/settings/components/connection-card'
import { ShortcutsCard } from '@/features/settings/components/shortcuts-card'

export function RuntimeSettingsPage() {
  const session = useSession()
  return (
    <Page width="detail">
      <PageHeader title="运行配置" description="用于新建 Run；已有 Run 保留各自的配置。" />
      {session ? (
        <RuntimeDefaultsCard key={`${session.baseUrl}:${session.record.id}`} />
      ) : (
        <div className="flex flex-col items-start gap-4 rounded-xl border p-5">
          <p className="text-sm text-muted-foreground">连接账号后设置默认运行配置。</p>
          <Link className={buttonVariants({ variant: 'outline' })} to="/settings/connection">
            前往连接
          </Link>
        </div>
      )}
    </Page>
  )
}
export function SettingsDetailPage() {
  const { section } = useParams()
  const title =
    section === 'appearance' ? '外观' : section === 'connection' ? '连接' : section === 'shortcuts' ? '快捷键' : '设置'
  return (
    <Page width="detail">
      <PageHeader title={title} />
      {section === 'appearance' ? (
        <AppearanceCard />
      ) : section === 'connection' ? (
        <ConnectionCard />
      ) : section === 'shortcuts' ? (
        <ShortcutsCard />
      ) : (
        <Link to="/settings">返回设置</Link>
      )}
    </Page>
  )
}

import { PlugZap } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import { EmptyState } from '@/components/feedback/empty-state'
import { Page } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/api/session'

/**
 * Gate for every backend-backed route. Keyed by account so switching accounts remounts the
 * subtree and no state or cache from the previous owner survives.
 */
export function RequireSession() {
  const session = useSession()
  if (session) return <Outlet key={session.record.id} />

  return (
    <Page>
      <EmptyState
        icon={PlugZap}
        title="未连接"
        description="连接 AnyWorkflow 后即可访问工作流与资料库。"
        action={
          <Button asChild variant="secondary">
            <Link to="/settings">设置连接</Link>
          </Button>
        }
      />
    </Page>
  )
}

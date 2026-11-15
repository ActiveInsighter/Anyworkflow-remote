import { Page, PageHeader } from '@/components/layout/page'
import { ModelLibrary } from '@/features/models/components/model-library'
import { useSession } from '@/lib/api/session'
import { Link } from 'react-router'

export function ModelsPage() {
  const session = useSession()
  return (
    <Page width="focus">
      <PageHeader title="模型库" />
      {session ? (
        <ModelLibrary key={`${session.baseUrl}:${session.record.id}`} />
      ) : (
        <Link to="/settings/connection">连接账号后管理模型</Link>
      )}
    </Page>
  )
}

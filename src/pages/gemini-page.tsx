import { Page } from '@/components/layout/page'
import { GeminiWorkspace } from '@/features/gemini/components/gemini-workspace'
import { useSession } from '@/lib/api/session'

export function GeminiPage() {
  const session = useSession()
  return <Page width="focus"><GeminiWorkspace key={`${session?.baseUrl}:${session?.record.id}`} /></Page>
}

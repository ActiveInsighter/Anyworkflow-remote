import { Page, PageHeader } from '@/components/layout/page'
import { GeminiWorkspace } from '@/features/gemini/components/gemini-workspace'
import { useSession } from '@/lib/api/session'

export function GeminiPage() {
  const session = useSession()
  return <Page width="focus"><PageHeader compact title="Gemini 消息" description="直接提问，或将 Markdown 分段并发发送。回复自动保存。" /><GeminiWorkspace key={`${session?.baseUrl}:${session?.record.id}`} /></Page>
}

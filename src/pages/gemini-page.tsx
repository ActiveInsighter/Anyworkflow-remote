import { GeminiWorkspace } from '@/features/gemini/components/gemini-workspace'
import { useSession } from '@/lib/api/session'

export function GeminiPage() {
  const session = useSession()
  return <GeminiWorkspace key={`${session?.baseUrl}:${session?.record.id}`} />
}

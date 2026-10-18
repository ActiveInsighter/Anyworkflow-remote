import { useLocation } from 'react-router'
import { useSession } from '@/lib/api/session'
import { RunEditor } from '@/features/run-editor/components/run-editor'

export function RunEditorPage() {
  const location = useLocation()
  const session = useSession()
  // Remount per edit target and session so local drafts and async loads cannot leak across Runs.
  const key = `${session?.baseUrl || ''}:${session?.record.id || ''}${location.pathname}${location.search}`
  return <RunEditor key={key} />
}

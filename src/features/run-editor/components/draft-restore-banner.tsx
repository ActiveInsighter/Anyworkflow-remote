import { History } from 'lucide-react'
import { Alert, AlertActions, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import type { EditorDraft } from '../lib/editor-draft'

/** Offers an autosaved local draft. Legacy drafts carry no backend, so they ask for confirmation. */
export function DraftRestoreBanner({
  draft,
  legacy,
  onRestore,
  onDiscard,
}: {
  draft: EditorDraft
  legacy: boolean
  onRestore: () => void
  onDiscard: () => void
}) {
  return (
    <Alert variant="info" size="sm" className="mb-2 shrink-0">
      <History aria-hidden="true" />
      <AlertDescription>
        <span className="block truncate">本地草稿 · {formatDateTime(new Date(draft.savedAt).toISOString())}</span>
        {legacy ? <span className="block text-muted-foreground">旧版草稿未记录后端地址，请确认属于当前后端后恢复。</span> : null}
      </AlertDescription>
      <AlertActions>
        <Button size="sm" variant="secondary" onClick={onRestore}>
          恢复
        </Button>
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          丢弃
        </Button>
      </AlertActions>
    </Alert>
  )
}

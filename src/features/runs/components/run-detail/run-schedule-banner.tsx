import { CalendarClock, Play, XCircle, Zap } from 'lucide-react'
import { Alert, AlertActions, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { DispatchRunRecord } from '@/types'
import type { useRunDetailActions } from '../../hooks/use-run-detail-actions'

/** Shown while a Run waits for its scheduled start. Drafts can still run early; queued Runs can cancel. */
export function RunScheduleBanner({
  run,
  absolute,
  relative,
  actions,
}: {
  run: DispatchRunRecord
  absolute: string
  relative: string
  actions: ReturnType<typeof useRunDetailActions>
}) {
  return (
    <Alert variant="info" size="sm">
      <CalendarClock aria-hidden="true" />
      <AlertDescription className="truncate">
        {absolute} · {relative}
      </AlertDescription>
      <AlertActions>
        {run.status === 'draft' ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => actions.publish(false)} disabled={actions.busy}>
              <Play data-icon="inline-start" />
              按计划运行
            </Button>
            <Button size="sm" variant="outline" onClick={() => actions.publish(true)} disabled={actions.busy}>
              <Zap data-icon="inline-start" />
              立即运行
            </Button>
          </>
        ) : (
          <Button size="sm" variant="destructive" onClick={() => actions.command('cancel')} disabled={actions.busy}>
            <XCircle data-icon="inline-start" />
            取消执行
          </Button>
        )}
      </AlertActions>
    </Alert>
  )
}

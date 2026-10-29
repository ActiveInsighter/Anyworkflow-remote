import { Play, Save, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { describeSchedule } from '@/lib/domain/schedule'
import { cn } from '@/lib/utils'
import type { RunEditorModel } from '../hooks/use-run-editor'
import { SchedulePopover } from './schedule-popover'

/** Bottom bar: runtime config and schedule on the left, save and run on the right. */
export function RunEditorActionBar({ editor }: { editor: RunEditorModel }) {
  const { schedule, saving, blocked, runtime } = editor
  const pending = describeSchedule(editor.scheduleEditable ? schedule.scheduledAt : '', new Date(editor.now)).pending
  const runtimeNeedsAttention = Boolean(runtime.error) || runtime.invalid

  return (
    <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 pt-1">
      {editor.editingTemplate ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="relative h-10 px-2.5 sm:px-3"
              aria-label="运行配置"
              onClick={() => editor.setRuntimeOpen(true)}
            >
              <SlidersHorizontal data-icon="inline-start" />
              <span className="hidden sm:inline">运行配置</span>
              {runtimeNeedsAttention ? (
                <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-danger" aria-hidden="true" />
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{runtimeNeedsAttention ? '运行配置需要处理' : '模型、超时与等待等运行配置'}</TooltipContent>
        </Tooltip>
      )}
      {editor.scheduleEditable ? (
        <SchedulePopover
          schedule={schedule}
          now={editor.now}
          open={editor.scheduleOpen}
          onOpenChange={editor.setScheduleOpen}
        />
      ) : null}

      <div className="ms-auto flex min-w-0 items-center gap-2">
        {editor.editingTemplate ? (
          <Button variant="secondary" className="h-10" onClick={() => void editor.persist(false)} disabled={blocked}>
            {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            {saving ? '保存中…' : '保存模板'}
          </Button>
        ) : (
          <>
            <Button variant="outline" className="h-10" onClick={() => void editor.persist(false)} disabled={blocked}>
              <Save data-icon="inline-start" />
              <span className="sm:hidden">保存</span>
              <span className="hidden sm:inline">保存草稿</span>
            </Button>
            <Button
              className={cn('h-10', editor.errorCount > 0 && 'opacity-80')}
              onClick={() => void editor.persist(true)}
              disabled={blocked}
            >
              {saving ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" />}
              {schedule.mode === 'daily' ? '启用重复' : pending ? '安排' : '运行'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

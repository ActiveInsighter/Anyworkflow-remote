import { Play, Save, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { describeSchedule } from '@/lib/domain/schedule'
import type { RunEditorModel } from '../hooks/use-run-editor'
import { SchedulePopover } from './schedule-popover'

/** Bottom bar: runtime config and schedule on the left, save and run on the right. */
export function RunEditorActionBar({ editor }: { editor: RunEditorModel }) {
  const { schedule, saving, blocked } = editor
  const templateEditing = editor.target.templateMode === 'edit'
  const pending = describeSchedule(editor.scheduleEditable ? schedule.scheduledAt : '', new Date(editor.now)).pending

  return (
    <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 pt-1">
      {!templateEditing ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="size-10"
              aria-label="运行配置"
              onClick={() => editor.setRuntimeOpen(true)}
            >
              <SlidersHorizontal />
            </Button>
          </TooltipTrigger>
          <TooltipContent>运行配置</TooltipContent>
        </Tooltip>
      ) : null}
      {editor.scheduleEditable ? (
        <SchedulePopover
          schedule={schedule}
          now={editor.now}
          open={editor.scheduleOpen}
          onOpenChange={editor.setScheduleOpen}
        />
      ) : null}

      <div className="ms-auto flex min-w-0 items-center gap-2">
        {templateEditing ? (
          <Button
            variant="secondary"
            className="h-10"
            onClick={() => void editor.persist(false)}
            disabled={saving || editor.errorCount > 0}
          >
            <Save data-icon="inline-start" />
            {saving ? '保存中…' : '保存模板'}
          </Button>
        ) : (
          <>
            <Button variant="outline" className="h-10" onClick={() => void editor.persist(false)} disabled={blocked}>
              <Save data-icon="inline-start" />
              <span className="sm:hidden">保存</span>
              <span className="hidden sm:inline">保存草稿</span>
            </Button>
            <Button className="h-10" onClick={() => void editor.persist(true)} disabled={blocked}>
              <Play data-icon="inline-start" />
              {schedule.mode === 'daily' ? '启用重复' : pending ? '安排' : '运行'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

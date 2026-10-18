import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { describeSchedule } from '@/lib/domain/schedule'
import type { ScheduleState } from '../hooks/use-schedule-state'
import { SchedulePicker } from './schedule-picker'

/** Execution-time control in the editor action bar; the trigger shows the current choice. */
export function SchedulePopover({
  schedule,
  now,
  open,
  onOpenChange,
}: {
  schedule: ScheduleState
  now: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const summary = describeSchedule(schedule.scheduledAt, new Date(now))
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-10 shrink-0 px-2.5 text-xs"
          title={summary.pending ? `${summary.absolute} · ${summary.relative}` : '设置执行时间'}
        >
          <CalendarClock data-icon="inline-start" />
          {schedule.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="flex max-h-[min(36rem,calc(100dvh-6rem))] w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-4 overflow-y-auto"
      >
        <PopoverHeader>
          <PopoverTitle>执行计划</PopoverTitle>
          <PopoverDescription className="text-xs">选择立即、定时、延时，或每天重复执行。</PopoverDescription>
        </PopoverHeader>
        <SchedulePicker
          mode={schedule.mode}
          recurrence={schedule.recurrence}
          onRecurrenceChange={schedule.changeRecurrence}
          value={schedule.pickerValue}
          onModeChange={schedule.changeMode}
          onValueChange={schedule.changeValue}
          delayAmount={schedule.delayAmount}
          delayUnit={schedule.delayUnit}
          onDelayAmountChange={(amount) => schedule.changeDelay(amount)}
          onDelayUnitChange={(unit) => schedule.changeDelay(schedule.delayAmount, unit)}
          now={now}
        />
        <Button variant="secondary" className="self-end" onClick={() => onOpenChange(false)}>
          完成
        </Button>
      </PopoverContent>
    </Popover>
  )
}

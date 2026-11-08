import { AppWindow, Cloud, type LucideIcon } from 'lucide-react'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { CrawlRunner } from '@/types/crawl'
import { RUNNER_LABELS } from '../lib/crawl-display'

const RUNNER_ICONS: Record<CrawlRunner, LucideIcon> = { cloud: Cloud, browser: AppWindow }

function help(runner: CrawlRunner, online: boolean): string {
  if (runner === 'cloud') return '在 GitHub Actions 里匿名打开，免费，适合公开页面。'
  return online ? '在你的浏览器里打开，使用它已登录的账号。' : '在你的浏览器里打开。扩展现在不在线，任务会排队等它上线。'
}

/** Where a crawl runs. The choice matters (a login or not), so both stay in view. */
export function RunnerField({
  id,
  value,
  onChange,
  online,
}: {
  id: string
  value: CrawlRunner
  onChange: (runner: CrawlRunner) => void
  /** Whether a browser extension is online. */
  online: boolean
}) {
  return (
    <Field>
      <FieldLabel id={`${id}-label`}>执行位置</FieldLabel>
      <ToggleGroup
        type="single"
        variant="segmented"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next as CrawlRunner)
        }}
        className="h-touch w-full sm:h-10"
      >
        {(['cloud', 'browser'] as const).map((runner) => {
          const Icon = RUNNER_ICONS[runner]
          return (
            <ToggleGroupItem key={runner} value={runner} className="gap-1.5 text-body">
              <Icon aria-hidden="true" />
              {RUNNER_LABELS[runner]}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
      <FieldDescription id={`${id}-help`} className={cn(value === 'browser' && !online && 'text-warning')}>
        {help(value, online)}
      </FieldDescription>
    </Field>
  )
}

/** The runner as a fact in a record's line: an icon and its name. */
export function RunnerTag({ runner }: { runner: CrawlRunner }) {
  const Icon = RUNNER_ICONS[runner]
  return (
    <span className="inline-flex items-center gap-1">
      <Icon aria-hidden="true" className="size-3.5" />
      {RUNNER_LABELS[runner]}
    </span>
  )
}

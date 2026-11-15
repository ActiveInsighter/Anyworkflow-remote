import { ChartNoAxesColumn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import type { GeminiMessage } from '@/types/gemini'

const fields = [
  ['promptTokenCount', '输入'],
  ['candidatesTokenCount', '输出'],
  ['thoughtsTokenCount', '思考'],
  ['toolUseTokenCount', '工具'],
  ['cachedContentTokenCount', '缓存'],
  ['agentStepCount', 'Agent 步骤'],
] as const

export function GeminiUsage({ usage }: { usage: GeminiMessage['usage'] }) {
  if (!usage?.totalTokenCount) return null
  return <Popover>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="touch"><ChartNoAxesColumn /><span className="text-caption tabular-nums">{usage.totalTokenCount.toLocaleString()} Token · 明细</span></Button>
    </PopoverTrigger>
    <PopoverContent align="start">
      <PopoverHeader><PopoverTitle>用量明细</PopoverTitle></PopoverHeader>
      <dl className="mt-4 flex flex-col gap-2 text-body tabular-nums">
        {fields.map(([key, label]) => usage[key] != null ? <div key={key} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd>{usage[key].toLocaleString()}</dd></div> : null)}
      </dl>
    </PopoverContent>
  </Popover>
}

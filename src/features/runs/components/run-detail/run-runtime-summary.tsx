import { ChevronRight } from 'lucide-react'
import { DescriptionList } from '@/components/data-display/description-list'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { DispatchRunRecord } from '@/types'

/** Browser runtime settings frozen on this Run; collapsed by default. */
export function RunRuntimeSummary({ run }: { run: DispatchRunRecord }) {
  const config = run.runtimeConfig?.browser
  return (
    <Collapsible className="group/runtime">
      <CollapsibleTrigger className="-mx-1 flex min-h-touch items-center gap-1 rounded-md px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 transition-transform duration-fast group-data-[state=open]/runtime:rotate-90"
        />
        运行配置
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-1">
        {config ? (
          <DescriptionList
            columns={3}
            items={[
              { label: '回复超时', value: `${config.replyTimeoutMinutes} 分钟` },
              {
                label: '随机等待',
                value: config.randomWait.enabled
                  ? `${config.randomWait.minSeconds}–${config.randomWait.maxSeconds} 秒${config.deferredReply.enabled ? '（并发期间停用）' : ''}`
                  : '关闭',
              },
              {
                label: '并发投递后回收',
                value: config.deferredReply.enabled ? `延迟 ${config.deferredReply.delayMinutes} 分钟` : '关闭',
              },
            ]}
          />
        ) : (
          <p className="text-xs text-muted-foreground">使用浏览器本地配置。</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

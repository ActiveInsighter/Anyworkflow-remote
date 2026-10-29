import type * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { DescriptionList } from '@/components/data-display/description-list'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { RUNTIME_PAGES } from '@/lib/domain/runtime-pages'
import { resolvePageRuntimeConfig } from '@/lib/domain/runtime-config'
import type { DispatchRunRecord } from '@/types'

const SITE_LABELS = { chatgpt: 'ChatGPT', chatgptCloud: 'ChatGPT Cloud', claude: 'Claude' } as const

function selectionText(selection: { model: string | null; reasoningEffort: string | null }) {
  if (!selection.model && !selection.reasoningEffort) return '站点默认'
  return [selection.model ?? '默认模型', selection.reasoningEffort].filter(Boolean).join(' · ')
}

/** Browser runtime settings frozen on this Run; collapsed by default. `aside` shares the trigger row. */
export function RunRuntimeSummary({ run, aside }: { run: DispatchRunRecord; aside?: React.ReactNode }) {
  const config = run.runtimeConfig?.browser
  const models = run.runtimeConfig?.modelSelection
  return (
    <Collapsible>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <CollapsibleTrigger className="group/runtime -mx-1 flex min-h-touch items-center gap-1 rounded-md px-1 text-xs text-muted-foreground transition-colors duration-fast outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8">
          <ChevronRight
            aria-hidden="true"
            className="size-3.5 transition-transform duration-base ease-standard group-data-[state=open]/runtime:rotate-90"
          />
          运行配置
        </CollapsibleTrigger>
        {aside}
      </div>
      <CollapsibleContent className="animate-disclosure">
        <div className="pt-2 pb-1">
        {config ? (
          <DescriptionList
            columns={3}
            items={
              run.runtimeConfig?.schemaVersion === 4
                ? [
                    { label: '默认开始链接', value: run.runtimeConfig.defaultStartUrl ?? 'https://chatgpt.com/' },
                    ...RUNTIME_PAGES.map((link) => {
                      const page = resolvePageRuntimeConfig(run.runtimeConfig!, link.url)
                      const browser = page.browser
                      return {
                        label: link.label,
                        value: `${browser.replyTimeoutMinutes} 分钟 · ${selectionText(page.modelSelection)} · ${browser.randomWait.enabled ? `等待 ${browser.randomWait.minSeconds}–${browser.randomWait.maxSeconds} 秒` : '不等待'}${browser.deferredReply.enabled ? ` · 异步回收 ${browser.deferredReply.delayMinutes} 分钟` : ''}`,
                      }
                    }),
                  ]
                : [
                    { label: '回复超时', value: `${config.replyTimeoutMinutes} 分钟` },
                    { label: '异步回收', value: config.deferredReply.enabled ? `${config.deferredReply.delayMinutes} 分钟后自动回收` : '关闭' },
                    {
                      label: '随机等待',
                      value: config.randomWait.enabled
                        ? `${config.randomWait.minSeconds}–${config.randomWait.maxSeconds} 秒`
                        : '关闭',
                    },
                    ...(models
                      ? (Object.keys(SITE_LABELS) as (keyof typeof SITE_LABELS)[]).flatMap((site) =>
                          models[site]
                            ? [{ label: `${SITE_LABELS[site]} 模型`, value: selectionText(models[site]) }]
                            : [],
                        )
                      : []),
                    ...(run.runtimeConfig?.defaultStartUrl
                      ? [{ label: '默认开始链接', value: run.runtimeConfig.defaultStartUrl }]
                      : []),
                  ]
            }
          />
        ) : (
          <p className="text-xs text-muted-foreground">使用浏览器本地配置。</p>
        )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

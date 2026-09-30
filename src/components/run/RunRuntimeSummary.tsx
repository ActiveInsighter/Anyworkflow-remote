import type { DispatchRunRecord } from '@/types'

export function RunRuntimeSummary({ run }: { run: DispatchRunRecord }) {
  const config = run.runtimeConfig?.browser
  return (
    <details className="mt-3 border-t border-border pt-3 text-xs">
      <summary className="min-h-8 cursor-pointer text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">运行配置</summary>
      {config ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 py-2 sm:max-w-lg">
          <dt className="text-muted-foreground">回复超时</dt><dd>{config.replyTimeoutMinutes} 分钟</dd>
          <dt className="text-muted-foreground">随机等待</dt><dd>{config.randomWait.enabled ? `${config.randomWait.minSeconds}–${config.randomWait.maxSeconds} 秒${config.deferredReply.enabled ? '（并发期间停用）' : ''}` : '关闭'}</dd>
          <dt className="text-muted-foreground">并发投递后回收</dt><dd>{config.deferredReply.enabled ? `延迟 ${config.deferredReply.delayMinutes} 分钟` : '关闭'}</dd>
        </dl>
      ) : <p className="py-2 text-muted-foreground">使用浏览器本地配置。</p>}
    </details>
  )
}

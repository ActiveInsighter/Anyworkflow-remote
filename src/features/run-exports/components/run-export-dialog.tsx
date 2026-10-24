import { Archive, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import type { DispatchRunRecord } from '@/types'
import { useRunExports } from '../hooks/use-run-exports'
import { RunExportItem } from './run-export-item'

export function RunExportDialog({ run, open, onOpenChange, returnFocus }: {
  run: DispatchRunRecord; open: boolean; onOpenChange: (open: boolean) => void; returnFocus: () => void
}) {
  const state = useRunExports(run.id, open)
  const { jobs, action } = state
  const terminal = ['succeeded', 'failed', 'canceled'].includes(run.status)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }}>
        <DialogHeader>
          <DialogTitle>导出 AI 对话</DialogTitle>
          <DialogDescription className="break-words">将当前 Run 的对话整理为 Markdown，打包为 ZIP。</DialogDescription>
        </DialogHeader>
        <form className="flex min-w-0 flex-col gap-4" onSubmit={event => { event.preventDefault(); state.create() }}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="run-export-content">导出内容</FieldLabel>
              <NativeSelect id="run-export-content" name="contentMode" value={state.contentMode} onChange={event => {
                const value = event.target.value
                if (value === 'conversation' || value === 'assistant') state.setContentMode(value)
              }} disabled={action.busy}>
                <NativeSelectOption value="conversation">完整对话（提问和 AI 回复）</NativeSelectOption>
                <NativeSelectOption value="assistant">仅 AI 回复</NativeSelectOption>
              </NativeSelect>
              <FieldDescription>按 Task、Event、Act 整理，保留原会话链接。下载文件保留 7 天。</FieldDescription>
            </Field>
          </FieldGroup>
          {!terminal ? <p className="text-xs text-muted-foreground">Run 尚未结束，将导出当前已同步的内容。</p> : null}
          <ErrorAlert>{action.error}</ErrorAlert>
          <Button type="submit" className="w-full" disabled={action.busy || state.active || jobs.loading || Boolean(jobs.error)}>
            {action.pending === 'create' ? <Spinner aria-hidden="true" data-icon="inline-start" /> : <Archive aria-hidden="true" data-icon="inline-start" />}
            {action.pending === 'create' ? '正在提交…' : state.active ? '正在导出，请稍候' : '生成 ZIP'}
          </Button>
        </form>
        <Separator />
        <section className="flex min-w-0 flex-col gap-1" aria-label="导出记录">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">导出记录</h3>
            <Button variant="ghost" size="icon-touch" aria-label="刷新导出记录" disabled={jobs.refreshing} onClick={() => void jobs.reload()}>
              <RefreshCw aria-hidden="true" />
            </Button>
          </div>
          <ErrorAlert>{jobs.error}</ErrorAlert>
          {jobs.loading ? <Skeleton className="h-20 w-full" /> : null}
          {jobs.data?.items.map(job => (
            <RunExportItem key={job.id} job={job} busy={action.busy} downloading={action.pending === `download:${job.id}`} onDownload={() => state.download(job)} />
          ))}
          {!jobs.loading && !jobs.error && !jobs.data?.items.length ? (
            <Empty className="min-h-0 border-0 px-0 py-3"><EmptyHeader><EmptyDescription>暂无导出记录</EmptyDescription></EmptyHeader></Empty>
          ) : null}
          {jobs.data && jobs.data.totalPages > 1 ? (
            <nav aria-label="导出记录分页" className="flex items-center justify-between gap-2 pt-2">
              <Button variant="outline" size="icon-touch" aria-label="上一页导出记录" disabled={state.page <= 1 || jobs.refreshing} onClick={() => state.setPage(state.page - 1)}><ChevronLeft aria-hidden="true" /></Button>
              <span className="text-xs text-muted-foreground">{state.page} / {jobs.data.totalPages}</span>
              <Button variant="outline" size="icon-touch" aria-label="下一页导出记录" disabled={state.page >= jobs.data.totalPages || jobs.refreshing} onClick={() => state.setPage(state.page + 1)}><ChevronRight aria-hidden="true" /></Button>
            </nav>
          ) : null}
        </section>
      </DialogContent>
    </Dialog>
  )
}

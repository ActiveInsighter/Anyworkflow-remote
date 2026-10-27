import { Archive, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import { Modal, ModalBody, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '@/components/ui/modal'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { isTerminalStatus } from '@/lib/domain/run-status'
import type { DispatchRunRecord } from '@/types'
import { useRunExports } from '../hooks/use-run-exports'
import { RunExportItem } from './run-export-item'

/** Export sheet for one Run: choose the content, follow progress and download earlier ZIPs. */
export function RunExportDialog({ run, open, onOpenChange, returnFocus }: {
  run: DispatchRunRecord; open: boolean; onOpenChange: (open: boolean) => void; returnFocus: () => HTMLElement | null | undefined
}) {
  const state = useRunExports(run.id, open)
  const { jobs, action } = state
  const terminal = isTerminalStatus(run.status)
  return (
    <Modal open={open} onOpenChange={next => onOpenChange(next)}>
      <ModalContent size="md" finalFocus={() => returnFocus() ?? true}>
        <ModalHeader>
          <ModalTitle>导出 AI 对话</ModalTitle>
          <ModalDescription className="text-muted-foreground">将当前 Run 的对话整理为 Markdown，打包为 ZIP。</ModalDescription>
        </ModalHeader>
        <ModalBody className="flex min-w-0 flex-col gap-5">
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
                <FieldDescription>按 Task、Event、Act 命名，省略单项目录。保留原会话链接，文件保存 7 天。</FieldDescription>
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
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

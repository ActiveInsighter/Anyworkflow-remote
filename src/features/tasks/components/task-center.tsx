import { useState, type ComponentProps } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle, ModalToolbar } from '@/components/ui/modal'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { useTaskCenter } from '../hooks/use-task-center'
import { TaskRow } from './task-row'

function TaskSection({ title, empty, items, onNavigate }: { title: string; empty: string; items: ReturnType<typeof useTaskCenter>['items']; onNavigate: () => void }) {
  return (
    <section aria-label={title}>
      <h3 className="px-2.5 pb-1 text-caption font-medium text-muted-foreground">{title}</h3>
      {items.length ? (
        <div className="flex flex-col">
          {items.map((item) => <TaskRow key={item.key} item={item} onNavigate={onNavigate} />)}
        </div>
      ) : (
        <p className="px-2.5 py-3 text-body text-muted-foreground">{empty}</p>
      )}
    </section>
  )
}

function TaskCenterPanel({ onNavigate }: { onNavigate: () => void }) {
  const { active, recent, error } = useTaskCenter()
  return (
    <div className="flex flex-col gap-4">
      <ErrorAlert inline>{error}</ErrorAlert>
      <TaskSection title={`进行中 · ${active.length}`} empty="没有进行中的任务" items={active} onNavigate={onNavigate} />
      <TaskSection title="最近 24 小时" empty="最近没有完成的任务" items={recent.slice(0, 10)} onNavigate={onNavigate} />
    </div>
  )
}

function RefreshButton() {
  const { reload, loading } = useTaskCenter()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="刷新任务"
      disabled={busy || loading}
      onClick={async () => {
        setBusy(true)
        try { await reload() } finally { setBusy(false) }
      }}
    >
      <RefreshCw className={cn(busy && 'animate-spin')} />
    </Button>
  )
}

/** The activity indicator: a count of running work that pulses while anything is in flight. */
function TriggerContent({ count }: { count: number }) {
  return (
    <>
      <span className="relative grid size-4 place-items-center">
        {count ? <Spinner className="size-4 text-primary" aria-hidden="true" /> : <Activity className="size-4" aria-hidden="true" />}
      </span>
      <span className="hidden sm:inline">任务</span>
      {count ? (
        <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-primary px-1 font-mono text-micro font-medium text-primary-foreground tabular-nums">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </>
  )
}

/**
 * Every async task in one place - Runs, conversions and exports - from the top bar. A popover on
 * wide screens; the shared bottom sheet on phones.
 */
export function TaskCenter() {
  const { active } = useTaskCenter()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const label = active.length ? `任务中心，${active.length} 个进行中` : '任务中心'
  const trigger = (props: ComponentProps<typeof Button>) => (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      className={cn('h-9 gap-1.5 rounded-full px-2.5 text-muted-foreground hover:text-foreground', active.length && 'text-foreground')}
      {...props}
    >
      <TriggerContent count={active.length} />
    </Button>
  )

  if (isMobile) {
    return (
      <>
        {trigger({ onClick: () => setOpen(true) })}
        <Modal open={open} onOpenChange={setOpen}>
          <ModalContent size="sm">
            <ModalHeader>
              <ModalTitle>任务</ModalTitle>
              <ModalToolbar aria-label="任务操作"><RefreshButton /></ModalToolbar>
            </ModalHeader>
            <ModalBody>
              <TaskCenterPanel onNavigate={close} />
            </ModalBody>
          </ModalContent>
        </Modal>
      </>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger({})}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="flex max-h-[min(36rem,calc(100dvh-6rem))] w-[26rem] flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div>
            <h2 className="text-sm font-semibold">任务</h2>
            <p className="text-caption text-muted-foreground">工作流、文件转换与对话导出</p>
          </div>
          <RefreshButton />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          <TaskCenterPanel onNavigate={close} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

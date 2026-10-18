import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { RuntimeConfig } from '@/lib/domain/runtime-config'
import { RuntimeConfigFields } from '@/features/runtime-config/components/runtime-config-fields'
import type { RuntimeConfigState } from '../hooks/use-runtime-config-state'

/** Per-Run runtime settings. Stays a modal: it edits several linked values before returning. */
export function RuntimeConfigDialog({
  open,
  onOpenChange,
  runtime,
  locked,
  disabled,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  runtime: RuntimeConfigState
  locked: boolean
  disabled: boolean
  onChange: (config: RuntimeConfig) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>运行配置</DialogTitle>
          <DialogDescription>{locked ? '重跑和恢复沿用原 Run 配置。' : '仅应用于这个 Run。'}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-0.5">
          {runtime.loading ? (
            <LoadingState />
          ) : runtime.config ? (
            <RuntimeConfigFields value={runtime.config} disabled={disabled || locked} onChange={onChange} />
          ) : (
            <p className="text-sm text-muted-foreground">此 Run 使用浏览器本地配置。</p>
          )}
          <ErrorAlert inline>{runtime.error}</ErrorAlert>
        </div>
        <DialogFooter className="shrink-0">
          {!locked ? (
            <Button variant="outline" disabled={disabled || runtime.loading} onClick={runtime.reloadDefaults}>
              使用当前默认配置
            </Button>
          ) : null}
          <Button variant="secondary" disabled={runtime.loading || runtime.invalid} onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

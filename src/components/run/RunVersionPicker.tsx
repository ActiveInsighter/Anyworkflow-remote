import { Check, ChevronDown, ChevronLeft, ChevronRight, GitBranch, Search } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { StatusBadge } from '@/components/app/ui'
import { formatDateTime, runStatusMeta } from '@/lib/format'
import type { DispatchRunRecord } from '@/types'

export function RunVersionPicker({
  versions,
  currentId,
  onSelect,
}: {
  versions: readonly DispatchRunRecord[]
  currentId: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ordered = [...versions].sort((a, b) => a.versionNumber - b.versionNumber)
  const index = ordered.findIndex((version) => version.id === currentId)
  const current = ordered[index]
  if (!current || ordered.length < 2) return null
  const latest = ordered[ordered.length - 1]
  const filtered = [...ordered]
    .reverse()
    .filter((version) =>
      `${version.title} v${version.versionMajor}.${version.versionMinor}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
  function choose(id: string) {
    onSelect(id)
    setOpen(false)
  }
  return (
    <div
      aria-label="Run 版本"
      className="my-3 flex min-w-0 items-center gap-1 rounded-lg border border-border bg-card p-1"
    >
      <Button
        size="icon"
        variant="ghost"
        className="size-11 shrink-0"
        aria-label="上一个版本"
        disabled={index <= 0}
        onClick={() => onSelect(ordered[index - 1].id)}
      >
        <ChevronLeft />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          if (value) setQuery('')
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            className="h-11 min-w-0 flex-1 justify-between gap-2 px-2"
            aria-label="选择 Run 版本"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <GitBranch className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                v{current.versionMajor}.{current.versionMinor}
              </span>
            </span>
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              {index + 1} / {ordered.length}
              <ChevronDown className="size-4" />
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>选择版本</DialogTitle>
            <DialogDescription>{ordered.length} 个版本，按创建时间从新到旧排列。</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
            <Input
              aria-label="搜索版本"
              placeholder="搜索版本号或名称"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 ps-10"
            />
          </div>
          {currentId !== latest.id ? (
            <Button variant="secondary" onClick={() => choose(latest.id)}>
              查看最新版本 v{latest.versionMajor}.{latest.versionMinor}
            </Button>
          ) : null}
          <div
            role="group"
            aria-label="版本列表"
            className="max-h-[50dvh] overflow-y-auto overscroll-contain"
          >
            {filtered.map((version) => {
              const selected = version.id === currentId
              const status = runStatusMeta(version.status)
              return (
                <button
                  key={version.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => choose(version.id)}
                  className={`flex min-h-20 w-full items-center gap-3 rounded-md border-b border-border px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected ? 'bg-accent' : 'hover:bg-muted/60'}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      v{version.versionMajor}.{version.versionMinor}
                      {selected ? <Check className="size-4" /> : null}
                      {version.id === latest.id ? (
                        <span className="text-xs font-normal text-muted-foreground">最新</span>
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-sm">{version.title || '未命名 Run'}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatDateTime(version.created || version.updated)} ·{' '}
                      {version.origin === 'rerun'
                        ? '完整重跑'
                        : version.origin === 'resume'
                          ? '恢复'
                          : version.origin === 'edited_rerun'
                            ? '编辑副本'
                            : '初始版本'}
                    </span>
                  </span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </button>
              )
            })}
            {!filtered.length ? (
              <p role="status" className="py-6 text-center text-sm text-muted-foreground">
                没有匹配的版本
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <Button
        size="icon"
        variant="ghost"
        className="size-11 shrink-0"
        aria-label="下一个版本"
        disabled={index < 0 || index >= ordered.length - 1}
        onClick={() => onSelect(ordered[index + 1].id)}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}

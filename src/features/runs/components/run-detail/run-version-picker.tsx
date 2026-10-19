import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, GitBranch } from 'lucide-react'
import { StatusBadge } from '@/components/data-display/status-badge'
import { SearchField } from '@/components/form/search-field'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { runOriginLabel, runStatusMeta, runTitle, runVersionLabel } from '@/lib/domain/run-status'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DispatchRunRecord } from '@/types'

/**
 * Steps through a Run's version family. Prev/next for adjacent versions; the popover searches
 * the whole family, newest first. Hidden when the family has a single version. Borderless: it
 * sits in the summary card's footer row.
 */
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
  const ordered = useMemo(() => [...versions].sort((a, b) => a.versionNumber - b.versionNumber), [versions])
  const index = ordered.findIndex((version) => version.id === currentId)
  const current = ordered[index]
  if (!current || ordered.length < 2) return null

  const latest = ordered[ordered.length - 1]
  const needle = query.trim().toLowerCase()
  const filtered = [...ordered]
    .reverse()
    .filter((version) => `${version.title} ${runVersionLabel(version)}`.toLowerCase().includes(needle))

  function choose(id: string) {
    onSelect(id)
    setOpen(false)
  }

  return (
    <div role="group" aria-label="Run 版本" className="-me-2 flex min-w-0 items-center gap-0.5">
      <Button
        size="icon-touch"
        variant="ghost"
        aria-label="上一个版本"
        disabled={index <= 0}
        onClick={() => onSelect(ordered[index - 1].id)}
      >
        <ChevronLeft />
      </Button>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) setQuery('')
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="ghost" size="touch" className="min-w-0 gap-2 px-2" aria-label="选择 Run 版本">
            <GitBranch className="text-muted-foreground" aria-hidden="true" />
            <span className="truncate font-mono">{runVersionLabel(current)}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {index + 1}/{ordered.length}
            </span>
            <ChevronDown className="text-muted-foreground" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="flex max-h-(--radix-popover-content-available-height) w-[min(28rem,calc(100vw-1.5rem))] flex-col gap-2 p-2"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <SearchField
            size="touch"
            label="搜索版本"
            placeholder="搜索版本号或名称"
            value={query}
            onValueChange={setQuery}
            className="[&_input]:text-base sm:[&_input]:text-sm"
          />
          {currentId !== latest.id ? (
            <Button variant="secondary" size="touch" onClick={() => choose(latest.id)}>
              查看最新版本 {runVersionLabel(latest)}
            </Button>
          ) : null}
          <div
            role="group"
            aria-label="版本列表"
            className="max-h-[min(50dvh,24rem)] min-h-0 flex-1 overflow-y-auto overscroll-contain"
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
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    selected ? 'bg-accent' : 'hover:bg-muted/60',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-mono text-sm font-semibold">
                      {runVersionLabel(version)}
                      {selected ? <Check className="size-4" aria-hidden="true" /> : null}
                      {version.id === latest.id ? (
                        <span className="font-sans text-xs font-normal text-muted-foreground">最新</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-sm">{runTitle(version)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatDateTime(version.created || version.updated)} · {runOriginLabel(version.origin)}
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
        </PopoverContent>
      </Popover>
      <Button
        size="icon-touch"
        variant="ghost"
        aria-label="下一个版本"
        disabled={index < 0 || index >= ordered.length - 1}
        onClick={() => onSelect(ordered[index + 1].id)}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}

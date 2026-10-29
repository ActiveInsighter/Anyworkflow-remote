import { useEffect, useRef } from 'react'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { START_LINK_LIMITS, type StartLink } from '@/lib/domain/start-links'
import { cn } from '@/lib/utils'
import type { StartLinksDraft } from '../hooks/use-start-links-draft'

function StartLinkRow({
  link,
  index,
  count,
  draft,
}: {
  link: StartLink
  index: number
  count: number
  draft: StartLinksDraft
}) {
  const labelRef = useRef<HTMLInputElement>(null)
  const errors = draft.errorsFor(link.id)
  const labelId = `start-link-${link.id}-label`
  const urlId = `start-link-${link.id}-url`

  useEffect(() => {
    if (draft.focusId === link.id) labelRef.current?.focus()
  }, [draft.focusId, link.id])

  return (
    <li
      className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_auto] sm:items-start sm:gap-3"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) draft.touch(link.id)
      }}
    >
      <div className="min-w-0">
        <label htmlFor={labelId} className="sr-only">
          第 {index + 1} 个链接的名称
        </label>
        <Input
          ref={labelRef}
          id={labelId}
          value={link.label}
          placeholder="名称"
          maxLength={START_LINK_LIMITS.maxLabel * 2}
          aria-invalid={errors.label ? true : undefined}
          onChange={(event) => draft.update(link.id, { label: event.target.value })}
        />
        <FieldError className="mt-1">{errors.label}</FieldError>
      </div>
      <div className="min-w-0">
        <label htmlFor={urlId} className="sr-only">
          第 {index + 1} 个链接的地址
        </label>
        <Input
          id={urlId}
          value={link.url}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://"
          className="font-mono text-xs md:text-xs"
          aria-invalid={errors.url ? true : undefined}
          onChange={(event) => draft.update(link.id, { url: event.target.value })}
        />
        <FieldError className="mt-1">{errors.url}</FieldError>
      </div>
      <div className="flex items-center justify-end gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label={`上移「${link.label || '未命名'}」`}
          disabled={index === 0}
          onClick={() => draft.move(link.id, -1)}
        >
          <ArrowUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label={`下移「${link.label || '未命名'}」`}
          disabled={index === count - 1}
          onClick={() => draft.move(link.id, 1)}
        >
          <ArrowDown />
        </Button>
        <Button
          type="button"
          variant="ghost-destructive"
          size="icon-touch"
          aria-label={`删除「${link.label || '未命名'}」`}
          onClick={() => draft.remove(link.id)}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}

/**
 * Edits the account's start links in place: rename, change the address, reorder, add, delete.
 * Nothing is written until 保存; the parent owns the draft so it can guard closing.
 */
export function StartLinksEditor({ draft, className }: { draft: StartLinksDraft; className?: string }) {
  if (draft.loading) return <LoadingState />
  return (
    <div className={cn('flex min-w-0 flex-col gap-4', className)}>
      {draft.loadError ? (
        <ErrorAlert inline>无法同步快捷链接：{draft.loadError}。当前显示本机缓存。</ErrorAlert>
      ) : null}
      {draft.rows.length ? (
        <ol aria-label="快捷链接" className="divide-y overflow-hidden rounded-lg border bg-card">
          {draft.rows.map((link, index) => (
            <StartLinkRow key={link.id} link={link} index={index} count={draft.rows.length} draft={draft} />
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          还没有快捷链接
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="touch" disabled={draft.full} onClick={() => draft.add()}>
          <Plus data-icon="inline-start" />
          添加链接
        </Button>
        <Button type="button" variant="ghost" size="touch" onClick={draft.resetToDefaults}>
          <RotateCcw data-icon="inline-start" />
          恢复默认
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {draft.rows.length} / {START_LINK_LIMITS.maxLinks}
        </span>
        <div className="ms-auto flex items-center gap-2">
          {draft.dirty ? (
            <Button type="button" variant="ghost" size="touch" disabled={draft.saving} onClick={draft.discard}>
              放弃修改
            </Button>
          ) : null}
          <Button type="button" size="touch" disabled={!draft.dirty || draft.saving} onClick={() => void draft.save()}>
            {draft.saving ? <Spinner data-icon="inline-start" /> : null}
            保存
          </Button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Check, ChevronDown, Globe, Plus, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { displayStartUrl as displayUrl } from '@/lib/domain/start-links'
import { keepEditorFocus, useToolbarMenuFocus } from '../hooks/use-editor-focus'
import type { StartLinkOption } from '../lib/dsl-completion'

export interface StartPageState {
  /** The cursor is inside a Task. */
  inTask: boolean
  /** That Task's current `start_url` value, or null when it declares none. */
  url: string | null
}

/**
 * Sets the `start_url` of the Task at the cursor from the account's start links. The state is
 * read when the menu opens, so it always describes the Task the cursor is in right now.
 */
export function StartPageMenu({
  links,
  readState,
  onPick,
  onAddLink,
  onManage,
}: {
  links: readonly StartLinkOption[]
  readState: () => StartPageState
  onPick: (url: string) => void
  /** Saves the Task's current address as a new start link; omitted when saving is unavailable. */
  onAddLink?: (url: string) => void
  onManage?: () => void
}) {
  const [state, setState] = useState<StartPageState>({ inTask: false, url: null })
  const current = state.url?.trim() || null
  const known = current ? links.some((link) => link.url === current) : true
  const canAdd = Boolean(onAddLink && current && !known && /^https:\/\/\S+$/u.test(current))

  const { onCloseAutoFocus } = useToolbarMenuFocus()

  return (
    <DropdownMenu modal={false} onOpenChange={(open) => open && setState(readState())}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" onMouseDown={keepEditorFocus} className="h-touch shrink-0 gap-1.5 px-2.5 text-xs font-medium sm:h-8">
          <Globe aria-hidden="true" />
          起始页
          <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(22rem,calc(100vw-1.5rem))]" onCloseAutoFocus={onCloseAutoFocus}>
        <DropdownMenuLabel>{state.inTask ? '设为当前 Task 的 start_url' : '先把光标放到某个 Task 中'}</DropdownMenuLabel>
        {links.map((link) => {
          const selected = current === link.url
          return (
            <DropdownMenuItem key={link.url} disabled={!state.inTask} onSelect={() => onPick(link.url)}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{link.label}</span>
                <span className="truncate font-mono text-micro text-muted-foreground">{displayUrl(link.url)}</span>
              </span>
              {selected ? <Check className="text-primary" aria-label="当前" /> : null}
            </DropdownMenuItem>
          )
        })}
        {links.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">还没有快捷链接</p> : null}
        {canAdd || onManage ? <DropdownMenuSeparator /> : null}
        {canAdd && current ? (
          <DropdownMenuItem onSelect={() => onAddLink?.(current)}>
            <Plus aria-hidden="true" />
            <span className="min-w-0 truncate">添加 {displayUrl(current)} 到快捷链接</span>
          </DropdownMenuItem>
        ) : null}
        {onManage ? (
          <DropdownMenuItem onSelect={onManage}>
            <Settings2 aria-hidden="true" />
            管理快捷链接…
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

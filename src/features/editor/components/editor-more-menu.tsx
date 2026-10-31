import { Ellipsis } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { IS_APPLE_PLATFORM } from '@/lib/platform/keyboard'
import { keepEditorFocus, useToolbarMenuFocus } from '../hooks/use-editor-focus'
import { editorCommand, formatKey, type EditorCommandId } from '../lib/editor-command-registry'
import { EDITOR_FONT_SIZES, type EditorFontSize, type EditorPreferences } from '../lib/editor-preferences'
import { COMMAND_ICONS } from './command-icons'

const EDIT_ITEMS: EditorCommandId[] = ['clipboard.paste', 'structure.duplicate', 'insert.message', 'insert.link']
const FIND_ITEMS: EditorCommandId[] = ['find.search', 'find.complete']

function CommandItem({
  id,
  onRun,
  className,
}: {
  id: EditorCommandId
  onRun: (id: EditorCommandId) => void
  className?: string
}) {
  const command = editorCommand(id)
  const Icon = COMMAND_ICONS[id]
  return (
    <DropdownMenuItem onSelect={() => onRun(id)} className={className}>
      <Icon aria-hidden="true" />
      {command.label}
      {command.key ? <DropdownMenuShortcut>{formatKey(command.key, IS_APPLE_PLATFORM)}</DropdownMenuShortcut> : null}
    </DropdownMenuItem>
  )
}

/** Less frequent commands and the display preferences. */
export function EditorMoreMenu({
  readOnly,
  preferences,
  onPreferencesChange,
  onRun,
}: {
  readOnly: boolean
  preferences: EditorPreferences
  onPreferencesChange: (patch: Partial<EditorPreferences>) => void
  onRun: (id: EditorCommandId) => void
}) {
  const { onCloseAutoFocus } = useToolbarMenuFocus()
  return (
    // Not modal: a modal menu locks page scroll, and removing the scrollbar shifts the editor.
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="更多"
              onMouseDown={keepEditorFocus}
              className="h-touch min-w-9 flex-1 shrink-0 sm:size-8 sm:min-w-0 sm:flex-none"
            >
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">更多操作与显示设置</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-60" onCloseAutoFocus={onCloseAutoFocus}>
        {readOnly ? null : (
          <>
            <DropdownMenuGroup>
              {/* The toolbar hides 格式化 on phones. */}
              <CommandItem id="structure.format" onRun={onRun} className="sm:hidden" />
              {EDIT_ITEMS.map((id) => (
                <CommandItem key={id} id={id} onRun={onRun} />
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          {FIND_ITEMS.map((id) => (
            <CommandItem key={id} id={id} onRun={onRun} />
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>字号</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preferences.fontSize}
          onValueChange={(value) => onPreferencesChange({ fontSize: value as EditorFontSize })}
        >
          {EDITOR_FONT_SIZES.map((size) => (
            <DropdownMenuRadioItem key={size.value} value={size.value} onSelect={(event) => event.preventDefault()}>
              {size.label}
              <DropdownMenuShortcut>{size.px}px</DropdownMenuShortcut>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={preferences.lineWrap}
          onCheckedChange={(checked) => onPreferencesChange({ lineWrap: checked === true })}
          onSelect={(event) => event.preventDefault()}
        >
          自动换行
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={preferences.lineNumbers}
          onCheckedChange={(checked) => onPreferencesChange({ lineNumbers: checked === true })}
          onSelect={(event) => event.preventDefault()}
        >
          显示行号
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

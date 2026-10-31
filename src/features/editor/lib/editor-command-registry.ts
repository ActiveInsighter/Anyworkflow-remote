import { startCompletion } from '@codemirror/autocomplete'
import { isolateHistory, redo, undo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import type { EditorView, KeyBinding } from '@codemirror/view'
import { readClipboard, writeClipboard } from '../../../lib/platform/clipboard.ts'
import { collectWorkflowVariables } from '../../../lib/workflow-dsl/index.ts'
import { formatAnyWorkflowSource } from './dsl-format.ts'
import {
  planLoopInsert,
  planQueueLineInsert,
  planSelectBlock,
  planSmartCopy,
  planSmartDelete,
  planSmartDuplicate,
  planStructuredInsert,
  type LoopTemplate,
} from './editor-commands.ts'
import { flashRange } from './editor-flash.ts'
import { offsetForLineColumn } from './editor-helpers.ts'
import { EDITOR_COMMAND_META, type EditorCommandId, type EditorCommandMeta } from './editor-command-meta.ts'
import { planSetStartUrl } from './start-url.ts'

export { formatKey, type EditorCommandId } from './editor-command-meta.ts'

/**
 * Behaviour of every editor command. Names, hints and key bindings are in
 * `editor-command-meta.ts`; the toolbar, menus, CodeMirror keymap and the shortcuts page all read
 * that one list, so a command cannot have one label in the toolbar and another in the shortcut
 * list, or a binding nobody shows.
 *
 * Commands never touch UI: they return an outcome and the shell decides how to report it.
 */
export type CommandOutcome = { tone: 'success' | 'info' | 'error'; message: string; description?: string } | null

type CommandRun = (view: EditorView) => CommandOutcome | Promise<CommandOutcome>

export interface EditorCommand extends EditorCommandMeta {
  run: CommandRun
}

const info = (message: string): CommandOutcome => ({ tone: 'info', message })

/** Replace `from..to` with `text` as one undo step, then select `anchor..head`. */
function apply(view: EditorView, from: number, to: number, text: string, anchor: number, head = anchor): void {
  view.dispatch({
    changes: { from, to, insert: text },
    annotations: isolateHistory.of('full'),
    selection: { anchor, head },
    scrollIntoView: true,
  })
}

/** Text typed at the cursor, replacing the selection; `cursorOffset` places the caret inside it. */
export function insertAtCursor(view: EditorView, text: string, cursorOffset = text.length, selectionLength = 0): void {
  const selection = view.state.selection.main
  const offset = Math.max(0, Math.min(cursorOffset, text.length))
  const anchor = selection.from + offset
  apply(view, selection.from, selection.to, text, anchor, anchor + Math.max(0, Math.min(selectionLength, text.length - offset)))
}

function structured(kind: 'task' | 'event' | 'act' | 'variable') {
  return (view: EditorView): CommandOutcome => {
    const plan = planStructuredInsert(view.state.doc.toString(), view.state.selection.main.head, kind)
    if (!plan.ok) return info(plan.message)
    const anchor = plan.from + plan.cursorOffset
    apply(view, plan.from, plan.from, plan.text, anchor, anchor + (plan.selectionLength ?? 0))
    return null
  }
}

function loop(template: LoopTemplate) {
  return (view: EditorView): CommandOutcome => {
    const plan = planLoopInsert(view.state.doc.toString(), view.state.selection.main.head, template)
    if (!plan.ok) return info(plan.message)
    const anchor = plan.from + plan.cursorOffset
    apply(view, plan.from, plan.from, plan.text, anchor, anchor + plan.selectionLength)
    return null
  }
}

const RUNS: Record<EditorCommandId, CommandRun> = {
  'insert.task': structured('task'),
  'insert.event': structured('event'),
  'insert.act': structured('act'),
  'insert.loop': loop('range'),
  'insert.loop-list': loop('list'),
  'insert.loop-outline': loop('outline'),
  'insert.variable': structured('variable'),
  'insert.variable-ref': (view) => {
    const from = view.state.selection.main.from
    insertAtCursor(view, '%%', 1)
    if (collectWorkflowVariables(view.state.doc.toString(), from + 1).length === 0) return info('当前位置没有可用变量')
    startCompletion(view)
    return null
  },
  'insert.message': (view) => {
    insertAtCursor(view, '{\n\n}', 2)
    return null
  },
  'insert.wait': (view) => {
    const plan = planQueueLineInsert(view.state.doc.toString(), view.state.selection.main.head, '<sleep(5)>', '5')
    if (!plan.ok) return info(plan.message)
    const anchor = plan.from + plan.cursorOffset
    apply(view, plan.from, plan.from, plan.text, anchor, anchor + plan.selectionLength)
    return null
  },
  'insert.link': (view) => {
    insertAtCursor(view, '<>', 1)
    return null
  },
  'history.undo': (view) => {
    undo(view)
    return null
  },
  'history.redo': (view) => {
    redo(view)
    return null
  },
  'clipboard.paste': async (view) => {
    try {
      const text = await readClipboard()
      if (!text) return info('剪贴板为空')
      insertAtCursor(view, text)
      return { tone: 'success', message: '已粘贴到光标位置' }
    } catch {
      return { tone: 'error', message: '无法读取剪贴板', description: '请允许浏览器访问剪贴板，或使用系统粘贴快捷键。' }
    }
  },
  'clipboard.copy': async (view) => {
    const selection = view.state.selection.main
    const plan = planSmartCopy(view.state.doc.toString(), selection.from, selection.to)
    if (!plan.ok) return info(plan.message)
    if (!(await writeClipboard(plan.text))) {
      return { tone: 'error', message: '复制失败', description: '浏览器拒绝了剪贴板写入，请手动选择后复制。' }
    }
    flashRange(view, plan.from, plan.to)
    return { tone: 'success', message: plan.message }
  },
  'structure.select-block': (view) => {
    const selection = view.state.selection.main
    const plan = planSelectBlock(view.state.doc.toString(), selection.from, selection.to)
    if (!plan.ok) return info(plan.message)
    // Head at the start keeps the block's header in view on a phone.
    view.dispatch({ selection: { anchor: plan.to, head: plan.from }, scrollIntoView: true })
    return { tone: 'info', message: `已选择${plan.label}` }
  },
  'structure.duplicate': (view) => {
    const selection = view.state.selection.main
    const plan = planSmartDuplicate(view.state.doc.toString(), selection.from, selection.to)
    if (!plan.ok) return info(plan.message)
    apply(view, plan.from, plan.from, plan.text, plan.anchor)
    flashRange(view, plan.anchor, plan.from + plan.text.length)
    return { tone: 'success', message: plan.message }
  },
  'structure.delete': (view) => {
    const selection = view.state.selection.main
    const plan = planSmartDelete(view.state.doc.toString(), selection.from, selection.to)
    if (!plan.ok) return info(plan.message)
    apply(view, plan.from, plan.to, '', plan.from)
    return { tone: 'success', message: plan.message }
  },
  'structure.format': (view) => {
    const current = view.state.doc.toString()
    const next = formatAnyWorkflowSource(current)
    if (next === current) return info('格式已经整齐了')
    const head = view.state.selection.main.head
    const line = view.state.doc.lineAt(head)
    const anchor = offsetForLineColumn(next, line.number, head - line.from + 1)
    apply(view, 0, current.length, next, anchor)
    return null
  },
  'find.search': (view) => {
    openSearchPanel(view)
    return null
  },
  'find.complete': (view) => {
    startCompletion(view)
    return null
  },
}

const BY_ID = new Map<string, EditorCommand>(
  EDITOR_COMMAND_META.map((meta) => [meta.id, { ...meta, run: RUNS[meta.id] }]),
)

export function editorCommand(id: EditorCommandId): EditorCommand {
  return BY_ID.get(id)!
}

/**
 * Bindings owned by the registry. Bindings CodeMirror already provides (undo, redo, completion,
 * search) are documented here but left to the standard keymaps.
 */
export function registryKeymap(report: (outcome: CommandOutcome) => void): KeyBinding[] {
  const own: EditorCommandId[] = ['structure.duplicate', 'structure.select-block', 'structure.format']
  return own.map((id) => {
    const command = editorCommand(id)
    return {
      key: command.key!,
      preventDefault: true,
      run(view) {
        if (command.edits && view.state.readOnly) return false
        void Promise.resolve(command.run(view)).then(report)
        return true
      },
    }
  })
}

/** Sets the start page of the Task at the cursor (see `planSetStartUrl`). */
export function setTaskStartUrl(view: EditorView, url: string): CommandOutcome {
  const plan = planSetStartUrl(view.state.doc.toString(), view.state.selection.main.head, url)
  if (!plan.ok) return info(plan.message)
  apply(view, plan.from, plan.to, plan.insert, plan.cursor)
  return { tone: 'success', message: '已设置起始页' }
}

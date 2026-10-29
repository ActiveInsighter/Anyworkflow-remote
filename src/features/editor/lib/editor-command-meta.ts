/**
 * What every editor command is called, what it does and how it is bound. Pure data with no
 * CodeMirror import, so pages that only list commands (the shortcuts settings) do not load the
 * editor. Behaviour lives in `editor-command-registry.ts`, keyed by the same ids.
 */
export type EditorCommandGroup = 'insert' | 'history' | 'clipboard' | 'structure' | 'find'

export interface EditorCommandMeta {
  id: string
  label: string
  hint: string
  group: EditorCommandGroup
  /** CodeMirror key, e.g. `Mod-Shift-d`. */
  key?: string
  /** Changes the document, so read-only editors hide it. */
  edits: boolean
}

export const EDITOR_COMMAND_META = [
  { id: 'insert.task', label: 'Task', hint: '追加到 Run 最外层', group: 'insert', edits: true },
  { id: 'insert.event', label: 'Event', hint: '添加到光标所在 Task', group: 'insert', edits: true },
  { id: 'insert.act', label: 'Act', hint: '添加到光标所在 Event', group: 'insert', edits: true },
  { id: 'insert.loop', label: '循环', hint: '插入循环，嵌套时变量依次为 i、j、k，最多 3 层', group: 'insert', edits: true },
  { id: 'insert.variable', label: '变量', hint: '添加到光标所在 Task 的变量区', group: 'insert', edits: true },
  { id: 'insert.variable-ref', label: '使用变量', hint: '插入 %% 并选择当前位置可用变量', group: 'insert', edits: true },
  { id: 'insert.message', label: '消息块', hint: '插入 { }', group: 'insert', edits: true },
  { id: 'insert.wait', label: '等待', hint: '插入 <sleep(秒数)>，发送下一条前等待', group: 'insert', edits: true },
  { id: 'insert.link', label: '链接', hint: '插入 <>，直接粘贴链接', group: 'insert', edits: true },
  { id: 'history.undo', label: '撤销', hint: '撤销上一步', group: 'history', key: 'Mod-z', edits: true },
  { id: 'history.redo', label: '重做', hint: '恢复撤销的修改', group: 'history', key: 'Mod-Shift-z', edits: true },
  { id: 'clipboard.paste', label: '粘贴', hint: '粘贴到当前光标位置', group: 'clipboard', edits: true },
  { id: 'clipboard.copy', label: '智能复制', hint: '选中结构括号复制整块，否则复制当前行或选中行', group: 'clipboard', edits: false },
  { id: 'structure.duplicate', label: '复制一份', hint: '选中结构括号复制整块到下方，否则复制当前行', group: 'structure', key: 'Mod-Shift-d', edits: true },
  { id: 'structure.delete', label: '智能删除', hint: '选中结构括号删除整块，否则删除当前行或选中行', group: 'structure', edits: true },
  { id: 'structure.format', label: '格式化', hint: '按块结构重排缩进', group: 'structure', key: 'Shift-Alt-f', edits: true },
  { id: 'find.search', label: '查找替换', hint: '在计划中查找和替换文本', group: 'find', key: 'Mod-f', edits: false },
  { id: 'find.complete', label: '补全', hint: '列出当前位置可用的指令和变量', group: 'find', key: 'Ctrl-Space', edits: false },
] as const satisfies readonly EditorCommandMeta[]

export type EditorCommandId = (typeof EDITOR_COMMAND_META)[number]['id']

/** Human-readable form of a CodeMirror key: `⌘⇧D` on Apple platforms, `Ctrl+Shift+D` elsewhere. */
export function formatKey(key: string, mac: boolean): string {
  const parts = key.split('-').map((part) => {
    if (part === 'Mod') return mac ? '⌘' : 'Ctrl'
    if (part === 'Alt') return mac ? '⌥' : 'Alt'
    if (part === 'Shift') return mac ? '⇧' : 'Shift'
    if (part === 'Ctrl') return mac ? '⌃' : 'Ctrl'
    return part.length === 1 ? part.toUpperCase() : part
  })
  return parts.join(mac ? '' : '+')
}

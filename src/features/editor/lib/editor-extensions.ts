import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, startCompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, codeFolding, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language'
import { linter, lintKeymap } from '@codemirror/lint'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension, type StateEffect } from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  type ViewUpdate,
} from '@codemirror/view'
import { validateWorkflowSource } from '../../../lib/workflow-dsl/index.ts'
import { anyWorkflowCompletion, startLinkOptions, type StartLinkOption } from './dsl-completion.ts'
import { anyWorkflowFolding } from './dsl-folding.ts'
import { anyWorkflowHighlighting, anyWorkflowLanguage } from './dsl-language.ts'
import { registryKeymap, type CommandOutcome } from './editor-command-registry.ts'
import { editorFlash } from './editor-flash.ts'
import { editorTheme, foldMarker } from './editor-theme.ts'
import { isStartUrlValuePosition } from './start-url.ts'

/** Settings the host can change while the editor is open, without rebuilding the view. */
export interface EditorConfig {
  readOnly: boolean
  startLinks: readonly StartLinkOption[]
  lineNumbers: boolean
  lineWrap: boolean
}

/** CodeMirror's built-in UI text (search panel, folding, completion, lint) in Chinese. */
const PHRASES: Record<string, string> = {
  Find: '查找',
  Replace: '替换为',
  next: '下一个',
  previous: '上一个',
  all: '全部',
  'match case': '区分大小写',
  regexp: '正则',
  'by word': '全词',
  replace: '替换',
  'replace all': '全部替换',
  close: '关闭',
  'current match': '当前匹配',
  'on line': '位于行',
  'replaced match on line $': '已替换第 $ 行的匹配',
  'replaced $ matches': '已替换 $ 处',
  'Go to line': '跳转到行',
  go: '跳转',
  'Folded lines': '已折叠',
  'Unfolded lines': '已展开',
  to: '至',
  'folded code': '折叠的内容',
  unfold: '展开',
  'Fold line': '折叠',
  'Unfold line': '展开',
  Completions: '补全',
  Diagnostics: '问题',
  'No diagnostics': '没有问题',
  'Selection deleted': '已删除选中内容',
  'Control character': '控制字符',
}

const compartments = {
  readOnly: new Compartment(),
  startLinks: new Compartment(),
  gutters: new Compartment(),
  wrap: new Compartment(),
}

const readOnlyExtension = (readOnly: boolean) => EditorState.readOnly.of(readOnly)
const startLinksExtension = (links: readonly StartLinkOption[]) => startLinkOptions.of(links)
const wrapExtension = (wrap: boolean) => (wrap ? EditorView.lineWrapping : [])
const gutterExtension = (numbers: boolean): Extension => [
  ...(numbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
  foldGutter({ markerDOM: foldMarker }),
]

/** Effects that move a running view to `next`; only changed settings are reconfigured. */
export function reconfigureEditor(previous: EditorConfig, next: EditorConfig): StateEffect<unknown>[] {
  const effects: StateEffect<unknown>[] = []
  if (previous.readOnly !== next.readOnly) effects.push(compartments.readOnly.reconfigure(readOnlyExtension(next.readOnly)))
  if (previous.startLinks !== next.startLinks) effects.push(compartments.startLinks.reconfigure(startLinksExtension(next.startLinks)))
  if (previous.lineNumbers !== next.lineNumbers) effects.push(compartments.gutters.reconfigure(gutterExtension(next.lineNumbers)))
  if (previous.lineWrap !== next.lineWrap) effects.push(compartments.wrap.reconfigure(wrapExtension(next.lineWrap)))
  return effects
}

/** The full AnyWorkflow editing setup: language, lint, completion, folding, search, history, keymaps. */
export function anyWorkflowExtensions({
  config,
  onUpdate,
  onSave,
  onOutcome,
}: {
  config: EditorConfig
  onUpdate: (update: ViewUpdate) => void
  onSave: () => void
  onOutcome: (outcome: CommandOutcome) => void
}): Extension[] {
  return [
    EditorState.phrases.of(PHRASES),
    compartments.gutters.of(gutterExtension(config.lineNumbers)),
    codeFolding({ placeholderText: '…' }),
    anyWorkflowFolding,
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    compartments.wrap.of(wrapExtension(config.lineWrap)),
    anyWorkflowLanguage,
    anyWorkflowHighlighting,
    compartments.startLinks.of(startLinksExtension(config.startLinks)),
    autocompletion({ override: [anyWorkflowCompletion], activateOnTyping: true, icons: true }),
    // Memoized per text: the Act preview and the save guard read the same inspection.
    linter((view) => validateWorkflowSource(view.state.doc.toString()), { delay: 200 }),
    editorTheme,
    editorFlash,
    // Clicking after the `=` of `@let start_url=` offers the start links.
    EditorView.domEventHandlers({
      mouseup: (_event, view) => {
        setTimeout(() => {
          const head = view.state.selection.main.head
          const line = view.state.doc.lineAt(head)
          if (view.state.selection.main.empty && isStartUrlValuePosition(line.text.slice(0, head - line.from))) {
            startCompletion(view)
          }
        }, 0)
        return false
      },
    }),
    compartments.readOnly.of(readOnlyExtension(config.readOnly)),
    EditorView.updateListener.of(onUpdate),
    keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          onSave()
          return true
        },
      },
      ...registryKeymap(onOutcome),
      indentWithTab,
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...searchKeymap,
      ...lintKeymap,
      ...foldKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
  ]
}

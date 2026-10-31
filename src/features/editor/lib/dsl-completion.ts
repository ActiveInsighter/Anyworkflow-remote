import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { Facet } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import {
  collectWorkflowVariableScope,
  workflowContextAt,
  type WorkflowDslContext,
  type WorkflowVariable,
} from '../../../lib/workflow-dsl/index.ts'
import { loopScopeAt } from './editor-commands.ts'

export interface StartLinkOption {
  label: string
  url: string
}

/**
 * The start pages offered after `@let start_url=`. Supplied by the host (the account's start
 * links) and reconfigured in place when they change, so the editor never hard-codes a list.
 */
export const startLinkOptions = Facet.define<readonly StartLinkOption[], readonly StartLinkOption[]>({
  combine: (values) => values.at(-1) ?? [],
})

const START_URL_PREFIX = /^(\s*@(?:let|var)\s+start_url\s*=\s*)(\S*)$/iu

/** Default variable for a loop inserted at `at`, or null when the nesting limit is reached. */
function loopNameAt(source: string, at: number): string | null {
  const scope = loopScopeAt(source, at)
  return scope.ok ? scope.name : null
}

function applyVariableCompletion(view: EditorView, completion: Completion, from: number, to: number): void {
  const replaceTo = view.state.doc.sliceString(to, to + 1) === '%' ? to + 1 : to
  view.dispatch({
    changes: { from, to: replaceTo, insert: completion.label },
    selection: { anchor: from + completion.label.length },
    scrollIntoView: true,
  })
}

/** What the completion list says about a variable; aliases explain themselves and sort last. */
function variableCompletionInfo(variable: WorkflowVariable): Pick<Completion, 'detail' | 'boost'> {
  if (variable.origin === 'loop') return { detail: '循环变量' }
  if (variable.origin === 'declared') return { detail: '变量' }
  if (variable.name === 'index') {
    const detail = variable.loopKind === 'list' ? '第几项，从 1 开始' : `循环值，同 %${variable.loop}%`
    return { detail, boost: -50 }
  }
  return { detail: '本层循环的总次数', boost: -50 }
}

function variableOptions(source: string, at: number): Completion[] {
  return collectWorkflowVariableScope(source, at).map((variable) => ({
    label: `%${variable.name}%`,
    type: 'variable',
    ...variableCompletionInfo(variable),
    apply: applyVariableCompletion,
  }))
}

function directiveOptions(context: WorkflowDslContext, loopName: string | null): Completion[] {
  const shared: Completion[] = [
    { label: '@mode', type: 'keyword', detail: 'serial | parallel', apply: '@mode=serial' },
    { label: '@maxConcurrency', type: 'keyword', detail: '1–16', apply: '@maxConcurrency=2' },
  ]

  if (context === 'run') {
    return [
      ...shared,
      snippetCompletion('@task ${任务名称} {\n  @mode=serial\n\n  ${}\n}', { label: '@task', type: 'keyword', detail: 'Task 块' }),
      ...(loopName
        ? [
            snippetCompletion('@for ${' + loopName + '} in range(1, 3) {\n  @task ${任务名称} {\n    ${}\n  }\n}', { label: '@for', type: 'keyword', detail: '数字循环（Task）' }),
            snippetCompletion('@for ${' + loopName + '} in [${甲, 乙, 丙}] {\n  @task %' + loopName + '% {\n    ${}\n  }\n}', { label: '@for … in [列表]', type: 'keyword', detail: '列表循环' }),
          ]
        : []),
    ]
  }

  if (context === 'task') {
    return [
      ...shared,
      snippetCompletion('@let ${name}=${value}', { label: '@let', type: 'keyword', detail: 'Task 变量' }),
      snippetCompletion('@let start_url=${}', { label: '@let start_url', type: 'keyword', detail: '起始链接' }),
      snippetCompletion('@event ${执行单元} {\n  {\n    ${消息}\n  }\n}', { label: '@event', type: 'keyword', detail: 'Event 块' }),
      ...(loopName
        ? [
            snippetCompletion('@for ${' + loopName + '} in range(1, 3) {\n  @event ${执行单元} {\n    {\n      ${消息}\n    }\n  }\n}', { label: '@for', type: 'keyword', detail: '数字循环（Event）' }),
            snippetCompletion('@for ${' + loopName + '} in [${甲, 乙, 丙}] {\n  @event %' + loopName + '% {\n    {\n      ${消息}\n    }\n  }\n}', { label: '@for … in [列表]', type: 'keyword', detail: '列表循环' }),
          ]
        : []),
    ]
  }

  return [
    snippetCompletion('@act {\n  @event=${事件名称}\n  {\n    ${消息}\n  }\n}', { label: '@act', type: 'keyword', detail: 'Act 块' }),
    ...(loopName
      ? [
          snippetCompletion('@for ${' + loopName + '} in range(1, 3) {\n  {\n    ${消息}\n  }\n}', { label: '@for', type: 'keyword', detail: '数字循环' }),
          snippetCompletion('@for ${' + loopName + '} in [${甲, 乙, 丙}] {\n  {\n    ${%' + loopName + '%}\n  }\n}', { label: '@for … in [列表]', type: 'keyword', detail: '列表循环' }),
        ]
      : []),
    snippetCompletion('{\n  ${消息}\n}', { label: '{ message }', type: 'text', detail: '消息块' }),
    snippetCompletion('<sleep(${秒数})>', { label: '<sleep(秒数)>', type: 'function', detail: '等待后继续，可使用变量' }),
    snippetCompletion('<wait(${秒数})>', { label: '<wait(秒数)>', type: 'function', detail: '等待后继续，可使用变量' }),
    snippetCompletion('<${链接}>', { label: '<链接>', type: 'text', detail: '打开页面' }),
  ]
}

/** Completion source for the plan DSL: start links, `@mode` values, variables and directives. */
export function anyWorkflowCompletion(context: CompletionContext): CompletionResult | null {
  const source = context.state.doc.toString()
  const line = context.state.doc.lineAt(context.pos)
  const prefix = line.text.slice(0, context.pos - line.from)

  const startUrl = prefix.match(START_URL_PREFIX)
  if (startUrl) {
    const links = context.state.facet(startLinkOptions)
    if (!links.length) return null
    return {
      from: line.from + startUrl[1].length,
      options: links.map((link) => ({ label: link.url, detail: link.label, type: 'text' })),
      validFor: /^\S*$/u,
    }
  }

  if (/^\s*@mode\s*=\s*[A-Za-z]*$/iu.test(prefix)) {
    const word = context.matchBefore(/[A-Za-z]*$/u)
    return {
      from: word?.from ?? context.pos,
      options: [
        { label: 'serial', type: 'enum', detail: '串行' },
        { label: 'parallel', type: 'enum', detail: '并行' },
      ],
    }
  }

  const variable =
    context.matchBefore(/%[A-Za-z_][A-Za-z0-9_:]*$/u) ?? (context.explicit ? context.matchBefore(/%$/u) : null)
  if (variable) {
    const options = variableOptions(source, context.pos)
    return options.length ? { from: variable.from, options } : null
  }

  const directive = context.matchBefore(/@[A-Za-z]*$/u)
  if (directive) {
    return {
      from: directive.from,
      options: directiveOptions(workflowContextAt(source, context.pos), loopNameAt(source, directive.from)),
      validFor: /^@[A-Za-z]*$/u,
    }
  }

  if (context.explicit) {
    return { from: context.pos, options: directiveOptions(workflowContextAt(source, context.pos), loopNameAt(source, context.pos)) }
  }
  return null
}

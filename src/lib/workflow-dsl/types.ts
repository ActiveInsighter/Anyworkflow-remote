/** Public DSL types, engine limits, and the internal shapes shared by the parser stages. */
import type { DispatchExecutionMode } from '../../types'
import type { DiagnosticCollector } from './diagnostics.ts'

export type WorkflowDslContext = 'run' | 'task' | 'event'
export type WorkflowDiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'

export interface WorkflowDiagnostic {
  from: number
  to: number
  line: number
  severity: WorkflowDiagnosticSeverity
  message: string
}

/**
 * These limits mirror the cloud compiler and the browser queue parser. The editor deliberately
 * validates the stricter limit when the same source is accepted by one layer but rejected by the
 * next one, so a plan cannot pass the editor only to fail after orchestration.
 */
export const WORKFLOW_DSL_LIMITS = Object.freeze({
  maxPlanBytes: 2 * 1024 * 1024,
  maxRunTasks: 256,
  maxTaskEvents: 1_000,
  maxLoopItems: 1_000,
  maxNesting: 8,
  maxEventQueueBytes: 768 * 1024,
  maxExpandedPlanBytes: 32 * 1024 * 1024,
  maxQueueRepeat: 100,
  maxBrowserLoopItems: 200,
  maxBrowserTotalActs: 200,
  maxBrowserPollDepth: 3,
  maxBrowserTemplateActs: 10,
  maxExpansionIterations: 100_000,
})

/**
 * Besides its own variable, every `@for` defines these two for its body (Task, Event and queue
 * loops alike): `index` repeats the loop variable's value (it is not a zero-based position) and
 * `count` is the number of iterations. The runtime has always injected them, so plans may use them.
 */
export const LOOP_ALIAS_VARIABLES = Object.freeze(['index', 'count'] as const)

/** Task variable naming the page a Task starts on; an empty value falls back to the Run's default link. */
export const START_URL_VARIABLE = 'start_url'
export const DEFAULT_START_URL = 'https://chatgpt.com/'
/** `@let` declares a variable; `@var` is the legacy spelling with the same meaning. */
export const VARIABLE_DECLARATION = /^@(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/iu

export const SELF_URL_TOKENS = new Set(['<self>', '<current>', '<here>', '<本页>', '<当前页>', '<当前页面>'])
export const VARIABLE_TOKEN = /%([A-Za-z_][A-Za-z0-9_]*)(?::([A-Za-z0-9_]+))?%/gu
export const BACKTICK_FENCE = '```'
export const TILDE_FENCE = '~~~'

export type TemplateValue = string | number
export type TemplateVars = Record<string, TemplateValue>
export type CloudLevel = 'run' | 'task'
export type CloudBlockKind = 'task' | 'event'

export interface LineIndex {
  readonly original: string
  readonly starts: number[]
}

export interface CloudConfig {
  title: string
  executionMode: DispatchExecutionMode
  maxConcurrency: number
}

export interface CloudBlock {
  kind: CloudBlockKind
  title: string
  body: string
  line: number
}

export interface CloudLevelResult {
  config: CloudConfig
  vars: TemplateVars
  blocks: CloudBlock[]
  failed: boolean
}

export interface ParseBudget {
  expandedBytes: number
  iterations: number
}

export interface QueueValidationOptions {
  eventTitle: string
  line: number
  collector: DiagnosticCollector
  activeVariables?: Set<string>
  depth?: number
  pollDepth?: number
  expansionBudget?: QueueExpansionBudget
}

export interface QueueExpansionBudget {
  acts: number
}

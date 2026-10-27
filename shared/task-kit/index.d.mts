/**
 * Types for the platform-neutral task kit (index.mjs). Anyworkflow-remote
 * imports the vendored copy from TypeScript; keep these in step with the JS.
 */

export type TaskState = 'idle' | 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'canceled' | 'expired'
export type TaskRecord = { id: string; status: string; [field: string]: unknown }

export interface TaskView {
  kind: string
  id: string
  status: string
  state: TaskState
  active: boolean
  stopping: boolean
  progress: number | null
}

export interface TaskKind<R = TaskRecord> {
  readonly id: string
  readonly collection: string
  readonly cancel: 'flag' | 'command' | 'none'
  readonly statuses: Readonly<Record<string, TaskState>>
  statusesIn(...states: TaskState[]): string[]
  stateOf(status: string): TaskState
  isActive(status: string): boolean
  isTerminal(status: string): boolean
  describe(record: R): TaskView
}

export const TASK_STATES: readonly TaskState[]
export function isActiveState(state: TaskState): boolean
export function isTerminalState(state: TaskState): boolean
export function hasResultState(state: TaskState): boolean
export function defineTaskKind<R = TaskRecord>(spec: {
  id: string
  collection: string
  statuses: Record<string, TaskState>
  cancel?: 'flag' | 'command' | 'none'
  progress?: (record: R) => number | null
  stopping?: (record: R) => boolean
}): TaskKind<R>

export const fileConversionKind: TaskKind
export const runExportKind: TaskKind
export const runKind: TaskKind
export const TASK_KINDS: readonly TaskKind[]
export function taskKind(id: string): TaskKind

export interface TaskStore<R extends TaskRecord = TaskRecord> {
  list(statuses: string[], context: { now: number }): Promise<R[]>
  get(id: string): Promise<R>
  patch(id: string, data: Partial<R>): Promise<unknown>
}

export interface TaskContext<R extends TaskRecord = TaskRecord, S extends TaskStore<R> = TaskStore<R>> {
  kind: TaskKind<R>
  store: S
  now: number
  log: (line: string) => void
}

export interface TaskHandlers<R extends TaskRecord = TaskRecord, S extends TaskStore<R> = TaskStore<R>> {
  start(task: R, context: TaskContext<R, S>): Promise<false | 'done' | void>
  advance(task: R, context: TaskContext<R, S>): Promise<void>
}

export type TaskErrorPolicy<R extends TaskRecord = TaskRecord, S extends TaskStore<R> = TaskStore<R>> = (failure: {
  task: R
  error: unknown
  store: S
  now: number
  kind: TaskKind<R>
}) => Promise<void>

export interface TaskPassResult {
  checked: number
  errors: number
  inFlight: number
  started: number
  more: boolean
}

export interface TaskEngine {
  readonly kind: TaskKind
  runOnce(): Promise<TaskPassResult>
}

export function createTaskEngine<R extends TaskRecord, S extends TaskStore<R>>(options: {
  kind: TaskKind<R>
  store: S
  handlers: TaskHandlers<R, S>
  concurrency?: number
  maxStartsPerPass?: number
  onError?: TaskErrorPolicy<R, S> | null
  now?: () => number
  log?: (line: string) => void
}): TaskEngine

export function exponentialBackoff(options: { baseMs: number; maxMs: number; factor?: number }): (attempt: number) => number
export function countFailures(options: {
  field?: string
  max: number
  message: (task: TaskRecord) => string
  exhaustedMessage: (task: TaskRecord, failures: number) => string
  holdStatuses?: string[]
}): TaskErrorPolicy

/* GitHub Actions executor and the file-conversion kind built on it. */

export interface GitHubRun {
  id: number
  status: string
  conclusion?: string | null
  display_title?: string
  head_branch?: string
  head_sha?: string
  run_started_at?: string
}

export interface GitHubActionsClient<A = unknown> {
  dispatch(inputs: Record<string, string>): Promise<{ workflow_run_id?: number } | null>
  findRun(requestId: string, since: string): Promise<GitHubRun | null>
  run(id: string): Promise<GitHubRun>
  cancel(id: string): Promise<void>
  archive(id: string): Promise<A | null>
}

export interface ArtifactStore<A = unknown, R extends TaskRecord = TaskRecord> extends TaskStore<R> {
  upload(id: string, archive: A, filename: string, metadata: Record<string, string | number>): Promise<unknown>
}

export const DEFAULT_GITHUB_MESSAGES: Readonly<Record<string, string | ((value: never) => string)>>
export function githubActionsHandlers<A, R extends TaskRecord>(options: {
  github: GitHubActionsClient<A>
  inputs: (task: R) => Record<string, string>
  filename: (task: R) => string
  reconcileWindowMs?: number
}): TaskHandlers<R, ArtifactStore<A, R>>
export function githubActionsErrorMessage(task: TaskRecord): string

export const PDF_TO_MD: 'pdf_to_md'
export function buildPdfWorkflowInputs(row: TaskRecord): Record<string, string>
export function createFileConversionEngine<A>(options: {
  store: ArtifactStore<A>
  github: GitHubActionsClient<A>
  concurrency?: number
  now?: () => number
  log?: (line: string) => void
}): TaskEngine

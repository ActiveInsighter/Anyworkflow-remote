export type DispatchStatus = 'draft' | 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
export type DispatchRequestedAction = 'none' | 'pause' | 'resume' | 'cancel'
export type DispatchExecutionMode = 'serial' | 'parallel'
export type DispatchEventStatus = 'waiting' | 'ready' | 'leased' | 'running' | 'paused' | 'terminal'
export type StatusTone = 'neutral' | 'info' | 'success' | 'danger' | 'warning'

export interface AuthRecord {
  id: string
  email: string
  name?: string
}

export interface AuthSession {
  token: string
  record: AuthRecord
  baseUrl: string
}

export interface DispatchRunRecord {
  id: string
  owner: string
  title: string
  planText: string
  planChecksum: string
  executionMode: DispatchExecutionMode
  maxConcurrency: number
  status: DispatchStatus
  requestedAction: DispatchRequestedAction
  commandVersion: number
  /**
   * One-shot not-before boundary as a UTC ISO-8601 instant. Empty means "start immediately".
   * Immutable once the Run leaves `draft`; cancel the Run to stop a pending execution.
   */
  scheduledAt: string
  totalTasks: number
  completedTasks: number
  lastError: string
  startedAt: string
  endedAt: string
  created: string
  updated: string
}

export interface DispatchTaskRecord {
  id: string
  owner: string
  run: string
  runIndex: number
  title: string
  planText: string
  executionMode: DispatchExecutionMode
  maxConcurrency: number
  orchestrationState: 'none' | 'pending' | 'compiled' | 'failed'
  compileError: string
  status: DispatchStatus
  requestedAction: DispatchRequestedAction
  totalEvents: number
  completedEvents: number
  lastError: string
  startedAt: string
  endedAt: string
  created: string
  updated: string
}

export interface DispatchEventRecord {
  id: string
  owner: string
  task: string
  eventIndex: number
  queueTextOverride: string
  status: DispatchEventStatus
  attempt: number
  leaseId: string
  leaseUntil: string
  workerId: string
  tabId: number
  localRunId: string
  localAttempt: number
  progress: Record<string, unknown> | null
  lastHeartbeatAt: string
  lastError: string
  lastSeq: number
  terminalResult: '' | 'succeeded' | 'failed' | 'canceled'
  created: string
  updated: string
}

export interface PocketBaseListResponse<T> {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  items: T[]
}

export interface PlanMeta {
  title: string
  mode: DispatchExecutionMode
  maxConcurrency: number
}


export type LibraryFolderScope = 'favorite' | 'template'

export interface LibraryFolderRecord {
  id: string
  owner: string
  parent: string
  name: string
  scope: LibraryFolderScope | ''
  sortOrder: number
  created: string
  updated: string
}

export interface RunFavoriteRecord {
  id: string
  owner: string
  folder: string
  run: string
  note: string
  sortOrder: number
  created: string
  updated: string
  runRecord?: DispatchRunRecord
  folderRecord?: LibraryFolderRecord
}

export interface WorkflowTemplateRecord {
  id: string
  owner: string
  folder: string
  title: string
  description: string
  planText: string
  sourceRun: string
  tags: string[]
  sortOrder: number
  created: string
  updated: string
  folderRecord?: LibraryFolderRecord
}

export interface FlattenedLibraryFolder extends LibraryFolderRecord {
  depth: number
  label: string
}

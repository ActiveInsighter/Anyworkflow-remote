export type DispatchStatus = 'draft' | 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
export type DispatchRequestedAction = 'none' | 'pause' | 'resume' | 'cancel'
export type DispatchExecutionMode = 'serial' | 'parallel'
export type DispatchRunOrigin = 'initial' | 'rerun' | 'resume' | 'edited_rerun'
export type DispatchExecutorKind = 'browser' | 'codex'
export type DispatchEventStatus = 'waiting' | 'ready' | 'leased' | 'running' | 'paused' | 'terminal'
export type StatusTone = 'neutral' | 'info' | 'success' | 'danger' | 'warning'
export type WorkflowHistoryStatus = 'succeeded' | 'failed' | 'canceled' | 'interrupted' | 'unknown'

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
  familyId: string
  /** Monotonic family order retained for stable persistence and legacy clients. */
  versionNumber: number
  /** Semantic Run version: major increments when execution content changes. */
  versionMajor: number
  /** Semantic Run version: minor increments for a content-identical rerun. */
  versionMinor: number
  parentRun: string
  origin: DispatchRunOrigin
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
  runPlanChecksum: string
  inheritedFrom: string
  /** Legacy records without this field are normalized to `browser` by the API layer. */
  executorKind: DispatchExecutorKind
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
  tabId: number | null
  localRunId: string | null
  localAttempt: number
  queueChecksum: string | null
  inheritedFrom: string
  resumeSpec: {
    version: 1
    sourceEventId: string
    sourceLocalRunId: string | null
    sourceLocalAttempt: number
    nextNodeIndex: number
    phase: 'continue' | 'reconcile_pending'
    conversationUrl: string
    providerState: Record<string, unknown>
    checkpointSeq: number
  } | null
  progress: Record<string, unknown> | null
  lastHeartbeatAt: string | null
  lastError: string
  lastSeq: number
  terminalResult: '' | 'succeeded' | 'failed' | 'canceled'
  created: string
  updated: string
}

export interface DispatchCheckpointRecord {
  id: string
  owner: string
  run: string
  task: string
  event: string
  eventAttempt: number
  checkpointSeq: number
  planChecksum: string
  queueChecksum: string
  nextNodeIndex: number
  totalNodes: number
  phase: 'continue' | 'reconcile_pending' | 'unsafe'
  conversationUrl: string
  providerState: Record<string, unknown>
  created: string
  updated: string
}

/**
 * Cloud history records are deliberately kept separate from dispatch records.
 * A dispatch Event points at this hierarchy through `localRunId` -> taskId.
 */
export interface WorkflowHistoryEventRecord {
  id: string
  owner: string
  task: string
  eventIndex: number
  attempt: number
  status: WorkflowHistoryStatus
  title: string
  startedAt: string
  endedAt: string
  durationMs: number
  details: Record<string, unknown> | null
  checksum: string
  isPlaceholder: boolean
  actCount: number
  messageCount: number
  created: string
  updated: string
}

export interface WorkflowHistoryActRecord {
  id: string
  owner: string
  event: string
  actIndex: number
  attempt: number
  status: WorkflowHistoryStatus
  title: string
  startedAt: string
  endedAt: string
  durationMs: number
  details: Record<string, unknown> | null
  checksum: string
  isPlaceholder: boolean
  startNodeIndex: number
  endNodeIndex: number
  messageCount: number
  created: string
  updated: string
}

export interface WorkflowHistoryMessageRecord {
  id: string
  owner: string
  act: string
  nodeIndex: number
  attempt: number
  status: WorkflowHistoryStatus
  userMarkdown: string
  assistantMarkdown: string
  conversationUrl: string
  sentAt: string
  receivedAt: string
  details: Record<string, unknown> | null
  checksum: string
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

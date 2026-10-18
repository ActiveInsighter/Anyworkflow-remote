export type WorkflowHistoryStatus = 'succeeded' | 'failed' | 'canceled' | 'interrupted' | 'unknown'

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

export type WorkflowHistoryMessageSummary = Pick<WorkflowHistoryMessageRecord,
  'id' | 'owner' | 'act' | 'nodeIndex' | 'attempt' | 'status' | 'sentAt' | 'receivedAt' | 'created' | 'updated'>

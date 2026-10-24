export type RunExportContent = 'conversation' | 'assistant'
export type RunExportStatus = 'queued' | 'collecting' | 'packaging' | 'succeeded' | 'failed' | 'expired'

export interface RunExportRecord {
  id: string
  owner: string
  run: string
  title: string
  contentMode: RunExportContent
  status: RunExportStatus
  progress: number
  messageCount: number
  documentCount: number
  warnings: string[] | null
  snapshotAt: string
  file: string
  fileSize: number
  error: string
  expiresAt: string
  created: string
  updated: string
}

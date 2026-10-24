export interface ConversionJob {
  id: string
  status: string
  sourceUrl: string
  outputName: string
  conversionType?: string
  systemPrompt?: string
  prompt?: string
  options?: Record<string, unknown>
  cancelRequested?: boolean
  githubRunId?: string
  dispatchStartedAt: string
  startedAt?: string
  finishedAt?: string
  error?: string
  conclusion?: string
  syncFailures?: number
}
export type JobPatch = Partial<Omit<ConversionJob, 'id'>>
export interface Archive { response: Response; size: number }
export interface Store {
  list(statuses: string[]): Promise<ConversionJob[]>
  get(id: string): Promise<ConversionJob>
  patch(id: string, data: JobPatch): Promise<unknown>
  upload(id: string, archive: Archive, filename: string, metadata: JobPatch): Promise<unknown>
}
export interface GitHubRun {
  id: number
  status: string
  conclusion?: string
  display_title: string
  head_branch?: string
  head_sha?: string
  run_started_at?: string
}
export interface GitHub {
  dispatch(inputs: Record<string, string>): Promise<{ workflow_run_id?: number } | null>
  findRun(id: string, since: string): Promise<GitHubRun | null>
  run(id: string): Promise<GitHubRun>
  cancel(id: string): Promise<void>
  archive(id: string): Promise<Archive | null>
}

import type { ArtifactStore, GitHubActionsClient, GitHubRun, TaskRecord } from '../shared/task-kit/index.mjs'

export type { GitHubRun }

export type ConversionJob = TaskRecord & {
  sourceUrl?: string
  outputName?: string
  cancelRequested?: boolean
  githubRunId?: string
  dispatchStartedAt?: string
  syncFailures?: number
}
export type JobPatch = Record<string, string | number | boolean | null>
/** A GitHub artifact as a still-unread response: the ZIP is streamed, never buffered. */
export interface Archive { response: Response; size: number }
export type Store = ArtifactStore<Archive>
export type GitHub = GitHubActionsClient<Archive>

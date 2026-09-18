export const DEFAULT_POCKETBASE_URL =
  (import.meta.env.VITE_POCKETBASE_URL as string | undefined)?.trim() || 'https://pb.any1.tech'

export const AUTH_COLLECTION = 'aw_clients'
export const RUN_COLLECTION = 'aw_dispatch_runs'
export const TASK_COLLECTION = 'aw_dispatch_tasks'
export const EVENT_COLLECTION = 'aw_dispatch_events'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_CONCURRENCY = 16
export const MAX_PLAN_TEXT_BYTES = 2 * 1024 * 1024

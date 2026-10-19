/** Page size for Tasks, Events and messages inside the Run hierarchy. */
export const RUN_HIERARCHY_PAGE_SIZE = 20

/** Page size for the Run list on the dashboard. */
export const RUN_LIST_PAGE_SIZE = 20

/** Poll intervals while records may still change. */
export const POLL_MS = {
  runList: 12_000,
  runDetail: 8_000,
  hierarchy: 5_000,
  /** Expanded records whose parent finished a while ago; history can still sync late. */
  settled: 30_000,
} as const

/** Backend-enforced limits. Keep in step with the PocketBase hooks; the DSL has its own in workflow-dsl/types.ts. */
export const MAX_CONCURRENCY = 16
export const MAX_PLAN_TEXT_BYTES = 2 * 1024 * 1024
export const MAX_TITLE_LENGTH = 512

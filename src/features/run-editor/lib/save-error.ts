import { ApiError, toErrorMessage } from '@/lib/api'

/**
 * A generic 5xx after a write means the outcome is unknown. Say so plainly instead of inviting
 * a blind retry that could create a duplicate Run.
 */
export function editorSaveErrorMessage(error: unknown): string {
  if (
    error instanceof ApiError &&
    error.status >= 500 &&
    /something went wrong while processing your request/iu.test(error.message)
  ) {
    return `服务端处理失败（HTTP ${error.status}），本次保存结果未能确认；请先刷新 Run 列表确认结果，再决定是否重试。`
  }
  return toErrorMessage(error)
}

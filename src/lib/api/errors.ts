/** User-facing message for any thrown value; API errors already carry localized text. */
export function toErrorMessage(error: unknown, fallback = '操作失败，请重试'): string {
  if (!(error instanceof Error) || !error.message.trim()) return fallback
  // Schema errors from the runtime-config contract are developer-facing; say what the user can act on.
  if (/^(Invalid|Unsupported) runtimeConfig/.test(error.message)) {
    return `运行配置格式无法识别，可能需要更新前端（${error.message}）`
  }
  return error.message
}

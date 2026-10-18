/** User-facing message for any thrown value; API errors already carry localized text. */
export function toErrorMessage(error: unknown, fallback = '操作失败，请重试'): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

import { getSession } from './session'

/** A missed wake is recovered by the server cron; the committed job must never be re-created. */
export function wakeConverter(): void {
  const session = getSession()
  if (!session) return
  void fetch('/api/file-conversion/wake', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.token}`, 'X-PocketBase-Url': session.baseUrl },
    signal: AbortSignal.timeout(5_000),
  }).then(response => {
    if (!response.ok) console.warn('转换任务已保存，等待调度器自动检查队列。')
  }).catch(() => { console.warn('转换任务已保存，等待调度器自动检查队列。') })
}

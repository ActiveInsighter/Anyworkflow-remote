import { StatusBadge } from '@/components/data-display/status-badge'
import type { CrawlWorker } from '@/types/crawl'

/** Whether a browser extension is around to take browser jobs. It may run on another machine. */
export function WorkerStatus({ workers, online }: { workers: CrawlWorker[] | null; online: CrawlWorker[] }) {
  if (!workers) return null
  const first = online[0]
  if (!first) return <StatusBadge tone="neutral">扩展离线</StatusBadge>
  const detail = online.length > 1 ? `${online.length} 个` : first.version ? `v${first.version}` : ''
  return <StatusBadge tone="success">{detail ? `扩展在线 · ${detail}` : '扩展在线'}</StatusBadge>
}

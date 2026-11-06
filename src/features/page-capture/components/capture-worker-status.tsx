import { StatusBadge } from '@/components/data-display/status-badge'
import { isCaptureWorkerOnline } from '@/lib/api/page-capture'
import type { CaptureWorker } from '@/types/page-capture'

export function onlineWorkers(workers: CaptureWorker[] | null): CaptureWorker[] {
  return (workers ?? []).filter((worker) => isCaptureWorkerOnline(worker))
}

/** Whether an extension is around to take work. It runs in a browser, maybe on another machine. */
export function CaptureWorkerStatus({ workers }: { workers: CaptureWorker[] | null }) {
  if (!workers) return null
  const online = onlineWorkers(workers)
  const first = online[0]
  if (!first) return <StatusBadge tone="neutral">扩展离线</StatusBadge>
  const detail = online.length > 1 ? `${online.length} 个` : `v${first.version}`
  return <StatusBadge tone="success">扩展在线 · {detail}</StatusBadge>
}

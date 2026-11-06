import { Page, PageHeader } from '@/components/layout/page'
import { useSession } from '@/lib/api/session'
import { CaptureForm } from '@/features/page-capture/components/capture-form'
import { CaptureJobList } from '@/features/page-capture/components/capture-job-list'
import { CaptureWorkerStatus } from '@/features/page-capture/components/capture-worker-status'
import { useCaptureJobs } from '@/features/page-capture/hooks/use-capture-jobs'

export function PageCapturePage() {
  const session = useSession()
  // A different backend or account must not show the previous one's jobs.
  return <PageCaptureView key={`${session?.baseUrl || ''}:${session?.record.id || ''}`} />
}

function PageCaptureView() {
  const capture = useCaptureJobs()

  return (
    <Page>
      <PageHeader
        title="网页采集"
        description="由浏览器扩展打开页面，提取正文、元数据和链接。"
        actions={<CaptureWorkerStatus workers={capture.workers.data} />}
      />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
        <div className="min-w-0">
          <CaptureForm capture={capture} />
        </div>
        <CaptureJobList capture={capture} />
      </div>
    </Page>
  )
}

import { Page, PageHeader } from '@/components/layout/page'
import { useSession } from '@/lib/api/session'
import { ConversionConfigPanel } from '@/features/file-converter/components/conversion-config-panel'
import { ConversionForm } from '@/features/file-converter/components/conversion-form'
import { ConversionJobList } from '@/features/file-converter/components/conversion-job-list'
import { useConversionConfig } from '@/features/file-converter/hooks/use-conversion-config'
import { useConversionJobs } from '@/features/file-converter/hooks/use-conversion-jobs'

export function FileConverterPage() {
  const session = useSession()
  // A different backend or account must not show the previous one's config or jobs.
  return <FileConverterView key={`${session?.baseUrl || ''}:${session?.record.id || ''}`} />
}

function FileConverterView() {
  const config = useConversionConfig()
  const jobs = useConversionJobs()

  return (
    <Page>
      <PageHeader title="文件转换" description="使用保存的参数处理文件，当前支持 PDF → Markdown。" />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,22.5rem)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <ConversionForm config={config} jobs={jobs} />
          <ConversionConfigPanel config={config} />
        </div>
        <ConversionJobList jobs={jobs} />
      </div>
    </Page>
  )
}

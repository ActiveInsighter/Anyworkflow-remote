import { Page, PageHeader } from '@/components/layout/page'
import { useSession } from '@/lib/api/session'
import { ConversionConfigSheet } from '@/features/file-converter/components/conversion-config-sheet'
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
    <Page width="focus">
      <PageHeader
        compact
        title="文件转换"
        description="把 PDF 转成 Markdown，逐页识别和校对。"
        actions={<ConversionConfigSheet config={config} />}
      />
      <ConversionForm config={config} jobs={jobs} />
      <ConversionJobList jobs={jobs} />
    </Page>
  )
}

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
    <Page>
      <PageHeader
        title="文件转换"
        description="PDF 转 Markdown：OCR 识别后由模型逐页校对，产物打包为 ZIP。"
        actions={<ConversionConfigSheet config={config} />}
      />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
        <div className="min-w-0">
          <ConversionForm config={config} jobs={jobs} />
        </div>
        <ConversionJobList jobs={jobs} />
      </div>
    </Page>
  )
}

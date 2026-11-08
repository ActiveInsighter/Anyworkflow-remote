import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Page, PageHeader } from '@/components/layout/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSession } from '@/lib/api/session'
import { CrawlComposer } from '@/features/crawl/components/crawl-composer'
import { DocumentList } from '@/features/crawl/components/document-list'
import { JobList } from '@/features/crawl/components/job-list'
import { TargetList } from '@/features/crawl/components/target-list'
import type { TargetTab } from '@/features/crawl/components/target-row'
import { TargetSheet } from '@/features/crawl/components/target-sheet'
import { WorkerStatus } from '@/features/crawl/components/worker-status'
import { useCrawl } from '@/features/crawl/hooks/use-crawl'

const VIEWS = ['jobs', 'targets', 'documents'] as const
type View = (typeof VIEWS)[number]

export function CrawlPage() {
  const session = useSession()
  // A different backend or account must not show the previous one's pages.
  return <CrawlView key={`${session?.baseUrl || ''}:${session?.record.id || ''}`} />
}

function CrawlView() {
  const crawl = useCrawl()
  const [params, setParams] = useSearchParams()
  const view: View = VIEWS.find((value) => value === params.get('tab')) ?? 'jobs'
  const [opened, setOpened] = useState<{ id: string; tab: TargetTab } | null>(null)
  const targets = crawl.targets.data?.items
  // The sheet follows the polled list, so a finished crawl or a save shows in it at once.
  const openedTarget = (opened && targets?.find((target) => target.id === opened.id)) || null
  const categories = useMemo(
    () => [...new Set([...(targets ?? []), ...crawl.activeJobs].map((row) => row.category).filter(Boolean))].sort(),
    [targets, crawl.activeJobs],
  )

  function chooseView(value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value === 'jobs') next.delete('tab')
      else next.set('tab', value)
      return next
    }, { replace: true })
  }

  return (
    <Page width="focus">
      <PageHeader
        compact
        title="网页采集"
        description="公开页面在云端免费抓取，需要登录的在你的浏览器里抓取。"
        actions={<WorkerStatus workers={crawl.workers.data} online={crawl.online} />}
      />
      <CrawlComposer crawl={crawl} categories={categories} onSubmitted={(saved) => chooseView(saved ? 'targets' : 'jobs')} />

      <Tabs value={view} onValueChange={chooseView} className="mt-8 min-w-0">
        <TabsList variant="line" aria-label="网页采集视图" className="w-full">
          <TabsTrigger value="jobs">抓取</TabsTrigger>
          <TabsTrigger value="targets">页面</TabsTrigger>
          <TabsTrigger value="documents">内容</TabsTrigger>
        </TabsList>
        <TabsContent value="jobs">
          <JobList crawl={crawl} />
        </TabsContent>
        <TabsContent value="targets">
          <TargetList crawl={crawl} onOpen={(target, tab) => setOpened({ id: target.id, tab })} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentList revision={crawl.revision} categories={categories} />
        </TabsContent>
      </Tabs>

      <TargetSheet
        target={openedTarget}
        tab={opened?.tab ?? 'documents'}
        crawl={crawl}
        categories={categories}
        onTab={(tab) => setOpened((current) => current && { ...current, tab })}
        onClose={() => setOpened(null)}
      />
    </Page>
  )
}

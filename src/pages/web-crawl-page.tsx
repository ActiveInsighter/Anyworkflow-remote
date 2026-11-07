import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Page, PageHeader } from '@/components/layout/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSession } from '@/lib/api/session'
import { ContentList } from '@/features/web-crawl/components/content-list'
import { CrawlComposer } from '@/features/web-crawl/components/crawl-composer'
import { RunList } from '@/features/web-crawl/components/run-list'
import { TargetList, type TargetTab } from '@/features/web-crawl/components/target-list'
import { TargetSheet } from '@/features/web-crawl/components/target-sheet'
import { useWebCrawl } from '@/features/web-crawl/hooks/use-web-crawl'

const VIEWS = ['targets', 'contents', 'runs'] as const
type View = (typeof VIEWS)[number]

export function WebCrawlPage() {
  const session = useSession()
  // A different backend or account must not show the previous one's pages.
  return <WebCrawlView key={`${session?.baseUrl || ''}:${session?.record.id || ''}`} />
}

function WebCrawlView() {
  const crawl = useWebCrawl()
  const [params, setParams] = useSearchParams()
  const view: View = VIEWS.find((value) => value === params.get('tab')) ?? 'targets'
  const [opened, setOpened] = useState<{ id: string; tab: TargetTab } | null>(null)
  const targets = crawl.targets.data?.items
  // The sheet follows the polled list, so a finished crawl or a save shows in it at once.
  const openedTarget = (opened && targets?.find((target) => target.id === opened.id)) || null
  const categories = useMemo(() => [...new Set((targets ?? []).map((target) => target.contentType).filter(Boolean))].sort(), [targets])

  function chooseView(value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value === 'targets') next.delete('tab')
      else next.set('tab', value)
      return next
    }, { replace: true })
  }

  return (
    <Page width="focus">
      <PageHeader compact title="网页抓取" description="保存要关注的页面，按频率自动抓取，结果存进内容库。" />
      <CrawlComposer crawl={crawl} categories={categories} />

      <Tabs value={view} onValueChange={chooseView} className="mt-8 min-w-0">
        <TabsList variant="line" aria-label="网页抓取视图" className="w-full">
          <TabsTrigger value="targets">页面</TabsTrigger>
          <TabsTrigger value="contents">内容</TabsTrigger>
          <TabsTrigger value="runs">记录</TabsTrigger>
        </TabsList>
        <TabsContent value="targets">
          <TargetList crawl={crawl} onOpen={(target, tab) => setOpened({ id: target.id, tab })} />
        </TabsContent>
        <TabsContent value="contents">
          <ContentList settled={crawl.settled} categories={categories} />
        </TabsContent>
        <TabsContent value="runs">
          <RunList crawl={crawl} />
        </TabsContent>
      </Tabs>

      <TargetSheet
        target={openedTarget}
        tab={opened?.tab ?? 'contents'}
        crawl={crawl}
        categories={categories}
        onTab={(tab) => setOpened((current) => current && { ...current, tab })}
        onClose={() => setOpened(null)}
      />
    </Page>
  )
}

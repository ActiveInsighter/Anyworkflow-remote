import { ExternalLink } from 'lucide-react'
import { DescriptionList } from '@/components/data-display/description-list'
import { Button } from '@/components/ui/button'
import { Modal, ModalBody, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '@/components/ui/modal'
import { TaskStatusBadge } from '@/features/tasks'
import { crawlRunUrl } from '@/lib/api/web-crawl'
import { formatDateTime } from '@/lib/format'
import { webCrawlKind } from '@/lib/tasks'
import type { CrawlRun } from '@/types/web-crawl'
import { runTitle } from '../lib/crawl-display'
import { pageResults } from '../lib/run-results'
import { PageResultRow } from './page-result-row'

function Details({ run }: { run: CrawlRun }) {
  const results = pageResults(run)
  const github = crawlRunUrl(run)
  const facts = [
    { label: '状态', value: <TaskStatusBadge kind={webCrawlKind} record={run} /> },
    { label: '触发方式', value: run.trigger === 'schedule' ? '定时' : '手动' },
    { label: '页面', value: `${run.succeededCount}/${run.targetCount} 成功` },
    { label: '内容', value: `${run.itemCount} 条` },
    { label: '创建时间', value: formatDateTime(run.created) },
    { label: '完成时间', value: run.finishedAt ? formatDateTime(run.finishedAt) : '—' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <DescriptionList columns={3} items={facts} />
      {run.error ? <p className="text-caption text-danger [overflow-wrap:anywhere]">{run.error}</p> : null}
      <section aria-labelledby="run-pages-title">
        <h3 id="run-pages-title" className="text-caption font-medium text-muted-foreground">各页面结果</h3>
        <ul className="mt-1 flex flex-col divide-y divide-border">
          {results.map((result) => <PageResultRow key={result.item.target} result={result} />)}
        </ul>
      </section>
      {github ? (
        <Button size="sm" variant="outline" className="self-start" asChild>
          <a href={github} target="_blank" rel="noreferrer noopener">
            <ExternalLink data-icon="inline-start" />
            查看 GitHub 运行
          </a>
        </Button>
      ) : null}
    </div>
  )
}

/** A run's pages and how each went. The caller passes the latest copy, so it updates while open. */
export function RunSheet({ run, onClose }: { run: CrawlRun | null; onClose: () => void }) {
  return (
    <Modal open={run !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>{run ? runTitle(run) : '抓取记录'}</ModalTitle>
          <ModalDescription className="sr-only">这次抓取涉及的页面和结果</ModalDescription>
        </ModalHeader>
        <ModalBody>{run ? <Details run={run} /> : null}</ModalBody>
      </ModalContent>
    </Modal>
  )
}

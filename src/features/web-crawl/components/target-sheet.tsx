import { useState } from 'react'
import { History, Save } from 'lucide-react'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import { Modal, ModalBody, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsyncData } from '@/hooks/use-async-data'
import { useNow } from '@/hooks/use-now'
import { isCrawlRunActive, listTargetRuns } from '@/lib/api/web-crawl'
import { formatDateTime } from '@/lib/format'
import type { CrawlTarget, CrawlTargetInput } from '@/types/web-crawl'
import type { WebCrawlState } from '../hooks/use-web-crawl'
import { scheduleText, targetTitle } from '../lib/crawl-display'
import { pageResultFor } from '../lib/run-results'
import { ContentList } from './content-list'
import { PageResultRow } from './page-result-row'
import type { TargetTab } from './target-list'
import { TARGET_SETTINGS_FORM, TargetSettings } from './target-settings'

const ACTIVE_POLL_MS = 4_000
const IDLE_POLL_MS = 60_000

/** The last runs that included this page, each read for this page alone. */
function TargetRuns({ target, settled }: { target: CrawlTarget; settled: number }) {
  const { data, loading, error } = useAsyncData((signal) => listTargetRuns(target.id, signal), [target.id, settled], {
    pollMs: (runs) => (runs?.some(isCrawlRunActive) ? ACTIVE_POLL_MS : IDLE_POLL_MS),
  })
  if (loading && !data) return <LoadingState label="加载抓取记录…" />
  if (!data) return <ErrorAlert inline>{error}</ErrorAlert>
  if (!data.length) return <EmptyState icon={History} title="还没有抓取记录" description="抓取一次后，结果会记在这里。" />
  return (
    <>
      <ErrorAlert>{error}</ErrorAlert>
      <ul className="flex flex-col divide-y divide-border">
        {data.map((run) => {
          const result = pageResultFor(run, target.id)
          return result ? (
            <PageResultRow key={run.id} result={result} title={formatDateTime(run.created)} facts={[run.trigger === 'schedule' ? '定时' : '手动']} />
          ) : null
        })}
      </ul>
      <p className="mt-3 text-caption text-muted-foreground">显示最近 10 次。</p>
    </>
  )
}

function Body({ target, crawl, categories, tab, onTab }: { target: CrawlTarget; crawl: WebCrawlState; categories: readonly string[]; tab: TargetTab; onTab: (tab: TargetTab) => void }) {
  const [error, setError] = useState('')
  const [saves, setSaves] = useState(0)
  const saving = crawl.pending === `${target.id}:update`

  async function save(patch: Partial<CrawlTargetInput>) {
    if (await crawl.update(target, patch, '设置已保存')) setSaves((count) => count + 1)
  }

  return (
    <>
      <ModalBody>
        <Tabs value={tab} onValueChange={(value) => onTab(value as TargetTab)}>
          <TabsList>
            <TabsTrigger value="contents">内容</TabsTrigger>
            <TabsTrigger value="runs">记录</TabsTrigger>
            <TabsTrigger value="settings">设置</TabsTrigger>
          </TabsList>
          <TabsContent value="contents">
            <ContentList target={target.id} settled={crawl.settled} categories={categories} compact />
          </TabsContent>
          <TabsContent value="runs">
            <TargetRuns target={target} settled={crawl.settled} />
          </TabsContent>
          <TabsContent value="settings" forceMount className="data-[state=inactive]:hidden">
            {/* Mounted while hidden, so switching tabs keeps unsaved edits; a save starts it afresh. */}
            <TargetSettings key={saves} target={target} categories={categories} saving={saving} onSave={(patch) => void save(patch)} onError={setError} />
          </TabsContent>
        </Tabs>
      </ModalBody>
      {tab === 'settings' ? (
        <ModalFooter className="border-t">
          <ErrorAlert inline className="me-auto min-w-0 flex-1">{error}</ErrorAlert>
          <Button type="submit" form={TARGET_SETTINGS_FORM} size="touch" disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            {saving ? '保存中…' : '保存设置'}
          </Button>
        </ModalFooter>
      ) : null}
    </>
  )
}

/**
 * One page: what was crawled from it, how its runs went, and its settings. The caller passes the
 * latest copy of the target, so a crawl finishing or a save shows here at once.
 */
export function TargetSheet({
  target,
  tab,
  crawl,
  categories,
  onTab,
  onClose,
}: {
  target: CrawlTarget | null
  tab: TargetTab
  crawl: WebCrawlState
  categories: readonly string[]
  onTab: (tab: TargetTab) => void
  onClose: () => void
}) {
  const now = useNow()
  return (
    <Modal open={target !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <ModalContent size="lg" height="fixed">
        <ModalHeader>
          <ModalTitle>{target ? targetTitle(target) : '抓取页面'}</ModalTitle>
          <ModalDescription className="truncate">{target ? `${target.host} · ${scheduleText(target, now)}` : ''}</ModalDescription>
        </ModalHeader>
        {target ? <Body target={target} crawl={crawl} categories={categories} tab={tab} onTab={onTab} /> : null}
      </ModalContent>
    </Modal>
  )
}

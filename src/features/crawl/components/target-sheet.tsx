import { useState } from 'react'
import { Save } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Modal, ModalBody, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useNow } from '@/hooks/use-now'
import type { CrawlTarget, CrawlTargetInput } from '@/types/crawl'
import type { CrawlState } from '../hooks/use-crawl'
import { RUNNER_LABELS, scheduleText, targetTitle } from '../lib/crawl-display'
import { DocumentList } from './document-list'
import { JobList } from './job-list'
import type { TargetTab } from './target-row'
import { TARGET_SETTINGS_FORM, TargetSettings } from './target-settings'

function Body({ target, crawl, categories, tab, onTab }: { target: CrawlTarget; crawl: CrawlState; categories: readonly string[]; tab: TargetTab; onTab: (tab: TargetTab) => void }) {
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
            <TabsTrigger value="documents">内容</TabsTrigger>
            <TabsTrigger value="jobs">记录</TabsTrigger>
            <TabsTrigger value="settings">设置</TabsTrigger>
          </TabsList>
          <TabsContent value="documents">
            <DocumentList target={target.id} revision={crawl.revision} categories={categories} compact />
          </TabsContent>
          <TabsContent value="jobs">
            <JobList crawl={crawl} target={target.id} />
          </TabsContent>
          <TabsContent value="settings" forceMount className="data-[state=inactive]:hidden">
            {/* Mounted while hidden, so switching tabs keeps unsaved edits; a save starts it afresh. */}
            <TargetSettings
              key={saves}
              target={target}
              categories={categories}
              online={crawl.online.length > 0}
              saving={saving}
              onSave={(patch) => void save(patch)}
              onError={setError}
            />
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
 * One saved page: what was read from it, how its crawls went, and its settings. The caller passes
 * the latest copy of the page, so a crawl finishing or a save shows here at once.
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
  crawl: CrawlState
  categories: readonly string[]
  onTab: (tab: TargetTab) => void
  onClose: () => void
}) {
  const now = useNow()
  return (
    <Modal open={target !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <ModalContent size="lg" height="fixed">
        <ModalHeader>
          <ModalTitle>{target ? targetTitle(target) : '页面'}</ModalTitle>
          <ModalDescription className="truncate">{target ? `${RUNNER_LABELS[target.runner]} · ${target.host} · ${scheduleText(target, now)}` : ''}</ModalDescription>
        </ModalHeader>
        {target ? <Body target={target} crawl={crawl} categories={categories} tab={tab} onTab={onTab} /> : null}
      </ModalContent>
    </Modal>
  )
}

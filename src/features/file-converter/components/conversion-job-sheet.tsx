import type { ReactNode } from 'react'
import { DescriptionList } from '@/components/data-display/description-list'
import { Modal, ModalBody, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '@/components/ui/modal'
import type { PdfJob } from '@/lib/api/file-conversion'
import { formatDateTime } from '@/lib/format'
import { TaskStatusBadge } from '@/features/tasks'
import { fileConversionKind } from '@/lib/tasks'
import { describeJobOption } from '../lib/conversion-options'
import { jobDuration, jobPageRange } from '../lib/job-status'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-caption font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** Everything a conversion ran with: its source, parameters and prompts, kept out of the row. */
export function ConversionJobSheet({ job, onClose }: { job: PdfJob | null; onClose: () => void }) {
  const parameters = Object.entries(job?.options || {})
    .map(([key, value]) => describeJobOption(key, value))
    .filter((item) => item !== null)

  return (
    <Modal open={job !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>{job?.title || '转换详情'}</ModalTitle>
          <ModalDescription className="sr-only">这次转换的来源、参数和提示词</ModalDescription>
        </ModalHeader>
        <ModalBody>
          {job ? (
            <div className="flex min-w-0 flex-col gap-6">
              <DescriptionList
                columns={3}
                items={[
                  { label: '状态', value: <TaskStatusBadge kind={fileConversionKind} record={job} /> },
                  { label: '产物', value: `${job.outputName}.zip` },
                  { label: '创建时间', value: <span className="tabular-nums">{formatDateTime(job.created)}</span> },
                  ...(jobDuration(job) ? [{ label: '耗时', value: jobDuration(job) }] : []),
                  ...(jobPageRange(job) ? [{ label: '页码', value: jobPageRange(job) }] : []),
                  ...(job.finishedAt ? [{ label: '结束时间', value: <span className="tabular-nums">{formatDateTime(job.finishedAt)}</span> }] : []),
                ]}
              />
              <Block title="源文件">
                <p className="font-mono text-xs break-all text-foreground">{job.sourceUrl}</p>
              </Block>
              {job.error ? (
                <Block title="错误">
                  <p className="text-body break-words text-danger">{job.error}</p>
                </Block>
              ) : null}
              <Block title="参数">
                <DescriptionList
                  columns={3}
                  className="gap-y-3"
                  items={parameters.map((item) => ({ label: item.label, value: <span className="font-normal">{item.value}</span> }))}
                />
              </Block>
              {job.prompt ? (
                <Block title="本次要求">
                  <p className="text-body whitespace-pre-wrap">{job.prompt}</p>
                </Block>
              ) : null}
              {job.systemPrompt ? (
                <Block title="系统提示词">
                  <p className="max-h-60 overflow-y-auto rounded-lg bg-subtle p-3 text-caption whitespace-pre-wrap text-muted-foreground">{job.systemPrompt}</p>
                </Block>
              ) : null}
            </div>
          ) : null}
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

import { useState } from 'react'
import { FileText } from 'lucide-react'
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalPane,
  ModalSplit,
  ModalTag,
  ModalTags,
  ModalTitle,
} from '@/components/ui/modal'
import { formatFileSize } from '@/lib/format'
import type { GeminiPreview } from '@/types/gemini'
import { SegmentNavigation } from './segment-navigation'

export function GeminiPreviewSheet({
  preview,
  prompt,
  onClose,
}: {
  preview: GeminiPreview | null
  prompt: string
  onClose: () => void
}) {
  return (
    <Modal
      open={Boolean(preview)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <ModalContent size="lg" height="fixed">
        <ModalHeader>
          <ModalTitle>分段预览</ModalTitle>
          <ModalTags>
            <ModalTag>{preview?.totalChunks ?? 0} 段</ModalTag>
          </ModalTags>
        </ModalHeader>
        {preview ? <Contents preview={preview} prompt={prompt} /> : null}
      </ModalContent>
    </Modal>
  )
}

function Contents({ preview, prompt }: { preview: GeminiPreview; prompt: string }) {
  const [selected, setSelected] = useState('')
  const items = preview.chunks.map((chunk) => ({ ...chunk, id: String(chunk.index) }))
  const opened = items.find((item) => item.id === selected) ?? items[0]
  return (
    <ModalSplit className="max-md:flex max-md:flex-col" columns="16rem minmax(0,1fr)">
      <ModalPane tone="muted" className="max-md:py-3">
        <SegmentNavigation items={items} value={opened?.id ?? ''} onChange={setSelected} />
      </ModalPane>
      <ModalPane>
        {opened ? (
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <FileText aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="break-words text-base font-semibold text-foreground">{opened.sourceName}</h3>
                <p className="mt-0.5 text-caption text-muted-foreground tabular-nums">
                  第 {opened.part} 段 · {formatFileSize(opened.bytes)}
                </p>
              </div>
            </div>
            {prompt ? (
              <section className="rounded-xl border border-border/70 bg-subtle/60 p-3.5">
                <h4 className="mb-1.5 text-caption font-medium text-muted-foreground">共同提示词</h4>
                <p className="whitespace-pre-wrap break-words text-body leading-relaxed">{prompt}</p>
              </section>
            ) : null}
            <section>
              <h4 className="mb-2 text-caption font-medium text-muted-foreground">分段正文</h4>
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-subtle/40 p-4 font-sans text-body leading-relaxed">
                {opened.inputText || opened.excerpt || '仅发送提示词'}
              </pre>
            </section>
          </div>
        ) : null}
      </ModalPane>
    </ModalSplit>
  )
}

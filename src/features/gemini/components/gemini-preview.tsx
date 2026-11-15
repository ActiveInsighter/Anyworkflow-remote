import { useState } from 'react'
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
    <ModalSplit className="max-md:flex max-md:flex-col" columns="15rem minmax(0,1fr)">
      <ModalPane tone="muted" className="max-md:py-3">
        <SegmentNavigation items={items} value={opened?.id ?? ''} onChange={setSelected} />
      </ModalPane>
      <ModalPane>
        {opened ? (
          <div className="flex min-w-0 flex-col gap-5">
            <div>
              <h3 className="break-words text-base font-semibold">{opened.sourceName}</h3>
              <p className="mt-1 text-caption text-muted-foreground">
                第 {opened.part} 段 · {formatFileSize(opened.bytes)}
              </p>
            </div>
            {prompt ? (
              <section>
                <h4 className="mb-2 text-caption font-medium text-muted-foreground">共同提示词</h4>
                <p className="whitespace-pre-wrap break-words text-body">{prompt}</p>
              </section>
            ) : null}
            <section>
              <h4 className="mb-2 text-caption font-medium text-muted-foreground">分段正文</h4>
              <pre className="whitespace-pre-wrap break-words font-sans text-body leading-relaxed">
                {opened.inputText || opened.excerpt || '仅发送提示词'}
              </pre>
            </section>
          </div>
        ) : null}
      </ModalPane>
    </ModalSplit>
  )
}

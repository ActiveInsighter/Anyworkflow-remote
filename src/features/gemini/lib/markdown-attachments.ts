import type { AttachmentAdapter, CompleteAttachment, CreateAttachment, AppendMessage } from '@assistant-ui/react'
import { readLibraryMarkdown, type LibraryFile } from '@/lib/api/library-files'

const MAX_INPUT_BYTES = 2 * 1024 * 1024
export const markdownAttachmentAdapter: AttachmentAdapter = {
  accept: '.md,text/markdown',
  async add({ file }) {
    if (!file.name.toLowerCase().endsWith('.md') || file.size > MAX_INPUT_BYTES) throw new Error('请选择不超过 2 MiB 的 Markdown 文件')
    return { id: crypto.randomUUID() + '.md', type: 'document', name: file.name, file,
      contentType: 'text/markdown', status: { type: 'requires-action', reason: 'composer-send' } }
  },
  async send(attachment, options): Promise<CompleteAttachment> {
    options?.signal?.throwIfAborted()
    const bytes = await attachment.file.arrayBuffer()
    options?.signal?.throwIfAborted()
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { ...attachment, status: { type: 'complete' }, content: [{ type: 'data', name: 'gemini-markdown',
      data: { id: attachment.id, name: attachment.name, content } }] }
  },
  async remove() {},
}
export async function libraryAttachment(file: LibraryFile, signal?: AbortSignal): Promise<CreateAttachment> {
  return { id: file.id, type: 'document', name: file.fileName, contentType: 'text/markdown', content: [
    { type: 'data', name: 'gemini-markdown', data: { id: file.id, name: file.fileName, content: await readLibraryMarkdown(file.id, signal) } },
  ] }
}
export function inputSources(message: AppendMessage) {
  const sources: { id: string; name: string; content: string }[] = []
  for (const attachment of message.attachments ?? []) {
    for (const part of attachment.content ?? []) {
      if (part.type !== 'data' || part.name !== 'gemini-markdown') continue
      const data: unknown = part.data
      if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string' ||
        !('name' in data) || typeof data.name !== 'string' || !('content' in data) || typeof data.content !== 'string') throw new Error('Markdown 附件格式无效')
      sources.push({ id: data.id, name: data.name, content: data.content })
    }
  }
  return sources
}

import { assertOwner, listOwnedCollection, quoteFilter, request } from './pocketbase'
import { requireSession } from './session'

export const PDF_COLLECTION = 'aw_pdf_to_md_jobs'
export const pdfStatusLabels: Record<string, string> = {
  queued: '等待调度', dispatching: '提交中', pending: '排队中', running: '转换中', uploading: '保存产物中',
  succeeded: '已完成', partial: '部分完成', failed: '失败', canceled: '已取消',
}
export interface PdfJobInput {
  title: string
  sourceUrl: string
  outputName: string
  prompt: string
  options: Record<string, string | number>
}
export interface PdfJob extends PdfJobInput {
  id: string
  owner: string
  status: string
  file: string
  fileSize: number
  githubRunId: string
  error: string
  created: string
  updated: string
  finishedAt: string
}
export function listPdfJobs(page: number, signal?: AbortSignal) {
  return listOwnedCollection<PdfJob>(PDF_COLLECTION, {
    page, perPage: 20, sort: '-created,-id', filter: `owner="${quoteFilter(requireSession().record.id)}"`,
  }, (row) => row, signal)
}
export async function createPdfJob(id: string, input: PdfJobInput) {
  const data = { ...input, id, owner: requireSession().record.id, status: 'queued' }
  try {
    return assertOwner(await request<PdfJob>(`/api/collections/${PDF_COLLECTION}/records`, { method: 'POST', data }))
  } catch (error) {
    // A lost POST response or retry with the same ID must not create a second paid task.
    try {
      const saved = assertOwner(await request<PdfJob>(`/api/collections/${PDF_COLLECTION}/records/${encodeURIComponent(id)}`))
      if (saved.sourceUrl === input.sourceUrl.trim() && saved.title === input.title.trim()) return saved
    } catch { /* Report the original actionable create error. */ }
    throw error
  }
}
export async function pdfDownloadUrl(job: Pick<PdfJob, 'id' | 'owner' | 'file'>) {
  assertOwner(job)
  const { token } = await request<{ token: string }>('/api/files/token', { method: 'POST' })
  if (!token || !job.file) throw Error('产物暂不可下载，请刷新后重试')
  const url = new URL(`/api/files/${PDF_COLLECTION}/${encodeURIComponent(job.id)}/${encodeURIComponent(job.file)}`, requireSession().baseUrl)
  url.searchParams.set('token', token)
  url.searchParams.set('download', '1')
  return url.toString()
}

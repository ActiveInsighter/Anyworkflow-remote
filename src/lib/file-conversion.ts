import { ApiError, assertOwner, listOwnedCollection, quoteFilter, request } from './pocketbase'
import { requireSession } from './session'

export const FILE_CONVERSION_CONFIG_COLLECTION = 'aw_file_conversion_configs'
export const FILE_CONVERSION_JOB_COLLECTION = 'aw_pdf_to_md_jobs'
export const PDF_CONVERSION_TYPE = 'pdf_to_md'
// Matches the PocketBase systemPrompt field. Each conversion sends the saved
// system prompt followed by the per-task prompt, so both stay independent.
export const MAX_SYSTEM_PROMPT_CHARS = 12000

export const DEFAULT_PDF_TO_MD_OPTIONS = {
  images_per_request: 1,
  concurrency: 5,
  provider: 'gemini',
  model: 'gemini-3.5-flash-lite',
  reasoning_effort: '',
  max_output_tokens: 0,
  thinking_level: 'high',
  dpi: 240,
  image_format: 'png',
  jpeg_quality: 95,
  verification_passes: 0,
  media_resolution: 'ultra_high',
  rpm_per_key: 15,
  rpd_per_key: 500,
} as const

const PDF_NUMERIC_LIMITS: Record<string, readonly [number, number]> = {
  images_per_request: [1, 20],
  concurrency: [1, 100],
  dpi: [72, 300],
  jpeg_quality: [50, 100],
  verification_passes: [0, 3],
  rpm_per_key: [1, 1000],
  rpd_per_key: [1, 100000],
  max_output_tokens: [0, 200000],
}

const PDF_CHOICE_VALUES: Record<string, readonly string[]> = {
  provider: ['gemini', 'modelflare'],
  reasoning_effort: ['', 'minimal', 'low', 'medium', 'high', 'xhigh'],
  thinking_level: ['high', 'medium', 'low', 'minimal'],
  image_format: ['png', 'jpeg'],
  media_resolution: ['ultra_high', 'high', 'medium', 'low', 'unspecified'],
}

export type PdfConversionOptions = {
  images_per_request: number
  concurrency: number
  provider: 'gemini' | 'modelflare'
  model: string
  reasoning_effort: '' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  max_output_tokens: number
  thinking_level: 'high' | 'medium' | 'low' | 'minimal'
  dpi: number
  image_format: 'png' | 'jpeg'
  jpeg_quality: number
  verification_passes: number
  media_resolution: 'ultra_high' | 'high' | 'medium' | 'low' | 'unspecified'
  rpm_per_key: number
  rpd_per_key: number
}

export type PdfPageRange = {
  start_page?: number
  end_page?: number
}

export type PdfJobOptions = PdfConversionOptions & PdfPageRange

export interface FileConversionConfig {
  id: string
  owner: string
  conversionType: typeof PDF_CONVERSION_TYPE
  name: string
  systemPrompt: string
  options: PdfConversionOptions
  revision: number
  created: string
  updated: string
}

export interface PdfJobInput {
  title: string
  sourceUrl: string
  outputName: string
  prompt: string
  configId: string
  startPage?: number
  endPage?: number
}

export interface PdfJob extends PdfJobInput {
  id: string
  owner: string
  conversionType: string
  configRevision: number
  /** Snapshot of the config system prompt taken when the job was created. */
  systemPrompt: string
  options: PdfJobOptions
  status: string
  file: string
  fileSize: number
  githubRunId: string
  error: string
  created: string
  updated: string
  finishedAt: string
  cancelRequested: boolean
  rerunOf: string
}

export const pdfStatusLabels: Record<string, string> = {
  queued: '等待调度', dispatching: '提交中', pending: '排队中', running: '转换中', uploading: '保存产物中',
  succeeded: '已完成', partial: '部分完成', failed: '失败', canceled: '已取消',
}

function newRecordId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 15)
}

function normalizeOptions(raw: unknown): PdfConversionOptions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError('转换配置返回格式无效', 502, 'INVALID_CONFIG_RESPONSE')
  }
  const options = raw as Record<string, unknown>
  const result = { ...DEFAULT_PDF_TO_MD_OPTIONS } as PdfConversionOptions
  for (const [key, value] of Object.entries(options)) {
    if (key === 'start_page' || key === 'end_page') continue
    if (!(key in DEFAULT_PDF_TO_MD_OPTIONS)) {
      throw new ApiError('转换配置包含未知参数', 502, 'INVALID_CONFIG_RESPONSE')
    }
    if (key === 'model') {
      if (typeof value !== 'string' || !value.trim()) throw new ApiError('转换配置模型无效', 502, 'INVALID_CONFIG_RESPONSE')
      result.model = value
      continue
    }
    if (typeof result[key as keyof typeof DEFAULT_PDF_TO_MD_OPTIONS] === 'number') {
      if (!Number.isSafeInteger(value)) throw new ApiError('转换配置数值无效', 502, 'INVALID_CONFIG_RESPONSE')
    } else if (typeof value !== 'string' || !PDF_CHOICE_VALUES[key]?.includes(value)) {
      throw new ApiError('转换配置选项无效', 502, 'INVALID_CONFIG_RESPONSE')
    }
    ;(result as unknown as Record<string, unknown>)[key] = value
  }
  for (const [key, [minimum, maximum]] of Object.entries(PDF_NUMERIC_LIMITS)) {
    const value = (result as unknown as Record<string, unknown>)[key]
    if (value !== undefined && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum)) {
      throw new ApiError('转换配置数值格式无效', 502, 'INVALID_CONFIG_RESPONSE')
    }
  }
  if (result.provider === 'gemini' && !/^gemini-[a-zA-Z0-9._-]{1,100}$/u.test(result.model)) {
    throw new ApiError('转换配置模型格式无效', 502, 'INVALID_CONFIG_RESPONSE')
  }
  if (result.provider === 'modelflare' && (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,100}$/u.test(result.model) || result.model.startsWith('gemini-'))) {
    throw new ApiError('转换配置模型格式无效', 502, 'INVALID_CONFIG_RESPONSE')
  }
  return result
}

function normalizeSystemPrompt(raw: unknown): string {
  // Older backends have no field yet: an absent value means "use the built-in
  // prompt", which PocketBase replaces with the stored default on save.
  if (raw === undefined || raw === null || raw === '') return ''
  if (typeof raw !== 'string') throw new ApiError('转换配置返回格式无效', 502, 'INVALID_CONFIG_RESPONSE')
  const text = raw.trim()
  if (text.length > MAX_SYSTEM_PROMPT_CHARS) throw new ApiError('转换配置返回格式无效', 502, 'INVALID_CONFIG_RESPONSE')
  return text
}

function normalizeConfig(record: FileConversionConfig): FileConversionConfig {
  if (record.conversionType !== PDF_CONVERSION_TYPE || !record.id || !record.owner || !Number.isSafeInteger(record.revision) || record.revision < 1) {
    throw new ApiError('转换配置返回格式无效', 502, 'INVALID_CONFIG_RESPONSE')
  }
  return { ...record, systemPrompt: normalizeSystemPrompt(record.systemPrompt), options: normalizeOptions(record.options) }
}

export async function getPdfConversionConfig(signal?: AbortSignal): Promise<FileConversionConfig> {
  const owner = requireSession().record.id
  const listed = await listOwnedCollection<FileConversionConfig>(FILE_CONVERSION_CONFIG_COLLECTION, {
    page: 1,
    perPage: 20,
    sort: '-updated,-id',
    filter: `owner="${quoteFilter(owner)}" && conversionType="${PDF_CONVERSION_TYPE}"`,
  }, normalizeConfig, signal)
  if (listed.items[0]) return listed.items[0]

  const data = {
    id: newRecordId(),
    owner,
    conversionType: PDF_CONVERSION_TYPE,
    name: '默认配置',
    options: DEFAULT_PDF_TO_MD_OPTIONS,
  }
  try {
    return normalizeConfig(assertOwner(await request<FileConversionConfig>(`/api/collections/${FILE_CONVERSION_CONFIG_COLLECTION}/records`, {
      method: 'POST', data, signal,
    })))
  } catch (error) {
    // A second tab may have won the unique (owner, conversionType) race.
    const retry = await listOwnedCollection<FileConversionConfig>(FILE_CONVERSION_CONFIG_COLLECTION, {
      page: 1,
      perPage: 20,
      sort: '-updated,-id',
      filter: `owner="${quoteFilter(owner)}" && conversionType="${PDF_CONVERSION_TYPE}"`,
    }, normalizeConfig, signal)
    if (retry.items[0]) return retry.items[0]
    throw error
  }
}

export async function savePdfConversionConfig(config: FileConversionConfig, options: PdfConversionOptions, systemPrompt: string): Promise<FileConversionConfig> {
  assertOwner(config)
  const normalized = normalizeOptions(options)
  if (systemPrompt.trim().length > MAX_SYSTEM_PROMPT_CHARS) throw new ApiError(`系统提示词不能超过 ${MAX_SYSTEM_PROMPT_CHARS} 个字符`, 400, 'PROMPT_TOO_LONG')
  const prompt = normalizeSystemPrompt(systemPrompt)
  return normalizeConfig(assertOwner(await request<FileConversionConfig>(
    `/api/collections/${FILE_CONVERSION_CONFIG_COLLECTION}/records/${encodeURIComponent(config.id)}`,
    { method: 'PATCH', data: { options: normalized, systemPrompt: prompt } },
  )))
}

export function listPdfJobs(page: number, signal?: AbortSignal) {
  return listOwnedCollection<PdfJob>(FILE_CONVERSION_JOB_COLLECTION, {
    page, perPage: 20, sort: '-created,-id', filter: `owner="${quoteFilter(requireSession().record.id)}"`,
  }, (row) => row, signal)
}

export async function createPdfJob(id: string, input: PdfJobInput) {
  if (!input.configId.trim()) throw new ApiError('转换配置尚未加载', 400, 'CONFIG_REQUIRED')
  const outputName = input.outputName.trim()
  const data = { ...input, outputName, id, owner: requireSession().record.id, status: 'queued' }
  try {
    return assertOwner(await request<PdfJob>(`/api/collections/${FILE_CONVERSION_JOB_COLLECTION}/records`, { method: 'POST', data }))
  } catch (error) {
    // A lost POST response or retry with the same ID must not create a second paid task.
    try {
      const saved = assertOwner(await request<PdfJob>(`/api/collections/${FILE_CONVERSION_JOB_COLLECTION}/records/${encodeURIComponent(id)}`))
      if (
        String(saved.sourceUrl || '').trim() === input.sourceUrl.trim()
        && String(saved.title || '').trim() === input.title.trim()
        && String(saved.outputName || '').trim() === (outputName ? outputName.replace(/\.(zip|md)$/iu, '') : input.title.trim())
        && String(saved.prompt || '').trim() === input.prompt.trim()
        && String(saved.configId || '') === input.configId
        && (saved.startPage ?? undefined) === (input.startPage ?? undefined)
        && (saved.endPage ?? undefined) === (input.endPage ?? undefined)
      ) return saved
    } catch { /* Report the original actionable create error. */ }
    throw error
  }
}

const activePdfStatuses = new Set(['queued', 'dispatching', 'pending', 'running', 'uploading'])
const terminalPdfStatuses = new Set(['succeeded', 'partial', 'failed', 'canceled'])

export async function cancelPdfJob(job: Pick<PdfJob, 'id' | 'owner' | 'status'>): Promise<PdfJob> {
  assertOwner(job)
  if (!activePdfStatuses.has(job.status)) throw new ApiError('任务已经结束', 409, 'JOB_TERMINAL')
  return assertOwner(await request<PdfJob>(`/api/collections/${FILE_CONVERSION_JOB_COLLECTION}/records/${encodeURIComponent(job.id)}`, {
    method: 'PATCH', data: { cancelRequested: true },
  }))
}

export async function rerunPdfJob(id: string, job: Pick<PdfJob, 'id' | 'owner' | 'status'>): Promise<PdfJob> {
  assertOwner(job)
  if (!terminalPdfStatuses.has(job.status)) throw new ApiError('只能重跑已结束的任务', 409, 'JOB_ACTIVE')
  const data = { id, owner: requireSession().record.id, rerunOf: job.id }
  try {
    return assertOwner(await request<PdfJob>(`/api/collections/${FILE_CONVERSION_JOB_COLLECTION}/records`, { method: 'POST', data }))
  } catch (error) {
    try {
      const saved = assertOwner(await request<PdfJob>(`/api/collections/${FILE_CONVERSION_JOB_COLLECTION}/records/${encodeURIComponent(id)}`))
      if (saved.rerunOf === job.id) return saved
    } catch { /* Preserve the original create error. */ }
    throw error
  }
}

export async function pdfDownloadUrl(job: Pick<PdfJob, 'id' | 'owner' | 'file'>) {
  assertOwner(job)
  const { token } = await request<{ token: string }>('/api/files/token', { method: 'POST' })
  if (!token || !job.file) throw Error('产物暂不可下载，请刷新后重试')
  const url = new URL(`/api/files/${FILE_CONVERSION_JOB_COLLECTION}/${encodeURIComponent(job.id)}/${encodeURIComponent(job.file)}`, requireSession().baseUrl)
  url.searchParams.set('token', token)
  url.searchParams.set('download', '1')
  return url.toString()
}

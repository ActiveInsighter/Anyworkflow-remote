import type { ConversionJob, JobPatch, Store, GitHub } from './types.js'

const ACTIVE = ['queued', 'dispatching', 'pending', 'running', 'uploading']
const IN_FLIGHT = ['dispatching', 'pending', 'running', 'uploading']
const INPUTS = ['adjacent_pages', 'concurrency', 'provider', 'model', 'reasoning_effort', 'max_output_tokens', 'thinking_level', 'dpi', 'image_format', 'jpeg_quality', 'verification_passes', 'media_resolution', 'rpm_per_key', 'rpd_per_key', 'start_page', 'end_page']
const PDF_TO_MD = 'pdf_to_md'

export function buildPdfWorkflowInputs(row: ConversionJob) {
  const conversionType = String(row.conversionType || PDF_TO_MD).trim()
  if (conversionType !== PDF_TO_MD) throw Error(`Unsupported PDF conversion type: ${conversionType}`)

  const inputs: Record<string, string> = {
    conversion_type: conversionType,
    source_url: String(row.sourceUrl || ''),
    output_name: String(row.outputName || ''),
    request_id: String(row.id || ''),
    // The system prompt is snapshotted onto the job by PocketBase when the job
    // is created, so changing the saved profile cannot change a queued job.
    system_prompt: String(row.systemPrompt || ''),
    prompt: String(row.prompt || ''),
  }
  const options = row.options && typeof row.options === 'object' && !Array.isArray(row.options) ? row.options : {}
  for (const key of INPUTS) {
    if (options[key] !== undefined && options[key] !== '') inputs[key] = String(options[key])
  }
  return inputs
}

// Only the singleton coordinator alarm runs this processor. Dispatch intent is never re-sent.
// Ported from AnyWorkflow-workers/src/domains/pdf/processor.mjs; PocketBase remains the job authority.
export function createPdfProcessor({ store, github, now = () => new Date(), maxActiveConversions = 1 }: { store: Store; github: GitHub; now?: () => Date; maxActiveConversions?: number }) {
  if (!Number.isSafeInteger(maxActiveConversions) || maxActiveConversions < 1) {
    throw Error('maxActiveConversions must be a positive integer')
  }

  async function process(row: ConversionJob) {
    const patch = (data: JobPatch) => store.patch(row.id, data)
    row = store.get ? await store.get(row.id) : row
    if (!ACTIVE.includes(row.status)) return
    if (row.status === 'queued') {
      if (row.cancelRequested) {
        await patch({ status: 'canceled', finishedAt: now().toISOString(), error: '' })
        return
      }
      await patch({ status: 'dispatching', dispatchStartedAt: now().toISOString(), error: '' })
      const beforeDispatch = store.get ? await store.get(row.id) : row
      if (beforeDispatch.cancelRequested) {
        await patch({ status: 'canceled', finishedAt: now().toISOString(), error: '' })
        return
      }
      const inputs = buildPdfWorkflowInputs(row)
      const result = await github.dispatch(inputs)
      if (!result?.workflow_run_id) throw Error('Missing dispatch run id')
      await patch({ githubRunId: String(result.workflow_run_id), status: 'pending', error: '', syncFailures: 0 })
      return
    }
    if (!row.githubRunId) {
      const run = await github.findRun(row.id, row.dispatchStartedAt)
      if (run) {
        await patch({ githubRunId: String(run.id), status: 'pending', error: '', syncFailures: 0 })
      } else if (now().getTime() - Date.parse(row.dispatchStartedAt) > 15 * 60_000) {
        await patch(row.cancelRequested
          ? { status: 'canceled', finishedAt: now().toISOString(), error: '未找到对应的 GitHub 运行，请检查运行记录。' }
          : { status: 'failed', finishedAt: now().toISOString(), error: '无法确认 GitHub 是否接收任务，请检查运行记录后再新建任务。为避免重复计费，未自动重新提交。' })
      } else {
        await patch({ error: row.cancelRequested ? '正在确认 GitHub 运行并取消。' : '正在核对 GitHub 提交结果，请勿重复提交。' })
      }
      return
    }
    const run = await github.run(row.githubRunId)
    if (run.status !== 'completed') {
      if (row.cancelRequested) await github.cancel(row.githubRunId)
      const status = run.status === 'in_progress' ? 'running' : 'pending'
      await patch({ status, syncFailures: 0, error: '', ...(run.run_started_at ? { startedAt: run.run_started_at } : {}) })
      return
    }
    await patch({ status: 'uploading', conclusion: run.conclusion || 'unknown' })
    const archive = await github.archive(row.githubRunId)
    const latest = store.get ? await store.get(row.id) : row
    const canceled = latest.cancelRequested || run.conclusion === 'cancelled'
    if (!archive) {
      if (run.conclusion === 'success' && !canceled) throw Error('Successful run has no artifact')
      await patch({ status: canceled ? 'canceled' : 'failed', finishedAt: now().toISOString(), error: `转换未生成产物（${run.conclusion || 'unknown'}），可查看 GitHub 运行详情。` })
      return
    }
    await store.upload(row.id, archive, `${row.outputName}.zip`, {
      status: canceled ? 'canceled' : run.conclusion === 'success' ? 'succeeded' : 'partial',
      error: canceled ? '已取消；可下载已保存的产物。' : run.conclusion === 'success' ? '' : '部分转换未完成，请检查 ZIP 中 source.md 标明的缺失页码，并查看 GitHub 运行日志。',
      finishedAt: now().toISOString(), syncFailures: 0,
    })
  }

  return {
    async runOnce() {
      const rows = await store.list(ACTIVE)
      let errors = 0
      const advance = async (row: ConversionJob) => {
        try {
          await process(row)
        } catch (error) {
          errors++
          console.error(JSON.stringify({ event: 'converter_sync_failed', jobId: row.id, message: error instanceof Error ? error.message : 'Unknown error' }))
          // Re-read persisted state: dispatch/run upload may have committed before a timeout.
          const current = store.get ? await store.get(row.id) : row
          if (!ACTIVE.includes(current.status)) return
          const failures = (current.syncFailures || 0) + 1
          await store.patch(row.id, {
            syncFailures: failures,
            error: current.status === 'dispatching' ? '正在核对 GitHub 提交结果，请勿重复提交。' : current.cancelRequested ? '取消暂未完成，稍后自动重试。' : '状态或产物同步暂时失败，稍后自动重试。',
            ...(failures >= 30 && current.status !== 'dispatching' ? { status: 'failed', finishedAt: now().toISOString(), error: '同步连续失败 30 次，请检查 GitHub 运行记录及服务配置。' } : {}),
          })
        }
      }

      // Advance the job that already left the queue before considering a new one.
      for (const row of rows) {
        if (row.status !== 'queued') await advance(row)
      }

      // Conversions are deliberately serialized. Every Actions run draws on the
      // same free-tier quota pool, and each run fans its pages out in parallel,
      // so dispatching the whole queue in one sweep multiplies the request rate
      // against the model: three simultaneous jobs turned a mild upstream hiccup
      // into a 503 storm (measured: `recent_503_ratio=0.85`, `adaptive_stage=3`,
      // every page retried) instead of tripling throughput. Re-read the
      // in-flight set so a job that finished in this pass frees its slot, then
      // start at most as many jobs as the configured budget allows.
      const inFlight = (await store.list(IN_FLIGHT)).filter((row) => IN_FLIGHT.includes(row.status)).length
      const budget = Math.max(0, maxActiveConversions - inFlight)
      if (budget === 0) return { checked: rows.length, errors, inFlight, started: 0 }

      let started = 0
      for (const row of rows) {
        if (row.status !== 'queued' || started >= budget) continue
        await advance(row)
        started++
      }
      return { checked: rows.length, errors, inFlight, started }
    },
  }
}

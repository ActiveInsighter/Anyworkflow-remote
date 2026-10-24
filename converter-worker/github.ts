import { readJson } from './http.js'
import type { GitHub, GitHubRun } from './types.js'

// Deliberately not configurable by an env var or a browser payload.
export const CONVERTER_REF = 'main'
export const MAX_ZIP_BYTES = 100 * 1024 * 1024
const prefixes = ['file-converter-pdf-to-md', 'pdf-to-md']

export function createGitHub(env: ConverterEnv, fetchImpl: typeof fetch = fetch): GitHub {
  const root = `https://api.github.com/repos/${env.GITHUB_FILE_CONVERTER_REPOSITORY}`
  const workflow = env.GITHUB_FILE_CONVERTER_WORKFLOW
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${env.GITHUB_FILE_CONVERTER_TOKEN}`,
    'X-GitHub-Api-Version': '2026-03-10',
    'User-Agent': 'AnyWorkflow-File-Converter',
    'Content-Type': 'application/json',
  }
  const api = (path: string, options: RequestInit = {}) => fetchImpl(`${root}${path}`, {
    ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(30_000),
  })
  const json = async <T>(path: string, options?: RequestInit) => readJson<T>(await api(path, options))
  const runId = (id: string) => {
    if (!/^\d+$/u.test(id)) throw new Error('Invalid GitHub run id')
    return id
  }
  return {
    async dispatch(inputs) {
      const result = await json<{ workflow_run_id?: number } | null>(`/actions/workflows/${workflow}/dispatches`, {
        method: 'POST', body: JSON.stringify({ ref: CONVERTER_REF, inputs }),
      })
      console.log(JSON.stringify({ event: 'converter_dispatched', jobId: inputs.request_id, ref: CONVERTER_REF, runId: result?.workflow_run_id }))
      return result
    },
    async findRun(id, since) {
      const params = new URLSearchParams({ event: 'workflow_dispatch', per_page: '100', created: `>=${new Date(since).toISOString()}` })
      for (let page = 1; page <= 10; page++) {
        params.set('page', String(page))
        const body = await json<{ workflow_runs: GitHubRun[] }>(`/actions/workflows/${workflow}/runs?${params}`)
        const found = body.workflow_runs.find(run => prefixes.some(prefix => run.display_title === `${prefix}-${id}`))
        if (found) return found
        if (body.workflow_runs.length < 100) return null
      }
      throw new Error('GitHub reconciliation exceeded 1000 runs')
    },
    async run(id) {
      const run = await json<GitHubRun>(`/actions/runs/${runId(id)}`)
      console.log(JSON.stringify({ event: 'converter_run', runId: run.id, ref: run.head_branch, sha: run.head_sha, status: run.status }))
      return run
    },
    async cancel(id) {
      const response = await api(`/actions/runs/${runId(id)}/cancel`, { method: 'POST' })
      await response.body?.cancel()
      if (response.status !== 202 && response.status !== 409) throw new Error(`GitHub cancel HTTP ${response.status}`)
    },
    async archive(id) {
      const body = await json<{ artifacts: { id: number; name: string; expired?: boolean; size_in_bytes: number }[] }>(`/actions/runs/${runId(id)}/artifacts?per_page=100`)
      const artifact = body.artifacts.find(item => !item.expired && prefixes.some(prefix => item.name === `${prefix}-${id}`))
      if (!artifact) return null
      if (artifact.size_in_bytes > MAX_ZIP_BYTES) throw new Error('Artifact exceeds 100 MiB')
      const redirect = await api(`/actions/artifacts/${artifact.id}/zip`)
      await redirect.body?.cancel()
      if (redirect.status !== 302) throw new Error('Expected artifact redirect')
      const url = new URL(redirect.headers.get('location') || '')
      if (url.protocol !== 'https:' || url.username || url.password || !['.blob.core.windows.net', '.githubusercontent.com', '.github.com'].some(suffix => url.hostname.endsWith(suffix))) {
        throw new Error('Invalid artifact download host')
      }
      // No GitHub credentials on the signed storage request; ZIP is never buffered.
      const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(120_000) })
      const size = Number(response.headers.get('content-length'))
      if (!response.ok || !response.body || !Number.isSafeInteger(size) || size < 4 || size > MAX_ZIP_BYTES) {
        await response.body?.cancel()
        throw new Error('Invalid artifact response or size')
      }
      return { response, size }
    },
  }
}

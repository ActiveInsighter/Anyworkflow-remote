import { createGeminiTextEngine, fileConversionKind, geminiTextKind, type SettlingStore } from '../shared/task-kit/index.mjs'
import { createGitHub } from './github.js'
import { readJson } from './http.js'
import { createStore } from './store.js'
import type { Store } from './types.js'

export function geminiStore(env: ConverterEnv, fetchImpl: typeof fetch = fetch): SettlingStore {
  const store = createStore(env, fetchImpl, '/api/collections/aw_gemini_jobs/records')
  return {
    ...store,
    settle: async (id, outcome) => readJson(await fetchImplResponse(id, outcome)),
  }
  async function fetchImplResponse(id: string, outcome: { conclusion: string }) {
    if (!/^[a-z0-9]{15}$/u.test(id)) throw new Error('Invalid Gemini job id')
    return fetchImpl(`${new URL(env.POCKETBASE_URL).origin}/api/anyworkflow/gemini/jobs/${id}/settle`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.POCKETBASE_SERVER_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(outcome), redirect: 'manual', signal: AbortSignal.timeout(30_000),
    })
  }
}

/** The two workflows share the same Gemini quota: only the oldest job may start. */
export function sharedQuotaStore<T extends SettlingStore | Store>(own: T, peer: SettlingStore | Store, peerKind: typeof fileConversionKind): T {
  return {
    ...own,
    async list(statuses, context) {
      if (!statuses.includes('queued')) return own.list(statuses, context)
      const [live, waiting, others] = await Promise.all([
        peer.list(peerKind.statusesIn('running'), context), own.list(statuses, context), peer.list(['queued'], context),
      ])
      if (live.length) return []
      const first = waiting[0], other = others[0]
      const order = (row: { id: string }) => {
        const created = 'created' in row && typeof row.created === 'string' ? row.created : ''
        return `${created}:${row.id}`
      }
      if (first && other && order(other) < order(first)) return []
      return waiting
    },
  }
}

export function geminiEngine(env: ConverterEnv, own: SettlingStore, pdf: Store) {
  return createGeminiTextEngine({
    store: sharedQuotaStore(own, pdf, fileConversionKind),
    github: createGitHub(env, fetch, { workflow: 'gemini-text.yml', prefixes: ['gemini-text'] }),
  })
}

export { geminiTextKind }

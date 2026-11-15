import { createGeminiTextEngine, geminiTextKind, type SettlingStore } from '../shared/task-kit/index.mjs'
import { createGitHub } from './github.js'
import { readJson } from './http.js'
import { createStore } from './store.js'

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

/** Different conversations have independent GitHub Actions runs and model budgets. */
export function geminiEngine(env: ConverterEnv, own: SettlingStore) {
  return createGeminiTextEngine({
    store: own,
    github: createGitHub(env, fetch, { workflow: 'gemini-text.yml', prefixes: ['gemini-text'] }),
  })
}

export { geminiTextKind }

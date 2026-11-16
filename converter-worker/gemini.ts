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
  const task = { workflow: 'gemini-text.yml', prefixes: ['gemini-text'] }
  const github = createGitHub(env, fetch, task)
  return createGeminiTextEngine({
    store: own,
    github: {
      ...github,
      async dispatch(inputs) {
        const job = await own.get(inputs.request_id)
        const options = 'options' in job ? job.options : undefined
        if (options && typeof options === 'object' && 'responseVersion' in options && options.responseVersion === 1) {
          // Only deployment configuration chooses executable code. Browser input cannot choose a Git ref.
          if (!env.GITHUB_GEMINI_RESPONSE_REF) throw new Error('Gemini response executor is not configured')
          return createGitHub(env, fetch, { ...task, ref: env.GITHUB_GEMINI_RESPONSE_REF }).dispatch(inputs)
        }
        return github.dispatch(inputs)
      },
    },
  })
}

export { geminiTextKind }

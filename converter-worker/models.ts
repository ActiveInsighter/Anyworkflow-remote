import { createGitHub } from './github.js'
import { readJson } from './http.js'

/** Only the trusted service binding can request a refresh. PB serializes refresh intents. */
export async function refreshModelCatalog(
  env: ConverterEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const post = async <T>(path: string, body: unknown) =>
    readJson<T>(
      await fetchImpl(`${env.POCKETBASE_URL.replace(/\/$/u, '')}/api/anyworkflow/models/catalog/${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.POCKETBASE_SERVER_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      }),
    )
  try {
    const intent = await post<{ dispatch: boolean; requestId?: string }>('begin', {})
    if (!intent.dispatch) return Response.json({ accepted: true }, { status: 202 })
    try {
      await createGitHub(env, fetchImpl, {
        workflow: 'gemini-models.yml',
        prefixes: ['gemini-models'],
      }).dispatch({ request_id: intent.requestId! })
    } catch {
      // An ambiguous dispatch can still finish with the same nonce. Keep it active
      // until the executor completes or the ten-minute lease can be reclaimed.
      return Response.json({ message: '模型目录同步尚未确认，请稍后查看或重新刷新。' }, { status: 502 })
    }
    return Response.json({ accepted: true }, { status: 202 })
  } catch {
    return Response.json({ message: '暂时无法刷新模型目录。' }, { status: 502 })
  }
}

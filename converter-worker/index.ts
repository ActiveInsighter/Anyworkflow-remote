import { DurableObject } from 'cloudflare:workers'
import { createFileConversionEngine, type TaskEngine, type TaskPassResult } from '../shared/task-kit/index.mjs'
import { CONVERTER_REF, createGitHub } from './github.js'
import { createStore } from './store.js'

/** External executors cannot push status: poll while anything is in flight. */
const POLL_MS = 30_000
/** Queued work left by a per-pass limit continues right away. */
const MORE_MS = 1_000

/**
 * The externally executed task kinds this coordinator drives. Each engine is
 * the shared task kit (vendored from AnyWorkflow-workers); a new kind - another
 * converter workflow, a different executor - is one more entry here.
 */
function createEngines(env: ConverterEnv): TaskEngine[] {
  return [createFileConversionEngine({ store: createStore(env), github: createGitHub(env) })]
}

type PassSummary = { at: string; kinds: Record<string, TaskPassResult> }

/**
 * One Durable Object instance serializes every pass, so the shared model quota
 * pool sees at most the engines' own concurrency. Only the alarm runs engines;
 * HTTP wakes and the cron safety net just arm it. PocketBase stays the single
 * source of truth: the object keeps only its alarm and the last pass summary.
 */
export class TaskCoordinator extends DurableObject<ConverterEnv> {
  async wake() {
    const alarm = await this.ctx.storage.getAlarm()
    if (alarm === null || alarm > Date.now() + MORE_MS) await this.ctx.storage.setAlarm(Date.now() + MORE_MS)
  }

  async status() {
    return {
      ref: CONVERTER_REF,
      enabled: this.env.CONVERTER_ENABLED === 'true',
      lastPass: (await this.ctx.storage.get<PassSummary>('lastPass')) ?? null,
    }
  }

  async alarm() {
    if (this.env.CONVERTER_ENABLED !== 'true') return
    // Arm recovery before external I/O, so a crash cannot strand a dispatch intent.
    await this.ctx.storage.setAlarm(Date.now() + POLL_MS)
    const summary: PassSummary = { at: new Date().toISOString(), kinds: {} }
    let failed: unknown = null
    for (const engine of createEngines(this.env)) {
      try {
        const result = await engine.runOnce()
        summary.kinds[engine.kind.id] = result
        console.log(JSON.stringify({ event: 'task_pass', kind: engine.kind.id, ...result }))
      } catch (error) {
        // One kind failing to list its queue must not stall the others.
        failed = error
        console.error(JSON.stringify({ event: 'task_pass_failed', kind: engine.kind.id, message: error instanceof Error ? error.message : 'Unknown error' }))
      }
    }
    await this.ctx.storage.put('lastPass', summary)
    // Keep the pre-armed alarm and let the platform retry the failed pass.
    if (failed) throw failed

    const results = Object.values(summary.kinds)
    if (results.some(result => result.more)) await this.ctx.storage.setAlarm(Date.now() + MORE_MS)
    else if (results.every(result => result.inFlight === 0 && result.errors === 0)) await this.ctx.storage.deleteAlarm()
  }
}

/** Bound in wrangler.converter.jsonc under its original name, which keeps the object's storage. */
export class ConversionCoordinator extends TaskCoordinator {}

export default {
  // Service binding only: no workers.dev URL or public route.
  async fetch(request: Request, env: ConverterEnv): Promise<Response> {
    const path = new URL(request.url).pathname
    const coordinator = env.CONVERSION_COORDINATOR.getByName('production')
    if (request.method === 'GET' && path === '/status') return Response.json(await coordinator.status())
    if (request.method !== 'POST' || path !== '/wake') return new Response('Not found', { status: 404 })
    if (env.CONVERTER_ENABLED !== 'true') return Response.json({ error: 'Converter is paused' }, { status: 503 })
    await coordinator.wake()
    return Response.json({ accepted: true }, { status: 202 })
  },
  async scheduled(_controller: ScheduledController, env: ConverterEnv): Promise<void> {
    if (env.CONVERTER_ENABLED === 'true') await env.CONVERSION_COORDINATOR.getByName('production').wake()
  },
} satisfies ExportedHandler<ConverterEnv>

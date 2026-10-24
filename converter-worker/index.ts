import { DurableObject } from 'cloudflare:workers'
import { CONVERTER_REF, createGitHub } from './github.js'
import { createPdfProcessor } from './processor.js'
import { createStore } from './store.js'

// One shared model quota pool is the coordination atom: only one Actions run at a time.
export class ConversionCoordinator extends DurableObject<ConverterEnv> {
  async wake() {
    const alarm = await this.ctx.storage.getAlarm()
    if (alarm === null || alarm > Date.now() + 1000) await this.ctx.storage.setAlarm(Date.now() + 1000)
  }

  async status() {
    return { ref: CONVERTER_REF, enabled: this.env.CONVERTER_ENABLED === 'true', lastPass: await this.ctx.storage.get('lastPass') ?? null }
  }

  async alarm() {
    if (this.env.CONVERTER_ENABLED !== 'true') return
    // Arm recovery before external I/O. A crash cannot strand a dispatch intent.
    await this.ctx.storage.setAlarm(Date.now() + 30_000)
    try {
      const store = createStore(this.env)
      const result = await createPdfProcessor({ store, github: createGitHub(this.env) }).runOnce()
      await this.ctx.storage.put('lastPass', { at: new Date().toISOString(), ...result })
      console.log(JSON.stringify({ event: 'converter_pass', ...result }))
      // Recheck persisted state: completed/uploaded jobs may have freed a slot.
      if ((await store.list(['queued', 'dispatching', 'pending', 'running', 'uploading'])).length === 0) await this.ctx.storage.deleteAlarm()
    } catch (error) {
      console.error(JSON.stringify({ event: 'converter_pass_failed', message: error instanceof Error ? error.message : 'Unknown error' }))
      // Keep the pre-armed alarm and also allow the platform retry.
      throw error
    }
  }
}

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

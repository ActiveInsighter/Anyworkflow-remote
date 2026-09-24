import assert from 'node:assert/strict'
import { createServer } from 'vite'

const storage = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem(key) { return storage.get(key) ?? null },
    setItem(key, value) { storage.set(key, value) },
    removeItem(key) { storage.delete(key) },
  },
})

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
const { setSession } = await server.ssrLoadModule('/src/lib/session.ts')
const { ApiError, resumeFailedRun } = await server.ssrLoadModule('/src/lib/api.ts')

setSession({
  token: 'session-token',
  record: { id: 'owner-1', email: 'owner@example.invalid' },
  baseUrl: 'https://pb.example.invalid',
})

const planText = `@run=Resume fixture
@task Search {
  @event Web {
    { search for an existing result }
  }
}`
const parentRun = {
  id: 'run-parent-1',
  owner: 'owner-1',
  title: 'Resume fixture',
  planText,
  planChecksum: 'a'.repeat(64),
  familyId: 'run-parent-1',
  versionNumber: 1,
  parentRun: '',
  origin: 'initial',
  executionMode: 'serial',
  maxConcurrency: 1,
  status: 'failed',
  requestedAction: 'none',
  commandVersion: 0,
  scheduledAt: '',
  totalTasks: 1,
  completedTasks: 0,
  lastError: 'fixture',
  startedAt: '2026-09-24T00:00:00.000Z',
  endedAt: '2026-09-24T00:01:00.000Z',
  created: '2026-09-24T00:00:00.000Z',
  updated: '2026-09-24T00:01:00.000Z',
}
const task = {
  id: 'task-source-1', owner: 'owner-1', run: parentRun.id, runIndex: 0,
  runPlanChecksum: parentRun.planChecksum, inheritedFrom: '', executorKind: 'browser',
  title: 'Search', planText: 'task plan', executionMode: 'serial', maxConcurrency: 1,
  orchestrationState: 'compiled', compileError: '', status: 'failed', requestedAction: 'none',
  totalEvents: 1, completedEvents: 0, lastError: 'fixture', startedAt: '', endedAt: '',
  created: parentRun.created, updated: parentRun.updated,
}
const event = {
  id: 'event-source-1', owner: 'owner-1', task: task.id, eventIndex: 0,
  queueTextOverride: '@task=Search\n@event=Web\n{ search }', status: 'terminal', attempt: 2,
  leaseId: '', leaseUntil: '', workerId: '', tabId: 0, localRunId: 'local-run-1', localAttempt: 1,
  queueChecksum: 'b'.repeat(64), inheritedFrom: '', resumeSpec: null, progress: { index: 2, total: 3 },
  lastHeartbeatAt: '', lastError: 'fixture', lastSeq: 8, terminalResult: 'failed',
  created: parentRun.created, updated: parentRun.updated,
}
const checkpoint = {
  id: 'checkpoint-1', owner: 'owner-1', run: parentRun.id, task: task.id, event: event.id,
  eventAttempt: event.attempt, checkpointSeq: 8, planChecksum: parentRun.planChecksum,
  queueChecksum: event.queueChecksum, nextNodeIndex: 2, totalNodes: 3, phase: 'continue',
  conversationUrl: 'https://chatgpt.com/c/conversation-1', providerState: {},
  created: parentRun.updated, updated: parentRun.updated,
}

async function runWithCheckpoint(latestCheckpoint) {
  const calls = []
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    calls.push({ url, init })
    if (url.pathname.endsWith('/aw_dispatch_tasks/records')) {
      return Response.json({ page: 1, perPage: 100, totalItems: 1, totalPages: 1, items: [task] })
    }
    if (url.pathname.endsWith('/aw_dispatch_events/records')) {
      return Response.json({ page: 1, perPage: 100, totalItems: 1, totalPages: 1, items: [event] })
    }
    if (url.pathname.endsWith('/aw_dispatch_checkpoints/records')) {
      return Response.json({ page: 1, perPage: 100, totalItems: 1, totalPages: 1, items: [latestCheckpoint] })
    }
    if (url.pathname.endsWith('/aw_dispatch_runs/records') && init.method === 'POST') {
      const body = JSON.parse(String(init.body))
      return Response.json({
        ...parentRun,
        id: 'run-child-2',
        title: 'Resume fixture',
        familyId: parentRun.familyId,
        versionNumber: 2,
        parentRun: body.parentRun,
        origin: body.origin,
        status: body.status,
      })
    }
    throw new Error(`Unexpected request: ${init.method || 'GET'} ${url.pathname}`)
  }
  try {
    return { result: await resumeFailedRun(parentRun), calls }
  } catch (error) {
    return { error, calls }
  }
}

const safeResult = await runWithCheckpoint(checkpoint)
assert.equal(safeResult.result?.id, 'run-child-2')
const createCall = safeResult.calls.find(({ url, init }) => url.pathname.endsWith('/aw_dispatch_runs/records') && init.method === 'POST')
assert.ok(createCall)
assert.equal(JSON.parse(String(createCall.init.body)).parentRun, parentRun.id)
assert.equal(JSON.parse(String(createCall.init.body)).origin, 'resume')

const unsafeResult = await runWithCheckpoint({ ...checkpoint, checkpointSeq: 9, phase: 'unsafe' })
assert.ok(unsafeResult.error instanceof ApiError)
assert.equal(unsafeResult.error.code, 'RUN_RESUME_CHECKPOINT_UNSAFE')
assert.equal(unsafeResult.calls.some(({ url, init }) => url.pathname.endsWith('/aw_dispatch_runs/records') && init.method === 'POST'), false)

console.log('Run family and checkpoint resume assertions passed')
} finally {
  await server.close()
}

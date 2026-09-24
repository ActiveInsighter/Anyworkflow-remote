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
const { ApiError, cloneRun, getHistoryMessageForAct, resumeFailedRun } = await server.ssrLoadModule('/src/lib/api.ts')

setSession({
  token: 'session-token',
  record: { id: 'owner-1', email: 'owner@example.invalid' },
  baseUrl: 'https://pb.example.invalid',
})

const savedMessage = {
  id: 'message-1',
  owner: 'owner-1',
  act: 'act-1',
  nodeIndex: 2,
  attempt: 1,
  status: 'succeeded',
  userMarkdown: '用户输入',
  assistantMarkdown: 'AI 回复',
  conversationUrl: '',
  sentAt: '2026-09-24T00:00:00.000Z',
  receivedAt: '2026-09-24T00:00:01.000Z',
  details: null,
  checksum: 'c'.repeat(64),
  created: '2026-09-24T00:00:00.000Z',
  updated: '2026-09-24T00:00:01.000Z',
}
let messageRequest
globalThis.fetch = async (input, init = {}) => {
  messageRequest = { url: new URL(String(input)), init }
  return Response.json({ page: 1, perPage: 1, totalItems: 1, totalPages: 1, items: [savedMessage] })
}
const queryController = new AbortController()
const loadedMessage = await getHistoryMessageForAct('act-1', 2, queryController.signal)
assert.deepEqual(loadedMessage, savedMessage)
assert.equal(messageRequest.url.pathname, '/api/collections/aw_messages/records')
assert.equal(messageRequest.url.searchParams.get('perPage'), '1', 'message detail reads a single matching row')
assert.equal(messageRequest.url.searchParams.get('filter'), 'act="act-1" && nodeIndex=2')
assert.equal(messageRequest.init.headers.Authorization, 'session-token')
assert.equal(messageRequest.init.signal, queryController.signal, 'closing the message view can cancel the request')
await assert.rejects(
  getHistoryMessageForAct('act-1', -1),
  (error) => error instanceof ApiError && error.code === 'HISTORY_MESSAGE_INDEX_INVALID',
)

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
  versionMajor: 1,
  versionMinor: 0,
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

const rerunCalls = []
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  rerunCalls.push({ url, init })
  if (url.pathname.endsWith('/aw_dispatch_runs/records') && init.method === 'POST') {
    const body = JSON.parse(String(init.body))
    return Response.json({
      ...parentRun,
      id: 'run-rerun-1',
      title: body.title,
      familyId: parentRun.familyId,
      versionNumber: 2,
      versionMajor: 1,
      versionMinor: 1,
      parentRun: body.parentRun,
      origin: body.origin,
      planText: body.planText,
      status: body.status,
    })
  }
  throw new Error(`Unexpected rerun request: ${init.method || 'GET'} ${url.pathname}`)
}

const rerun = await cloneRun(parentRun, 'queued')
const rerunCreateCall = rerunCalls.find(({ url, init }) => url.pathname.endsWith('/aw_dispatch_runs/records') && init.method === 'POST')
assert.ok(rerunCreateCall)
const rerunBody = JSON.parse(String(rerunCreateCall.init.body))
assert.equal(rerunBody.planText, parentRun.planText, 'reruns must keep the exact workflow content')
assert.equal(rerunBody.title, `${parentRun.title} · 重跑`, 'rerun labels belong in the Run title, not @run metadata')
assert.equal(rerun.versionMajor, 1)
assert.equal(rerun.versionMinor, 1)

const viewSource = await (await import('node:fs/promises')).readFile(new URL('../src/pages/RunDetailPage.tsx', import.meta.url), 'utf8')
const selectorStart = viewSource.indexOf('aria-label="选择 Run 版本"')
assert.notEqual(selectorStart, -1, 'Run versions should be an accessible local selector')
const selectorEnd = viewSource.indexOf('</Panel>', selectorStart)
const selectorSource = viewSource.slice(selectorStart, selectorEnd)
assert.match(selectorSource, /aria-pressed=/u)
assert.match(selectorSource, /selectVersion\(version\.id\)/u)
assert.doesNotMatch(selectorSource, /<Link|navigate\(/u, 'switching versions must keep the current route')
assert.match(viewSource, /setTaskPageSelection\(/u, 'Task pagination should stay in component state')
assert.doesNotMatch(viewSource, /setSearchParams\(/u, 'Run detail view-only controls must not push URL history')
const librarySource = await (await import('node:fs/promises')).readFile(new URL('../src/pages/LibraryPage.tsx', import.meta.url), 'utf8')
assert.equal((librarySource.match(/setSearchParams\(params, \{ replace: true \}\)/gu) || []).length, 2,
  'library Tab and folder selections should replace the current history entry')
const actNodeSource = await (await import('node:fs/promises')).readFile(new URL('../src/components/run/RunActNode.tsx', import.meta.url), 'utf8')
const messageNodeSource = await (await import('node:fs/promises')).readFile(new URL('../src/components/run/RunMessageNode.tsx', import.meta.url), 'utf8')
assert.match(actNodeSource, /<HistoryMessageNode/u, 'each persisted Act should expose Message child nodes')
assert.doesNotMatch(actNodeSource, /listAllHistoryMessagesForAct/u, 'opening an Act must not fetch message bodies')
assert.match(messageNodeSource, /aria-label=\{`查看消息/u, 'message content stays behind an explicit, accessible action')
assert.match(messageNodeSource, /enabled: open/u, 'message records are fetched only while the detail dialog is open')
assert.match(messageNodeSource, /message\.userMarkdown/u)
assert.match(messageNodeSource, /message\.assistantMarkdown/u)
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

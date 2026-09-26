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
const { ApiError, cloneRun, createRun, getHistoryMessageForAct, resumeFailedRun, updateRunDraft } = await server.ssrLoadModule('/src/lib/api.ts')

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
globalThis.fetch = async (input) => {
  const url = new URL(String(input))
  assert.equal(url.searchParams.get('filter'), 'act="act-1"', 'unknown message counts query the first record only after click')
  return Response.json({ page: 1, perPage: 1, totalItems: 1, totalPages: 1, items: [savedMessage] })
}
assert.equal((await getHistoryMessageForAct('act-1', null))?.id, savedMessage.id)

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

const createPlan = `@run=Resume fixture
@task Search {
  @event Web {
    { search for an existing result }
  }
}`
const recentCreatedRun = {
  ...parentRun,
  id: 'run-save-confirmed',
  planText: createPlan,
  planChecksum: 'd'.repeat(64),
  title: 'Resume fixture',
  status: 'draft',
  scheduledAt: '',
  created: new Date(Date.now() - 60_000).toISOString(),
  updated: new Date().toISOString(),
}
const createRecoveryCalls = []
let submittedRunId
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  createRecoveryCalls.push({ url, init })
  if (url.pathname.endsWith('/aw_dispatch_runs/records') && init.method === 'POST') {
    submittedRunId = JSON.parse(String(init.body)).id
    assert.match(submittedRunId, /^[a-z0-9]{15}$/u)
    return Response.json({ message: 'Something went wrong while processing your request.' }, { status: 500 })
  }
  if (url.pathname.endsWith(`/aw_dispatch_runs/records/${submittedRunId}`) && init.method === 'GET') {
    return Response.json({ ...recentCreatedRun, id: submittedRunId })
  }
  throw new Error(`Unexpected create recovery request: ${init.method || 'GET'} ${url.pathname}`)
}
const recoveredCreate = await createRun(createPlan, 'draft')
assert.equal(recoveredCreate.id, submittedRunId, 'a server error after commit should be confirmed by the submitted Run ID')
const ambiguousCreateCall = createRecoveryCalls.find(({ url, init }) => url.pathname.endsWith('/aw_dispatch_runs/records') && init.method === 'POST')
assert.equal(Object.hasOwn(JSON.parse(String(ambiguousCreateCall.init.body)), 'scheduledAt'), false,
  'immediate Runs should omit the optional date field instead of sending an empty date')

let interruptedRunId
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  if (url.pathname.endsWith('/aw_dispatch_runs/records') && init.method === 'POST') {
    interruptedRunId = JSON.parse(String(init.body)).id
    return { status: 200, ok: true, text: async () => { throw new TypeError('response stream interrupted') } }
  }
  if (url.pathname.endsWith(`/aw_dispatch_runs/records/${interruptedRunId}`) && init.method === 'GET') {
    return Response.json({ ...recentCreatedRun, id: interruptedRunId })
  }
  throw new Error(`Unexpected interrupted create request: ${init.method || 'GET'} ${url.pathname}`)
}
assert.equal((await createRun(createPlan, 'draft')).id, interruptedRunId,
  'a committed POST with an interrupted response body is confirmed by its exact ID')

const versionConflict = {
  message: 'Failed to create record.',
  data: {
    familyId: { code: 'validation_not_unique', message: 'Value must be unique.' },
    versionMajor: { code: 'validation_not_unique', message: 'Value must be unique.' },
    versionMinor: { code: 'validation_not_unique', message: 'Value must be unique.' },
  },
}
let versionCreateCount = 0
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  if (!url.pathname.endsWith('/aw_dispatch_runs/records') || init.method !== 'POST') {
    throw new Error(`Unexpected version create request: ${init.method || 'GET'} ${url.pathname}`)
  }
  versionCreateCount += 1
  return versionCreateCount === 1
    ? Response.json(versionConflict, { status: 400 })
    : Response.json({ ...recentCreatedRun, id: 'run-retried-version' })
}
const retriedVersion = await createRun(createPlan, 'draft', '', { parentRun: parentRun.id, origin: 'rerun' })
assert.equal(retriedVersion.id, 'run-retried-version')
assert.equal(versionCreateCount, 2, 'only a verified unique version collision should be retried')

let unrelatedCreateCount = 0
globalThis.fetch = async () => {
  unrelatedCreateCount += 1
  return Response.json({ message: 'Invalid parent Run.' }, { status: 400 })
}
await assert.rejects(createRun(createPlan, 'draft', '', { parentRun: parentRun.id, origin: 'rerun' }),
  (error) => error instanceof ApiError && error.status === 400)
assert.equal(unrelatedCreateCount, 1, 'other validation errors must not be retried')

const draftBeforeSave = { ...parentRun, id: 'run-draft-save', status: 'draft', scheduledAt: '' }
const draftAfterSave = { ...draftBeforeSave, planText: createPlan, title: 'Resume fixture', executionMode: 'serial', maxConcurrency: 1 }
let draftReadCount = 0
let draftPatchBody
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  if (url.pathname.endsWith('/aw_dispatch_runs/records/run-draft-save') && init.method === 'GET') {
    draftReadCount += 1
    return Response.json(draftReadCount === 1 ? draftBeforeSave : draftAfterSave)
  }
  if (url.pathname.endsWith('/aw_dispatch_runs/records/run-draft-save') && init.method === 'PATCH') {
    draftPatchBody = JSON.parse(String(init.body))
    return Response.json({ message: 'Something went wrong while processing your request.' }, { status: 500 })
  }
  throw new Error(`Unexpected draft recovery request: ${init.method || 'GET'} ${url.pathname}`)
}
const recoveredDraft = await updateRunDraft(draftBeforeSave.id, createPlan, { scheduledAt: '' })
assert.equal(recoveredDraft.planText, createPlan, 'a draft PATCH committed before a server error should be confirmed by re-reading it')
assert.equal(Object.hasOwn(draftPatchBody, 'scheduledAt'), false,
  'saving an already unscheduled draft should omit the unchanged blank date field')

const scheduledDraft = { ...draftBeforeSave, id: 'run-scheduled-draft', scheduledAt: '2026-09-25T12:00:00.000Z' }
const clearedScheduledDraft = { ...scheduledDraft, scheduledAt: '' }
let clearedSchedulePatchBody
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  if (url.pathname.endsWith('/aw_dispatch_runs/records/run-scheduled-draft') && init.method === 'GET') {
    return Response.json(scheduledDraft)
  }
  if (url.pathname.endsWith('/aw_dispatch_runs/records/run-scheduled-draft') && init.method === 'PATCH') {
    clearedSchedulePatchBody = JSON.parse(String(init.body))
    return Response.json(clearedScheduledDraft)
  }
  throw new Error(`Unexpected scheduled draft request: ${init.method || 'GET'} ${url.pathname}`)
}
await updateRunDraft(scheduledDraft.id, createPlan, { scheduledAt: '' })
assert.equal(clearedSchedulePatchBody.scheduledAt, '', 'clearing an existing schedule should still send an explicit empty date')

const fallbackDispatchEvent = {
  id: 'event-fallback-2', owner: 'owner-1', task: 'dispatch-task-1', eventIndex: 2,
  queueTextOverride: '', status: 'terminal', attempt: 1, leaseId: '', leaseUntil: '', workerId: '', tabId: 0,
  localRunId: 'plugin-local-run', localAttempt: 1, queueChecksum: null, inheritedFrom: '', resumeSpec: null,
  progress: null, lastHeartbeatAt: '', lastError: '', lastSeq: 0, terminalResult: 'succeeded',
  created: parentRun.created, updated: parentRun.updated,
}
const historyBackfillCalls = []
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  historyBackfillCalls.push({ url, init })
  if (url.pathname.endsWith('/aw_events/records') && init.method === 'GET') {
    assert.match(url.searchParams.get('filter') || '', /task\.taskId="plugin-local-run"/u)
    if (/eventIndex/u.test(url.searchParams.get('filter') || '')) {
      assert.match(url.searchParams.get('filter') || '', /eventIndex = 2/u,
        'first try the direct dispatch-to-history Event mapping')
      return Response.json({ page: 1, perPage: 100, totalItems: 0, totalPages: 0, items: [] })
    }
    return Response.json({ page: 1, perPage: 100, totalItems: 1, totalPages: 1, items: [{
      id: 'history-event-0', owner: 'owner-1', task: 'history-task-1', eventIndex: 0,
      attempt: 1, status: 'succeeded', title: 'Web', startedAt: '', endedAt: '', durationMs: 1,
      details: null, checksum: '', isPlaceholder: false, actCount: 1, messageCount: 1,
      created: parentRun.created, updated: parentRun.updated,
    }] })
  }
  if (url.pathname.endsWith('/aw_acts/records') && init.method === 'GET') {
    assert.match(url.searchParams.get('filter') || '', /event="history-event-0"/u)
    return Response.json({ page: 1, perPage: 100, totalItems: 1, totalPages: 1, items: [{
      id: 'history-act-0', owner: 'owner-1', event: 'history-event-0', actIndex: 0, attempt: 1,
      status: 'succeeded', title: 'Act 1', startedAt: '', endedAt: '', durationMs: 1, details: null,
      checksum: '', isPlaceholder: false, startNodeIndex: 0, endNodeIndex: 0, messageCount: 1,
      created: parentRun.created, updated: parentRun.updated,
    }] })
  }
  if (url.pathname.endsWith('/aw_messages/records') && init.method === 'GET') {
    assert.match(url.searchParams.get('filter') || '', /act="history-act-0" && nodeIndex=0/u)
    return Response.json({ page: 1, perPage: 1, totalItems: 1, totalPages: 1, items: [savedMessage] })
  }
  throw new Error(`Unexpected history recovery request: ${init.method || 'GET'} ${url.pathname}`)
}
const { getHistoryMessageForDispatchEvent } = await server.ssrLoadModule('/src/lib/api.ts')
const recoveredHistoryMessage = await getHistoryMessageForDispatchEvent(fallbackDispatchEvent, 0, 0)
assert.equal(recoveredHistoryMessage?.id, savedMessage.id,
  'fallback Acts should resolve their messages through the single local history Event')
assert.equal(historyBackfillCalls.length, 4, 'the fallback query should resolve one Event, one Act, and one Message after an exact-index miss')

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
assert.match(viewSource, /setTaskPageSelection\(/u, 'Task pagination should stay in component state')
assert.doesNotMatch(viewSource, /setSearchParams\(/u, 'Run detail view-only controls must not push URL history')
const librarySource = await (await import('node:fs/promises')).readFile(new URL('../src/pages/LibraryPage.tsx', import.meta.url), 'utf8')
assert.equal((librarySource.match(/setSearchParams\(params, \{ replace: true \}\)/gu) || []).length, 2,
  'library Tab and folder selections should replace the current history entry')
const actNodeSource = await (await import('node:fs/promises')).readFile(new URL('../src/components/run/RunActNode.tsx', import.meta.url), 'utf8')
const messageNodeSource = await (await import('node:fs/promises')).readFile(new URL('../src/components/run/RunMessageNode.tsx', import.meta.url), 'utf8')
assert.match(actNodeSource, /<HistoryMessageNode/u, 'each persisted Act should expose Message child nodes')
const { renderToStaticMarkup } = await import('react-dom/server')
const { createElement } = await import('react')
const { FallbackActNode } = await server.ssrLoadModule('/src/components/run/RunActNode.tsx')
const fallbackHtml = renderToStaticMarkup(createElement(FallbackActNode, { act: { id: 'act-1', title: 'Planned Act', messageCount: 24, state: 'completed' } }))
assert.ok(!fallbackHtml.includes('查看消息'), 'planned counts must never create clickable message records')
assert.ok(fallbackHtml.includes('暂无消息'))
assert.doesNotMatch(actNodeSource, /listAllHistoryMessagesForAct/u, 'opening an Act must not fetch message bodies')
assert.match(messageNodeSource, /aria-label=\{`查看\$\{messageTitle\}/u, 'message content stays behind an explicit, accessible action')
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

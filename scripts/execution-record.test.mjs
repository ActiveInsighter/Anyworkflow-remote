import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { eventTitle, eventProgressSummary, eventPendingNote } = await server.ssrLoadModule('/src/features/runs/lib/event-progress.ts')
  const { executionPollMs } = await server.ssrLoadModule('/src/features/runs/lib/polling.ts')
  const { POLL_MS } = await server.ssrLoadModule('/src/features/runs/lib/constants.ts')
  const { actStatusMeta, messageStatusMeta, eventIsActive } = await server.ssrLoadModule('/src/lib/domain/run-status.ts')

  // The Event name is the queue's leading @event=; an Act's own @event= must never rename the Event.
  assert.equal(eventTitle({ eventIndex: 0, queueTextOverride: '@task=T\n@event=整理\n@act {\n  @event=准备\n  { a }\n}' }), '整理')
  assert.equal(eventTitle({ eventIndex: 2, queueTextOverride: '@act {\n  @event=准备\n  { a }\n}' }), 'Event 3')
  assert.equal(eventTitle({ eventIndex: 1, queueTextOverride: '' }), 'Event 2')

  // The progress line reads the dispatch record only, so it does not change when the row opens.
  const queue = '@event=循环\n@for i in range(1, 3) {\n  { 第%i%项 }\n}'
  const event = { queueTextOverride: queue, progress: { index: 1, total: 3 }, terminalResult: '', status: 'running' }
  assert.equal(eventProgressSummary(event), '1 / 3 Acts', 'planned totals feed the count, not the rows')
  assert.equal(eventProgressSummary({ ...event, terminalResult: 'succeeded', status: 'terminal' }), '3 / 3 Acts')
  assert.equal(eventProgressSummary({ queueTextOverride: '', progress: null, terminalResult: '', status: 'ready' }), '等待执行器领取')

  for (const status of ['waiting', 'ready', 'leased', 'running', 'paused', 'terminal']) {
    assert.ok(eventPendingNote(status).length > 0, `${status} explains why no Act is listed`)
  }

  // Unfinalized history rows are in flight while the Event works and merely unsynced afterwards.
  assert.equal(actStatusMeta('unknown', true).label, '进行中')
  assert.equal(actStatusMeta('unknown', false).label, '状态未同步')
  assert.equal(actStatusMeta('failed', true).label, '失败')
  assert.equal(messageStatusMeta({ status: 'unknown', receivedAt: '' }, true).label, '等待回复')
  assert.equal(messageStatusMeta({ status: 'unknown', receivedAt: '' }, false).label, '未收到回复')
  assert.equal(messageStatusMeta({ status: 'unknown', receivedAt: '2026-10-19 09:00:00.000Z' }, false).label, '已回复')
  assert.equal(eventIsActive('running'), true)
  assert.equal(eventIsActive('ready'), false)

  // Active and recently finished records refresh quickly; long-finished ones slow down but never stop.
  const iso = (offsetMs) => new Date(Date.now() - offsetMs).toISOString()
  assert.equal(executionPollMs({ terminal: false, updated: iso(3_600_000) }), POLL_MS.hierarchy)
  assert.equal(executionPollMs({ terminal: true, updated: iso(60_000) }), POLL_MS.hierarchy)
  assert.equal(executionPollMs({ terminal: true, updated: iso(3_600_000) }), POLL_MS.settled)
  assert.equal(executionPollMs({ terminal: true, updated: iso(3_600_000).replace('T', ' ') }), POLL_MS.settled,
    'PocketBase space-separated timestamps parse the same way')
  assert.equal(executionPollMs({ terminal: true, updated: '' }), POLL_MS.hierarchy, 'unparseable times stay on the fast refresh')

  console.log('execution-record: event title, progress, pending notes, status wording and refresh cadence passed')
} finally {
  await server.close()
}

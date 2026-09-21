import assert from 'node:assert/strict'

const { selectHistoryEventsForDispatchEvent } = await import('../src/lib/history.ts')

const historyEvents = [
  { id: 'history-0', eventIndex: 0 },
  { id: 'history-1', eventIndex: 1 },
  { id: 'history-2', eventIndex: 2 },
]

assert.deepEqual(
  selectHistoryEventsForDispatchEvent(historyEvents, { eventIndex: 1 }),
  [historyEvents[1]],
)
assert.deepEqual(
  selectHistoryEventsForDispatchEvent(historyEvents, { eventIndex: 9 }),
  [],
)

console.log('history selection assertions passed')

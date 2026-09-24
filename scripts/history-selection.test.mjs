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
assert.deepEqual(
  selectHistoryEventsForDispatchEvent([{ id: 'plugin-history-event', eventIndex: 0 }], { eventIndex: 2 }),
  [{ id: 'plugin-history-event', eventIndex: 0 }],
  'a single local history event can map to a dispatch Event with a different index',
)
assert.deepEqual(
  selectHistoryEventsForDispatchEvent([
    { id: 'plugin-history-event-1', eventIndex: 0 },
    { id: 'plugin-history-event-2', eventIndex: 0 },
  ], { eventIndex: 2 }),
  [],
  'ambiguous local events must not be attached to the wrong dispatch Event',
)

console.log('history selection assertions passed')

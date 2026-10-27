/**
 * Async task lifecycle shared by every kind of background work.
 *
 * Each kind keeps its own record statuses (PocketBase collections and command
 * semantics stay compatible), and maps every status onto one canonical state.
 * Schedulers, processors and the web console reason about the canonical
 * state; only the kind's own handlers look at its raw statuses.
 *
 *   queued    accepted, waiting for a slot, a due time or a retry
 *   running   owned by a processor or an external executor
 *   succeeded finished with its full result
 *   partial   finished with a usable but incomplete result
 *   failed    finished without a result
 *   canceled  stopped on request (may still carry a partial result)
 *   expired   finished earlier; its result has been removed
 *   idle      not submitted yet (a draft); neither active nor finished
 *
 * This module is platform neutral (no node:/cloudflare: imports) and is
 * vendored into Anyworkflow-remote. Edit it here, then run the sync script
 * there (scripts/sync-task-kit.mjs) so both copies stay byte-identical.
 */

export const TASK_STATES = Object.freeze(['idle', 'queued', 'running', 'succeeded', 'partial', 'failed', 'canceled', 'expired']);

const ACTIVE = new Set(['queued', 'running']);

export function isActiveState(state) {
  return ACTIVE.has(state);
}

export function isTerminalState(state) {
  return TASK_STATES.includes(state) && state !== 'idle' && !ACTIVE.has(state);
}

/** Terminal states whose record still carries a downloadable result. */
export function hasResultState(state) {
  return state === 'succeeded' || state === 'partial' || state === 'canceled';
}

/**
 * Describe a kind of async task.
 *
 * @param {object} spec
 * @param {string} spec.id            stable kind id (`file-conversion`, `run-export`, `run`)
 * @param {string} spec.collection    PocketBase collection holding its records
 * @param {Record<string, string>} spec.statuses  raw status -> canonical state
 * @param {'flag'|'command'|'none'} [spec.cancel]  how a cancel is requested:
 *        `flag` sets `cancelRequested`, `command` writes `requestedAction`
 * @param {(record: object) => number|null} [spec.progress]  0-100, or null when unknown
 * @param {(record: object) => boolean} [spec.stopping]  a cancel is pending on an active record
 */
export function defineTaskKind({ id, collection, statuses, cancel = 'none', progress = () => null, stopping = () => false }) {
  if (typeof id !== 'string' || !id) throw new TypeError('Task kind id is required.');
  if (typeof collection !== 'string' || !collection) throw new TypeError(`Task kind ${id} needs a collection.`);
  const entries = Object.entries(statuses ?? {});
  if (entries.length === 0) throw new TypeError(`Task kind ${id} needs statuses.`);
  for (const [status, state] of entries) {
    if (!TASK_STATES.includes(state)) throw new TypeError(`Task kind ${id} maps ${status} to unknown state ${state}.`);
  }
  if (!['flag', 'command', 'none'].includes(cancel)) throw new TypeError(`Task kind ${id} has an unknown cancel mode.`);
  const table = Object.freeze(Object.fromEntries(entries));

  /** Raw statuses in any of the given canonical states, in declaration order. */
  function statusesIn(...states) {
    return entries.filter(([, state]) => states.includes(state)).map(([status]) => status);
  }

  /** Unknown statuses read as failed: never treat a record we cannot interpret as live work. */
  function stateOf(status) {
    return table[status] ?? 'failed';
  }

  return Object.freeze({
    id,
    collection,
    cancel,
    statuses: table,
    statusesIn,
    stateOf,
    isActive: (status) => isActiveState(stateOf(status)),
    isTerminal: (status) => isTerminalState(stateOf(status)),
    /** The canonical view of one record; the console renders every kind from this. */
    describe(record) {
      const state = stateOf(record?.status);
      const active = isActiveState(state);
      const value = active || state === 'succeeded' ? progress(record) : null;
      return {
        kind: id,
        id: record?.id ?? '',
        status: record?.status ?? '',
        state,
        active,
        stopping: active && Boolean(stopping(record)),
        progress: Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null,
      };
    },
  });
}

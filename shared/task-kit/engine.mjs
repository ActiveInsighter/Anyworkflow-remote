/**
 * Task engine: one pass over a kind's active records.
 *
 * A pass first advances every task that already left the queue (polling an
 * external executor, reclaiming an expired lease), then starts queued tasks
 * while slots remain. Each step is isolated: a failing task is reported to the
 * kind's error policy with its freshly read record and never stops the pass.
 *
 * The engine is the same whether it is hosted by a Node job (realtime events,
 * deadline timers) or a Cloudflare Durable Object alarm; the host only decides
 * when to call `runOnce()` and reads the result to plan the next pass:
 *
 *   inFlight > 0  something is running; poll it again
 *   more          queued work was left for the next pass (per-pass start limit)
 *   errors > 0    retry with backoff
 *
 * Platform neutral; vendored into Anyworkflow-remote with lifecycle.mjs.
 *
 * @typedef {object} TaskStore
 * @property {(statuses: string[], context: {now: number}) => Promise<object[]>} list
 *   Records in the given raw statuses that this pass may act on. A store may
 *   omit queued records that are not due yet (retry backoff).
 * @property {(id: string) => Promise<object>} get
 * @property {(id: string, data: object) => Promise<unknown>} patch
 *
 * @typedef {object} TaskHandlers
 * @property {(task: object, context: object) => Promise<false|'done'|void>} start
 *   Move a queued task forward. Return `false` when it did not start
 *   (canceled while queued, claim lost) and `'done'` when the work ran to the
 *   end inside the call; otherwise the task now holds a slot until it settles.
 * @property {(task: object, context: object) => Promise<void>} advance
 *   Move an in-flight task forward, or leave it when there is nothing to do.
 */

function message(error) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function createTaskEngine({
  kind,
  store,
  handlers,
  concurrency = 1,
  maxStartsPerPass = Number.POSITIVE_INFINITY,
  onError = null,
  now = () => Date.now(),
  log = (line) => console.error(line),
}) {
  if (!kind?.statusesIn) throw new TypeError('createTaskEngine needs a task kind.');
  if (typeof handlers?.start !== 'function' || typeof handlers?.advance !== 'function') {
    throw new TypeError(`Task kind ${kind.id} needs start and advance handlers.`);
  }
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be a positive integer.');
  if (!(maxStartsPerPass >= 1)) throw new RangeError('maxStartsPerPass must be at least 1.');

  const running = kind.statusesIn('running');
  const queued = kind.statusesIn('queued');
  const context = () => ({ kind, store, now: now(), log });

  async function step(task, handler) {
    try {
      return { ok: true, value: await handler(task, context()) };
    } catch (error) {
      log(JSON.stringify({ event: 'task_step_failed', kind: kind.id, taskId: task.id, status: task.status, message: message(error) }));
      if (onError) {
        try {
          // The step may have committed before it failed: decide on the record as it is now.
          const current = await store.get(task.id);
          if (current && kind.isActive(current.status)) await onError({ task: current, error, store, now: now(), kind });
        } catch (policyError) {
          log(JSON.stringify({ event: 'task_error_policy_failed', kind: kind.id, taskId: task.id, message: message(policyError) }));
        }
      }
      return { ok: false };
    }
  }

  return {
    kind,
    async runOnce() {
      // Separate reads: a long queue must never push running tasks out of a bounded page.
      const [inFlight, waiting] = await Promise.all([store.list(running, { now: now() }), store.list(queued, { now: now() })]);
      let errors = 0;

      for (const task of inFlight) {
        if (!(await step(task, handlers.advance)).ok) errors++;
      }

      // Re-read: tasks that finished in this pass free their slot.
      const occupied = inFlight.length > 0 ? (await store.list(running, { now: now() })).length : 0;
      let holding = 0;
      let finished = 0;
      let attempted = 0;
      for (const task of waiting) {
        if (occupied + holding >= concurrency || attempted >= maxStartsPerPass) break;
        attempted++;
        const result = await step(task, handlers.start);
        if (!result.ok) errors++;
        else if (result.value === 'done') finished++;
        else if (result.value !== false) holding++;
      }

      return {
        checked: inFlight.length + attempted,
        errors,
        inFlight: occupied + holding,
        started: holding + finished,
        more: waiting.length > attempted && occupied + holding < concurrency,
      };
    },
  };
}

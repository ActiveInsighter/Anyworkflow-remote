/**
 * Retry policies for async task processors. Platform neutral; vendored into
 * Anyworkflow-remote together with lifecycle.mjs.
 */

/**
 * Exponential backoff: `baseMs * factor^(attempt-1)`, capped at `maxMs`.
 * `attempt` is 1 for the first retry.
 */
export function exponentialBackoff({ baseMs, maxMs, factor = 2 }) {
  if (!(baseMs > 0) || !(maxMs >= baseMs) || !(factor >= 1)) throw new RangeError('Invalid backoff.');
  return (attempt) => Math.min(maxMs, baseMs * factor ** Math.max(0, Math.min(Number(attempt) - 1, 30)));
}

/**
 * Error policy for tasks whose work happens elsewhere (an external executor
 * that is polled). A failed step leaves the task in its current status and
 * counts consecutive failures on `field`; the next successful step must reset
 * the counter. After `max` failures the task fails, except while `holdStatuses`
 * apply: those steps may already have committed outside (a paid dispatch), so
 * they are never failed blindly - their handler reconciles them instead.
 */
export function countFailures({ field = 'syncFailures', max, message, exhaustedMessage, holdStatuses = [] }) {
  if (!Number.isSafeInteger(max) || max < 1) throw new RangeError('countFailures needs a positive max.');
  return async ({ task, store, now }) => {
    const failures = (Number(task[field]) || 0) + 1;
    const exhausted = failures >= max && !holdStatuses.includes(task.status);
    await store.patch(task.id, {
      [field]: failures,
      error: message(task),
      ...(exhausted ? { status: 'failed', finishedAt: new Date(now).toISOString(), error: exhaustedMessage(task, failures) } : {}),
    });
  };
}

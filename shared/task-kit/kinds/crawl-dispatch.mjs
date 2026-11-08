import { crawlDispatchKind } from '../catalog.mjs';
import { createTaskEngine } from '../engine.mjs';
import { DEFAULT_GITHUB_MESSAGES, githubActionsErrorMessage, githubActionsHandlers } from '../executors/github-actions.mjs';
import { countFailures } from '../retry.mjs';

/**
 * Cloud crawl dispatch = one run of the crawler's `crawl.yml` workflow, hosted by the Node
 * scheduler. The workflow receives only the dispatch id and claims cloud jobs from PocketBase
 * until the queue is empty, so no URL reaches the public repository's run logs. When the
 * workflow run ends, `store.settle` lets PocketBase requeue whatever it still held and set the
 * dispatch's final status in one transaction.
 */

const MESSAGES = Object.freeze({
  ...DEFAULT_GITHUB_MESSAGES,
  reconcileFailed: '无法确认 GitHub 是否接收这次云端运行，为避免重复执行未自动重新提交。',
});

/** The dispatch id is the only input; the workflow reads everything else from PocketBase. */
export function buildCrawlWorkflowInputs(row) {
  const id = String(row.id || '');
  if (!/^[a-z0-9]{15}$/u.test(id)) throw new Error('Invalid crawl dispatch id');
  return { dispatch_id: id };
}

/**
 * Dispatches share free public-repository runners, so a few at a time keeps a large queue from
 * starving other work; each one already works through up to its share of the queue.
 */
export function createCrawlDispatchEngine({ store, github, concurrency = 3, now, log }) {
  return createTaskEngine({
    kind: crawlDispatchKind,
    store,
    handlers: githubActionsHandlers({
      github,
      inputs: buildCrawlWorkflowInputs,
      settle: (task, run) => store.settle(task.id, { conclusion: run.conclusion || 'unknown' }),
      messages: MESSAGES,
    }),
    concurrency,
    onError: countFailures({
      max: 30,
      // A failed dispatching step may have reached GitHub: reconcile, never fail it blindly.
      holdStatuses: ['dispatching'],
      message: (task) => githubActionsErrorMessage(task, MESSAGES),
      exhaustedMessage: (_task, failures) => MESSAGES.syncExhausted(failures),
    }),
    ...(now ? { now } : {}),
    ...(log ? { log } : {}),
  });
}

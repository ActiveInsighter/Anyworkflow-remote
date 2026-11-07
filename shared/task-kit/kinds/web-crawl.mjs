import { webCrawlKind } from '../catalog.mjs';
import { createTaskEngine } from '../engine.mjs';
import { DEFAULT_GITHUB_MESSAGES, githubActionsErrorMessage, githubActionsHandlers } from '../executors/github-actions.mjs';
import { countFailures } from '../retry.mjs';

/**
 * Web crawl = the web-crawl kind executed by webpage-parser-action's
 * `crawl-run.yml` workflow, hosted by the Node scheduler.
 *
 * The workflow receives only the run id. It reads the run's target snapshot
 * from PocketBase, writes contents and reports each target there, so no URL
 * reaches the public repository's run logs. When the workflow run ends,
 * `store.settle` lets PocketBase fill in targets that were never reported and
 * set the final status in one transaction.
 */

const MESSAGES = Object.freeze({
  ...DEFAULT_GITHUB_MESSAGES,
  reconcileFailed: '无法确认 GitHub 是否接收这批抓取，为避免重复执行未自动重新提交，请稍后重新抓取。',
});

/** The run id is the only input; everything else is read from the saved run. */
export function buildCrawlWorkflowInputs(row) {
  const id = String(row.id || '');
  if (!/^[a-z0-9]{15}$/u.test(id)) throw new Error('Invalid crawl run id');
  return { request_id: id };
}

/**
 * Runs share free public-repository runners, so a few at a time keeps a large
 * schedule from queueing behind itself; each run already crawls up to 10 pages.
 */
export function createWebCrawlEngine({ store, github, concurrency = 3, now, log }) {
  return createTaskEngine({
    kind: webCrawlKind,
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

/**
 * Task handlers for work executed by a GitHub Actions workflow_dispatch run.
 *
 *   queued ──start──▶ dispatching ──▶ pending ──▶ running ──▶ uploading ──▶ succeeded
 *                                                                        ├─▶ partial
 *                                                                        ├─▶ failed
 *                                                                        └─▶ canceled
 *
 * Dispatching is billed work, so a dispatch intent is persisted before the
 * request and never re-sent: when its response is lost, the run is found by
 * the request id in its title, and after `reconcileWindowMs` without a match
 * the task fails with an explanation instead of dispatching again.
 * Cancellation is a flag (`cancelRequested`) honoured at every step; a
 * canceled run still keeps the artifact it produced.
 *
 * The artifact upload is the store's concern (`store.upload`): Node buffers it
 * into a FormData, Cloudflare streams it. Both keep PocketBase the authority.
 *
 * Platform neutral; vendored into Anyworkflow-remote with lifecycle.mjs.
 */

export const DEFAULT_GITHUB_MESSAGES = Object.freeze({
  reconcileFailed: '无法确认 GitHub 是否接收任务，请检查运行记录后再新建任务。为避免重复计费，未自动重新提交。',
  reconcileCanceled: '未找到对应的 GitHub 运行，请检查运行记录。',
  reconciling: '正在核对 GitHub 提交结果，请勿重复提交。',
  reconcilingCancel: '正在确认 GitHub 运行并取消。',
  noArtifact: (conclusion) => `转换未生成产物（${conclusion || 'unknown'}），可查看 GitHub 运行详情。`,
  canceledWithArtifact: '已取消；可下载已保存的产物。',
  partial: '部分转换未完成，请检查 ZIP 中 source.md 标明的缺失页码，并查看 GitHub 运行日志。',
  stepFailed: '状态或产物同步暂时失败，稍后自动重试。',
  cancelPending: '取消暂未完成，稍后自动重试。',
  syncExhausted: (failures) => `同步连续失败 ${failures} 次，请检查 GitHub 运行记录及服务配置。`,
});

const iso = (ms) => new Date(ms).toISOString();

/**
 * @param {object} options
 * @param {object} options.github  { dispatch(inputs), findRun(requestId, since), run(id), cancel(id), archive(id) }
 * @param {(task: object) => Record<string, string>} options.inputs  workflow inputs for a task (whitelisted)
 * @param {(task: object) => string} options.filename  artifact filename to store
 */
export function githubActionsHandlers({ github, inputs, filename, messages = DEFAULT_GITHUB_MESSAGES, reconcileWindowMs = 15 * 60_000 }) {
  async function start(task, { store, now }) {
    const patch = (data) => store.patch(task.id, data);
    if (task.cancelRequested) {
      await patch({ status: 'canceled', finishedAt: iso(now), error: '' });
      return false;
    }
    await patch({ status: 'dispatching', dispatchStartedAt: iso(now), error: '' });
    // A cancel can land between the read and the dispatch intent.
    if ((await store.get(task.id)).cancelRequested) {
      await patch({ status: 'canceled', finishedAt: iso(now), error: '' });
      return false;
    }
    const result = await github.dispatch(inputs(task));
    if (!result?.workflow_run_id) throw new Error('Missing dispatch run id');
    await patch({ githubRunId: String(result.workflow_run_id), status: 'pending', error: '', syncFailures: 0 });
  }

  async function advance(listed, { store, now, kind }) {
    const task = await store.get(listed.id);
    if (!kind.isActive(task.status) || task.status === 'queued') return;
    const patch = (data) => store.patch(task.id, data);

    if (!task.githubRunId) {
      const run = await github.findRun(task.id, task.dispatchStartedAt);
      if (run) {
        await patch({ githubRunId: String(run.id), status: 'pending', error: '', syncFailures: 0 });
      } else if (now - Date.parse(task.dispatchStartedAt) > reconcileWindowMs) {
        await patch(task.cancelRequested
          ? { status: 'canceled', finishedAt: iso(now), error: messages.reconcileCanceled }
          : { status: 'failed', finishedAt: iso(now), error: messages.reconcileFailed });
      } else {
        await patch({ error: task.cancelRequested ? messages.reconcilingCancel : messages.reconciling });
      }
      return;
    }

    const run = await github.run(task.githubRunId);
    if (run.status !== 'completed') {
      if (task.cancelRequested) await github.cancel(task.githubRunId);
      await patch({
        status: run.status === 'in_progress' ? 'running' : 'pending',
        syncFailures: 0,
        error: '',
        ...(run.run_started_at ? { startedAt: run.run_started_at } : {}),
      });
      return;
    }

    await patch({ status: 'uploading', conclusion: run.conclusion || 'unknown' });
    const archive = await github.archive(task.githubRunId);
    const canceled = (await store.get(task.id)).cancelRequested || run.conclusion === 'cancelled';
    if (!archive) {
      if (run.conclusion === 'success' && !canceled) throw new Error('Successful run has no artifact');
      await patch({ status: canceled ? 'canceled' : 'failed', finishedAt: iso(now), error: messages.noArtifact(run.conclusion) });
      return;
    }
    const success = run.conclusion === 'success';
    await store.upload(task.id, archive, filename(task), {
      status: canceled ? 'canceled' : success ? 'succeeded' : 'partial',
      error: canceled ? messages.canceledWithArtifact : success ? '' : messages.partial,
      finishedAt: iso(now),
      syncFailures: 0,
    });
  }

  return { start, advance };
}

/** Error policy that matches the handlers: dispatch intents are reconciled, never failed blindly. */
export function githubActionsErrorMessage(task, messages = DEFAULT_GITHUB_MESSAGES) {
  if (task.status === 'dispatching') return messages.reconciling;
  return task.cancelRequested ? messages.cancelPending : messages.stepFailed;
}

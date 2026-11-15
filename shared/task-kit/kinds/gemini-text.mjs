import { geminiTextKind } from '../catalog.mjs';
import { createTaskEngine } from '../engine.mjs';
import { githubActionsHandlers } from '../executors/github-actions.mjs';
import { countFailures } from '../retry.mjs';

// Dispatch only identity. Prompts and files remain in PocketBase, never workflow inputs/logs.
export function createGeminiTextEngine({ store, github, now, log }) {
  const handlers = githubActionsHandlers({
    github, inputs: task => ({ request_id: task.id }),
    settle: (task, run) => store.settle(task.id, { conclusion: run.conclusion || 'unknown' }),
  });
  return createTaskEngine({
    kind: geminiTextKind, store, concurrency: 1,
    handlers: {
      async start(task, context) {
        const result = await handlers.start(task, context);
        if (result === false) await store.settle(task.id, { conclusion: 'cancelled' });
        return result;
      },
      async advance(task, context) {
        await handlers.advance(task, context);
        const current = await store.get(task.id);
        // Reconciliation can fail before a workflow ever claims the inputs.
        // Close its pending segments as well as the parent job.
        if (['failed', 'canceled'].includes(current.status)) await store.settle(task.id, { conclusion: current.status === 'canceled' ? 'cancelled' : 'failure' });
      },
    },
    onError: countFailures({
      // A GitHub sync outage is not proof that the external execution ended.
      max: 30, holdStatuses: ['dispatching', 'pending', 'running'],
      message: task => task.status === 'dispatching' ? '正在核对提交结果，请勿重复提交。' : '状态同步暂时失败，稍后重试。',
      exhaustedMessage: () => '状态同步持续失败，请检查 GitHub 运行和 PB 连接。',
    }),
    ...(now ? { now } : {}), ...(log ? { log } : {}),
  });
}

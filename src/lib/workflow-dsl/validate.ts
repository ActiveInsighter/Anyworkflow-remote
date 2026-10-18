/** Entry point: validates a whole Run plan and returns editor diagnostics. */
import { parseCloudLevel, removeLeadingEventHeaders } from './cloud-parser.ts'
import { DiagnosticCollector } from './diagnostics.ts'
import { validateBrowserTemplateTokens, validateQueueBody } from './queue-validator.ts'
import { UTF8_ENCODER, normalizeNewlines } from './text.ts'
import { WORKFLOW_DSL_LIMITS, type CloudBlock, type WorkflowDiagnostic } from './types.ts'

export function validateEvent(
  block: CloudBlock,
  index: number,
  taskTitle: string,
  collector: DiagnosticCollector,
): void {
  const extracted = removeLeadingEventHeaders(block.body)
  const eventTitle = block.title.trim() || extracted.eventTitle || `Event ${index + 1}`
  const resolvedTaskTitle = taskTitle.trim() || extracted.taskTitle || 'Cloud task'
  const body = extracted.body

  if (!body) {
    collector.add(block.line, `Event ${eventTitle} 没有可执行的队列正文。`)
    return
  }

  const queueText = [`@task=${resolvedTaskTitle}`, `@event=${eventTitle}`, body].join('\n')
  if (UTF8_ENCODER.encode(queueText).byteLength > WORKFLOW_DSL_LIMITS.maxEventQueueBytes) {
    collector.add(block.line, 'Event 队列不能超过 768 KiB。')
  }

  validateBrowserTemplateTokens(eventTitle, {
    eventTitle,
    line: block.line,
    collector,
    activeVariables: new Set<string>(),
  })

  validateQueueBody(body, {
    eventTitle,
    line: block.line,
    collector,
    activeVariables: new Set<string>(),
    expansionBudget: { acts: 0 },
  })
}

/**
 * Validate the same source in the same order as cloud orchestration: Run -> Task -> Event queue,
 * then apply the browser parser restrictions to the generated Event queue.
 */
export function validateWorkflowSource(
  source: string,
  settings: { defaultStartUrl?: string } = {},
): WorkflowDiagnostic[] {
  const normalized = normalizeNewlines(source)
  const trimmed = normalized.trim()
  const collector = new DiagnosticCollector(source)

  if (!trimmed) {
    collector.add(1, '工作流定义不能为空。')
    return collector.items
  }

  if (UTF8_ENCODER.encode(trimmed).byteLength > WORKFLOW_DSL_LIMITS.maxPlanBytes) {
    collector.add(1, '工作流定义不能超过 2 MiB。')
    return collector.items
  }

  const run = parseCloudLevel(normalized, {
    level: 'run',
    titleDirective: 'run',
    blockKinds: ['task'],
    lineBase: 0,
    depth: 0,
    budget: { expandedBytes: 0, iterations: 0 },
    collector,
  })

  if (!run.failed && run.blocks.length === 0) {
    collector.add(1, 'Run 至少需要一个 @task 块。')
  }
  if (run.blocks.length > WORKFLOW_DSL_LIMITS.maxRunTasks) {
    collector.add(run.blocks[WORKFLOW_DSL_LIMITS.maxRunTasks]?.line ?? 1, 'Run 最多只能生成 256 个 Task。')
  }

  run.blocks.slice(0, WORKFLOW_DSL_LIMITS.maxRunTasks + 1).forEach((runBlock, index) => {
    const defaultTitle = runBlock.title.trim() || `Task ${index + 1}`
    const task = parseCloudLevel(runBlock.body, {
      level: 'task',
      titleDirective: 'task',
      blockKinds: ['event'],
      inheritedVars: run.vars,
      lineBase: runBlock.line - 1,
      depth: 0,
      budget: { expandedBytes: 0, iterations: 0 },
      collector,
      defaultTitle,
      defaultStartUrl: settings.defaultStartUrl,
    })
    const taskTitle = task.config.title.trim() || 'Cloud task'

    if (!task.failed && task.blocks.length === 0) {
      collector.add(runBlock.line, 'Task 至少需要生成一个 @event 块。')
    }
    if (task.blocks.length > WORKFLOW_DSL_LIMITS.maxTaskEvents) {
      collector.add(task.blocks[WORKFLOW_DSL_LIMITS.maxTaskEvents]?.line ?? runBlock.line, 'Task 最多只能生成 1000 个 Event。')
    }

    task.blocks.slice(0, WORKFLOW_DSL_LIMITS.maxTaskEvents + 1).forEach((eventBlock, eventIndex) => {
      validateEvent(
        eventBlock,
        eventIndex,
        taskTitle,
        collector,
      )
    })
  })

  return collector.items
}

/** Entry point: validates a whole Run plan, and previews the Events and Acts it expands to. */
import { parseCloudLevel, removeLeadingEventHeaders } from './cloud-parser.ts'
import { DiagnosticCollector } from './diagnostics.ts'
import { validateBrowserTemplateTokens, walkEventQueue } from './queue-validator.ts'
import { UTF8_ENCODER, normalizeNewlines } from './text.ts'
import { WORKFLOW_DSL_LIMITS, type CloudBlock, type EventPreview, type WorkflowDiagnostic } from './types.ts'

export interface WorkflowInspection {
  diagnostics: WorkflowDiagnostic[]
  /** Events in the order orchestration creates them; only Events whose queue is valid. */
  events: EventPreview[]
}

function inspectEvent(
  block: CloudBlock,
  index: number,
  taskTitle: string,
  collector: DiagnosticCollector,
): EventPreview | null {
  const extracted = removeLeadingEventHeaders(block.body)
  const eventTitle = block.title.trim() || extracted.eventTitle || `Event ${index + 1}`
  const resolvedTaskTitle = taskTitle.trim() || extracted.taskTitle || 'Cloud task'
  const body = extracted.body

  if (!body) {
    collector.add(block.line, `Event ${eventTitle} 没有可执行的队列正文。`)
    return null
  }

  const queueText = [`@task=${resolvedTaskTitle}`, `@event=${eventTitle}`, body].join('\n')
  if (UTF8_ENCODER.encode(queueText).byteLength > WORKFLOW_DSL_LIMITS.maxEventQueueBytes) {
    collector.add(block.line, 'Event 队列不能超过 768 KiB。')
  }

  const options = { eventTitle, line: block.line, collector, activeVariables: new Set<string>() }
  validateBrowserTemplateTokens(eventTitle, options)
  const walked = walkEventQueue(body, options)
  if (!walked.ok) return null
  return { taskTitle: resolvedTaskTitle, title: eventTitle, line: block.line, acts: walked.acts, actCount: walked.actCount }
}

/**
 * Validate the same source in the same order as cloud orchestration: Run -> Task -> Event queue,
 * then apply the browser parser restrictions to each generated Event queue.
 */
export function inspectWorkflowSource(source: string, settings: { defaultStartUrl?: string } = {}): WorkflowInspection {
  const normalized = normalizeNewlines(source)
  const trimmed = normalized.trim()
  const collector = new DiagnosticCollector(source)
  const events: EventPreview[] = []

  if (!trimmed) {
    collector.add(1, '工作流定义不能为空。')
    return { diagnostics: collector.items, events }
  }

  if (UTF8_ENCODER.encode(trimmed).byteLength > WORKFLOW_DSL_LIMITS.maxPlanBytes) {
    collector.add(1, '工作流定义不能超过 2 MiB。')
    return { diagnostics: collector.items, events }
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
      const event = inspectEvent(eventBlock, eventIndex, taskTitle, collector)
      if (event) events.push(event)
    })
  })

  return { diagnostics: collector.items, events }
}

const recent: Array<{ source: string; inspection: WorkflowInspection }> = []

/**
 * `inspectWorkflowSource` for the editor's many readers of one text (linter, Act preview, outline
 * counts, save guard): the last few results are kept, so each edit is inspected once. Callers must
 * treat the result as read-only.
 */
export function inspectWorkflowSourceCached(source: string): WorkflowInspection {
  const hit = recent.find((entry) => entry.source === source)
  if (hit) return hit.inspection
  const inspection = inspectWorkflowSource(source)
  recent.unshift({ source, inspection })
  recent.length = Math.min(recent.length, 3)
  return inspection
}

export function validateWorkflowSource(source: string, settings: { defaultStartUrl?: string } = {}): WorkflowDiagnostic[] {
  return settings.defaultStartUrl === undefined
    ? inspectWorkflowSourceCached(source).diagnostics
    : inspectWorkflowSource(source, settings).diagnostics
}

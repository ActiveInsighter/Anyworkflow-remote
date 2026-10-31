import { Repeat, SquareStack, Workflow, Zap, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { countOutline, type OutlineKind, type OutlineNode } from '../lib/outline'

const KIND: Record<OutlineKind, { Icon: LucideIcon; tone: string }> = {
  task: { Icon: Workflow, tone: 'text-primary' },
  event: { Icon: Zap, tone: 'text-warning' },
  act: { Icon: SquareStack, tone: 'text-muted-foreground' },
  for: { Icon: Repeat, tone: 'text-muted-foreground' },
}

type ActCounts = ReadonlyMap<number, { events: number; acts: number }>

function OutlineItems({
  nodes,
  depth,
  activePath,
  actCounts,
  onReveal,
}: {
  nodes: readonly OutlineNode[]
  depth: number
  activePath: readonly OutlineNode[]
  actCounts: ActCounts
  onReveal: (at: number) => void
}) {
  return (
    <ul role={depth === 0 ? 'tree' : 'group'} aria-label={depth === 0 ? '计划结构' : undefined} className="flex flex-col">
      {nodes.map((node) => {
        const { Icon, tone } = KIND[node.kind]
        const onPath = activePath.includes(node)
        const current = activePath.at(-1) === node
        const expanded = node.kind === 'event' ? actCounts.get(node.line) : undefined
        return (
          <li key={`${node.kind}:${node.from}`} role="treeitem" aria-expanded={node.children.length ? true : undefined} aria-selected={current}>
            <button
              type="button"
              onClick={() => onReveal(node.from)}
              aria-current={current ? 'location' : undefined}
              style={{ paddingInlineStart: `${0.5 + depth * 0.875}rem` }}
              className={cn(
                'flex min-h-touch w-full min-w-0 items-center gap-2 rounded-md pe-2 text-left text-xs outline-none sm:min-h-8',
                'hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring',
                onPath ? 'text-foreground' : 'text-muted-foreground',
                current && 'bg-muted font-medium',
              )}
            >
              <Icon className={cn('size-3.5 shrink-0', tone)} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                {node.title}
                {node.detail ? <span className="ms-1.5 font-mono text-micro text-muted-foreground">{node.detail}</span> : null}
              </span>
              {node.repeat ? <span className="shrink-0 font-mono text-micro tabular-nums">×{node.repeat}</span> : null}
              {expanded ? (
                <span
                  title={expanded.events > 1 ? `循环生成 ${expanded.events} 个 Event，共 ${expanded.acts} 个 Act` : `${expanded.acts} 个 Act`}
                  className="shrink-0 rounded-full bg-muted px-1.5 text-micro text-muted-foreground tabular-nums"
                >
                  {expanded.events > 1 ? `${expanded.events}×` : ''}
                  {expanded.acts} Act
                </span>
              ) : node.messages ? (
                <span className="shrink-0 text-micro text-muted-foreground tabular-nums">{node.messages} 条</span>
              ) : null}
            </button>
            {node.children.length ? (
              <OutlineItems nodes={node.children} depth={depth + 1} activePath={activePath} actCounts={actCounts} onReveal={onReveal} />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** The plan's Tasks, Events, Acts and loops; the cursor's place is marked, rows jump to code. */
export function EditorOutline({
  nodes,
  activePath,
  actCounts,
  onReveal,
}: {
  nodes: readonly OutlineNode[]
  activePath: readonly OutlineNode[]
  /** Acts per Event header line after loops are unrolled. */
  actCounts: ActCounts
  onReveal: (at: number) => void
}) {
  if (!nodes.length) {
    return <p className="px-3 py-6 text-center text-caption text-muted-foreground">还没有 Task。用工具栏的 Task 按钮添加。</p>
  }
  const counts = countOutline(nodes)
  return (
    <div className="flex flex-col gap-2 p-1.5">
      <p className="px-2 pt-1 text-micro text-muted-foreground tabular-nums">
        {counts.task} 个 Task · {counts.event} 个 Event · {counts.messages} 条消息
      </p>
      <OutlineItems nodes={nodes} depth={0} activePath={activePath} actCounts={actCounts} onReveal={onReveal} />
    </div>
  )
}

import { CircleAlert, ListTree } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { EditorIssue } from '../lib/editor-helpers'
import type { OutlineNode } from '../lib/outline'
import { countIssues, EditorIssuesList } from './editor-issues'
import { EditorOutline } from './editor-outline'

export type SidePanelTab = 'outline' | 'issues'

/** Outline and problems, shared by the wide-screen aside and the phone sheet. */
export function EditorSidePanel({
  variant = 'aside',
  tab,
  onTabChange,
  outline,
  activePath,
  issues,
  onRevealAt,
  onRevealRange,
}: {
  /** `aside` scrolls each tab itself; in a `sheet` the sheet body scrolls. */
  variant?: 'aside' | 'sheet'
  tab: SidePanelTab
  onTabChange: (tab: SidePanelTab) => void
  outline: readonly OutlineNode[]
  activePath: readonly OutlineNode[]
  issues: readonly EditorIssue[]
  onRevealAt: (at: number) => void
  onRevealRange: (from: number, to: number) => void
}) {
  const { errors, warnings } = countIssues(issues)
  const flagged = errors + warnings
  const aside = variant === 'aside'
  const content = aside ? 'min-h-0 flex-1 overflow-y-auto' : '-mx-1.5'
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as SidePanelTab)}
      className={cn('gap-0', aside && 'flex min-h-0 flex-1 flex-col')}
    >
      <div className={cn('shrink-0', aside ? 'border-b border-cm-border px-2 py-1.5' : 'pb-2')}>
        <TabsList className="w-full">
          <TabsTrigger value="outline">
            <ListTree aria-hidden="true" />
            大纲
          </TabsTrigger>
          <TabsTrigger value="issues">
            <CircleAlert aria-hidden="true" className={errors ? 'text-danger' : undefined} />
            问题
            {flagged ? <span className="tabular-nums">{flagged}</span> : null}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="outline" className={content}>
        <EditorOutline nodes={outline} activePath={activePath} onReveal={onRevealAt} />
      </TabsContent>
      <TabsContent value="issues" className={content}>
        <EditorIssuesList issues={issues} onReveal={onRevealRange} />
      </TabsContent>
    </Tabs>
  )
}

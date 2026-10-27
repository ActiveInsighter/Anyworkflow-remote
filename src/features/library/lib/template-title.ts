import type { WorkflowTemplateRecord } from '@/types'

export function templateTitle(item: Pick<WorkflowTemplateRecord, 'title'> | null | undefined) {
  return item?.title || '未命名模板'
}

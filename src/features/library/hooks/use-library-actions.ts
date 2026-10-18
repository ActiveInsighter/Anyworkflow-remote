import { useNavigate } from 'react-router'
import { useAsyncAction } from '@/hooks/use-async-action'
import {
  deleteRunFavorite,
  deleteWorkflowTemplate,
  duplicateWorkflowTemplate,
  moveRunFavorite,
  updateWorkflowTemplate,
} from '@/lib/api/library'
import type { RunFavoriteRecord, WorkflowTemplateRecord } from '@/types'

/** Mutations on library items. Each refreshes the library after it lands. */
export function useLibraryActions(reload: () => Promise<void>) {
  const navigate = useNavigate()
  const action = useAsyncAction()

  const withReload = (write: () => Promise<unknown>) => async () => {
    await write()
    await reload()
  }

  return {
    pendingId: action.pending,
    error: action.error,
    clearError: action.clearError,
    removeFavorite: (item: RunFavoriteRecord) =>
      action.run(item.id, withReload(() => deleteRunFavorite(item.id)), { success: '已取消收藏' }),
    moveFavorite: (item: RunFavoriteRecord, folder: string) =>
      action.run(item.id, withReload(() => moveRunFavorite(item.id, folder)), { success: '收藏已移动' }),
    moveTemplate: (item: WorkflowTemplateRecord, folder: string) =>
      action.run(item.id, withReload(() => updateWorkflowTemplate(item.id, { folder })), { success: '模板已移动' }),
    removeTemplate: (item: WorkflowTemplateRecord) =>
      action.run(item.id, withReload(() => deleteWorkflowTemplate(item.id)), { success: '模板已删除' }),
    duplicateTemplate: (item: WorkflowTemplateRecord) =>
      action.run(
        item.id,
        async () => {
          const copy = await duplicateWorkflowTemplate(item)
          navigate(`/templates/${copy.id}`)
        },
        { success: '模板已复制' },
      ),
  }
}

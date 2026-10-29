import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { toErrorMessage } from '@/lib/api'
import { createStartLinkId, displayStartUrl, START_LINK_LIMITS } from '@/lib/domain/start-links'
import type { EditorStartLinks } from '@/features/editor/components/anyworkflow-editor'
import { useStartLinks } from '@/features/start-links/hooks/use-start-links'

/** Connects the account's start links to the editor: pick, add the current address, manage. */
export function useEditorStartLinks() {
  const store = useStartLinks()
  const [managing, setManaging] = useState(false)
  const { links, save } = store

  const editorLinks = useMemo<EditorStartLinks>(
    () => ({
      links,
      onManage: () => setManaging(true),
      async onAdd(url: string) {
        if (links.length >= START_LINK_LIMITS.maxLinks) {
          toast.info(`快捷链接最多 ${START_LINK_LIMITS.maxLinks} 个`)
          return
        }
        try {
          await save([...links, { id: createStartLinkId(), label: displayStartUrl(url).slice(0, START_LINK_LIMITS.maxLabel), url }])
          toast.success('已添加到快捷链接', { action: { label: '编辑', onClick: () => setManaging(true) } })
        } catch (cause) {
          toast.error('添加失败', { description: toErrorMessage(cause) })
        }
      },
    }),
    [links, save],
  )

  return { editorLinks, managing, setManaging }
}

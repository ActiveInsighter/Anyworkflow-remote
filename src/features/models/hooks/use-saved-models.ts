import { useEffect } from 'react'
import { useAsyncData } from '@/hooks/use-async-data'
import { listSavedModels } from '@/lib/api/models'
import { useSession } from '@/lib/api/session'

const CHANGED = 'anyworkflow:saved-models-changed'
export function notifyModelsChanged() {
  window.dispatchEvent(new Event(CHANGED))
}
export function useSavedModels() {
  const session = useSession()
  const key = `${session?.baseUrl}:${session?.record.id}`
  const result = useAsyncData(listSavedModels, [key], { enabled: Boolean(session), pollMs: 30000 })
  const { reload } = result
  useEffect(() => {
    const listener = () => {
      void reload()
    }
    window.addEventListener(CHANGED, listener)
    return () => window.removeEventListener(CHANGED, listener)
  }, [reload])
  return result
}

import { useSyncExternalStore } from 'react'
import {
  DEFAULT_EDITOR_PREFERENCES,
  getEditorPreferences,
  subscribeEditorPreferences,
  updateEditorPreferences,
} from '../lib/editor-preferences'

export function useEditorPreferences() {
  const preferences = useSyncExternalStore(
    subscribeEditorPreferences,
    getEditorPreferences,
    () => DEFAULT_EDITOR_PREFERENCES,
  )
  return [preferences, updateEditorPreferences] as const
}

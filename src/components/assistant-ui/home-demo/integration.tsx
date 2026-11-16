import { createContext, useContext, type ReactNode } from 'react'
import type { ModelOption } from '../elements/model-selector'
import type { TokenUsage } from '../elements/context-display'
export interface DemoIntegration {
  model: string; models: readonly ModelOption[]; setModel: (id: string) => void
  effort: string; setEffort: (value: string) => void
  usage?: TokenUsage; contextWindow?: number; threadId?: string
  accountName: string; openSettings: () => void; signOut: () => void
  submitFeedback: (id: string, type: 'positive' | 'negative', comment?: string) => Promise<void>
  showResponse: (id: string) => void
}
const Context = createContext<DemoIntegration | null>(null)
export const DemoIntegrationProvider = Context.Provider
export function useDemoIntegration() {
  const value = useContext(Context)
  if (!value) throw new Error('The homepage demo requires its backend integration')
  return value
}

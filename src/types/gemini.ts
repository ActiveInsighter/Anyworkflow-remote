export interface GeminiInput {
  agentModel?: string
  agentMaxTotalTokens?: number
  agentTimeoutMinutes?: number
  title: string
  prompt: string
  systemPrompt: string
  text: string
  sources: { id: string; name: string; content: string }[]
  delimiter: string
  model: string
  concurrency: number
  thinkingLevel: string
  maxOutputTokens: number
}

export interface GeminiJob {
  id: string
  owner: string
  title: string
  prompt: string
  systemPrompt: string
  delimiter: string
  model: string
  options: { concurrency: number; thinkingLevel: string; maxOutputTokens: number; agent?: { id: string; model: string; maxTotalTokens: number; timeoutMinutes: number } }
  sources: { id: string; name: string }[]
  status: string
  totalChunks: number
  completedChunks: number
  failedChunks: number
  error: string
  cancelRequested: boolean
  githubRunId: string
  created: string
  updated: string
}

export interface GeminiMessage {
  id: string
  owner: string
  job: string
  index: number
  part: number
  sourceName: string
  inputText: string
  status: string
  reply: string
  error: string
  finishReason: string
  usage: { totalTokenCount?: number; promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number; toolUseTokenCount?: number; agentStepCount?: number }
  providerState?: { id?: string; environmentId?: string; status?: string }
}

export interface GeminiPreview {
  totalChunks: number
  chunks: {
    index: number
    sourceName: string
    part: number
    bytes: number
    excerpt: string
    inputText: string
  }[]
}

export interface GeminiConfig {
  agentModel?: string
  agentMaxTotalTokens?: number
  agentTimeoutMinutes?: number
  model: string
  systemPrompt: string
  delimiter: string
  concurrency: number
  thinkingLevel: string
  maxOutputTokens: number
  rpmPerKey: number
  rpdPerKey: number
}
export interface GeminiConfigRecord {
  owner: string
  config: GeminiConfig
  revision: number
}

export type GeminiMessageSummary = Pick<GeminiMessage, 'id' | 'owner' | 'job' | 'index' | 'part' | 'sourceName' | 'status' | 'error' | 'finishReason'> & { updated: string }
export interface GeminiJobView { job: GeminiJob; messages: GeminiMessageSummary[] }

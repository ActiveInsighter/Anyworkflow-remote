export interface GeminiInput {
  responseVersion?: 1
  replacesMessage?: string
  parentMessage?: string
  environmentId?: string
  previousInteractionId?: string
  agentModel?: string
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
  pinned?: boolean
  archived?: boolean
  threadRoot?: string
  replacesMessage?: string
  parentMessage?: string
  history?: { role: 'user' | 'model'; text: string }[]
  id: string
  owner: string
  title: string
  prompt: string
  systemPrompt: string
  delimiter: string
  model: string
  options: { concurrency: number; thinkingLevel: string; maxOutputTokens: number; agent?: { id: string; model: string } }
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
  feedback?: 'positive' | 'negative' | ''
  feedbackComment?: string
  startedAt?: string
  finishedAt?: string
  updated?: string
  response?: GeminiResponse | null
  id: string
  owner: string
  job: string
  index: number
  part: number
  sourceName: string
  sourceId?: string
  inputText: string
  status: string
  reply: string
  error: string
  finishReason: string
  usage: { totalTokenCount?: number; promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number; toolUseTokenCount?: number; agentStepCount?: number }
  agentParts?: AgentPart[]
  streamRevision?: number
  progressAt?: string
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

/** Ordered, provider-neutral content inside one assistant turn. */
export interface AgentPart {
  id: string
  owner: string
  message: string
  key: string
  sequence: number
  revision: number
  type: 'text' | 'reasoning_summary' | 'tool_call' | 'tool_result' | 'status'
  status: 'running' | 'completed' | 'failed'
  content: string
  toolName: string
  callId: string
  providerType: string
  truncated: boolean
  created: string
  updated: string
}
export interface AgentPartsPage {
  items: AgentPart[]
  nextCursor: number
  hasMore: boolean
  revision: number
  progressAt: string
  status: string
  usage: GeminiMessage['usage']
}

export interface GeminiResponsePart {
  id: string
  type: 'text' | 'reasoning' | 'tool-call' | 'tool-result' | 'artifact'
  text?: string
  name?: string
  callId?: string
  providerType?: string
  step?: number
  data?: unknown
}
export interface GeminiResponse {
  version: 1
  protocol: 'generateContent' | 'interactions'
  parts: GeminiResponsePart[]
  metadata: Record<string, unknown>
  capture: { totalParts: number; omittedParts: number; truncated: boolean }
}

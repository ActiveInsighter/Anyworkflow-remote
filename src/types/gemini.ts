export interface GeminiInput {
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
  options: { concurrency: number; thinkingLevel: string; maxOutputTokens: number }
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
  usage: { totalTokenCount?: number }
}

export interface GeminiPreview {
  totalChunks: number
  chunks: { index: number; sourceName: string; part: number; bytes: number; excerpt: string }[]
}

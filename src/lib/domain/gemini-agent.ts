export const ANTIGRAVITY_AGENT_ID = 'antigravity-preview-09-2026'
export const ANTIGRAVITY_DEFAULTS = { agentModel: 'gemini-4-hydrogen', agentMaxTotalTokens: 0, agentTimeoutMinutes: 175 } as const
export const ANTIGRAVITY_MODELS = [
  { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon · 最强推理' },
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen' },
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon' },
]
export function isAntigravity(model: string) { return /^antigravity(?:$|-)/iu.test(model) }

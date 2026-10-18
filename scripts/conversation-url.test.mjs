import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { isSafeConversationUrl } = await server.ssrLoadModule('/src/lib/domain/conversation-url.ts')
  const claudeId = '0b4f1a52-7c1e-4f0f-9d57-0e0a1f3b9c11'

  assert.equal(isSafeConversationUrl('https://chatgpt.com/c/abc'), true)
  assert.equal(isSafeConversationUrl('https://chatgpt.com/local/cloud-proof'), true)
  assert.equal(isSafeConversationUrl('https://chatgpt.com/local/'), false)
  assert.equal(isSafeConversationUrl('https://evil.example/local/cloud-proof'), false)
  assert.equal(isSafeConversationUrl('https://chat.openai.com/c/abc?x=1'), true)
  assert.equal(isSafeConversationUrl(`https://claude.ai/chat/${claudeId}`), true)
  assert.equal(isSafeConversationUrl(`https://CLAUDE.AI/chat/${claudeId}`), true)

  assert.equal(isSafeConversationUrl('https://claude.ai/new'), false)
  assert.equal(isSafeConversationUrl('https://claude.ai/c/abc'), false)
  assert.equal(isSafeConversationUrl('https://chatgpt.com/chat/abc'), false)
  assert.equal(isSafeConversationUrl('https://claude.ai/project/p1/chat/abc'), false)
  assert.equal(isSafeConversationUrl(`http://claude.ai/chat/${claudeId}`), false)
  assert.equal(isSafeConversationUrl(`https://claude.ai.evil.example/chat/${claudeId}`), false)
  assert.equal(isSafeConversationUrl(`https://www.claude.ai/chat/${claudeId}`), false)
  assert.equal(isSafeConversationUrl(''), false)
  assert.equal(isSafeConversationUrl('not a url'), false)
  console.log('conversation-url: ChatGPT and Claude routes accepted, lookalike hosts and non-conversation routes rejected')
} finally { await server.close() }

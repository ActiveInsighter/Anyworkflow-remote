/**
 * Conversation sites AnyWorkflow can run on. Keep in sync with the extension's
 * site catalog (AnyWorkflow/src/sites/catalog.ts); the two repositories share
 * no code, so a new site is added in both.
 */
interface ConversationSite {
  readonly hosts: readonly string[]
  /** Root-level conversation route; anything else is not safe to reopen from a checkpoint. */
  readonly rootConversationPath: RegExp
}

const CONVERSATION_SITES: readonly ConversationSite[] = [
  { hosts: ['chatgpt.com', 'chat.openai.com'], rootConversationPath: /^\/c\/[^/]+/u },
  { hosts: ['claude.ai'], rootConversationPath: /^\/chat\/[^/]+/u },
]

/** HTTPS URL of a conversation on a supported site, as the extension can reopen it. */
export function isSafeConversationUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return CONVERSATION_SITES.some(
      (site) => site.hosts.includes(host) && site.rootConversationPath.test(url.pathname),
    )
  } catch {
    return false
  }
}

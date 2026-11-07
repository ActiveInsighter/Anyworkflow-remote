/** Captured links are untrusted, and React renders `javascript:` hrefs as they are. */
export function safeHref(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function readUrl(line: string, maxUrlLength: number): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:/iu.test(line) ? line : `https://${line}`
  if (candidate.length > maxUrlLength) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** Splits pasted text into unique web URLs, keeping what cannot be read so the user can fix it. */
export function parseWebUrls(text: string, maxUrlLength = 2048): { urls: string[]; invalid: string[] } {
  const urls = new Set<string>()
  const invalid: string[] = []
  for (const line of text.split(/\s+/u).filter(Boolean)) {
    const url = readUrl(line, maxUrlLength)
    if (url) urls.add(url)
    else invalid.push(line)
  }
  return { urls: [...urls], invalid }
}

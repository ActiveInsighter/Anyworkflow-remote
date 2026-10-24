// Bound small JSON responses, including chunked responses without Content-Length.
export async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Upstream HTTP ${response.status}`)
  }
  const reader = response.body?.getReader()
  if (!reader) return null as T
  const decoder = new TextDecoder()
  let text = '', size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 5 * 1024 * 1024) {
        await reader.cancel()
        throw new Error('JSON response exceeds 5 MiB')
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return text ? JSON.parse(text) as T : null as T
  } finally { reader.releaseLock() }
}

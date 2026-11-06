/** Hand off immediately; the browser streams to disk and displays its own download progress. */
export function startBrowserDownload(href: string, filename: string): void {
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.rel = 'noreferrer'
  document.body.append(link)
  link.click()
  link.remove()
}

/** Saves a blob under `filename` through a temporary object URL. */
export function saveBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // Some browsers read the URL after click() returns; release it later.
  window.setTimeout(() => URL.revokeObjectURL(href), 60_000)
}

/** A title as a file name that is safe on every platform, within a 180-byte stem. */
export function safeFilename(title: string, fallback: string, extension: string): string {
  const cleaned = String(title || '').normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/gu, '_')
    .replace(/^[.\s]+|[.\s]+$/gu, '') || fallback
  const characters = Array.from(cleaned)
  const encoder = new TextEncoder()
  while (encoder.encode(characters.join('')).length > 180) characters.pop()
  const name = characters.join('').replace(/[.\s]+$/gu, '') || fallback
  return `${/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(name) ? '_' : ''}${name}.${extension}`
}

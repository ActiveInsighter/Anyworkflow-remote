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

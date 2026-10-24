/** PocketBase sanitizes stored filenames; the user's download keeps the Run title. */
export function runExportFilename(title: string): string {
  const cleaned = String(title || '').normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/gu, '_')
    .replace(/^[.\s]+|[.\s]+$/gu, '') || 'Run 对话'
  const characters = Array.from(cleaned)
  const encoder = new TextEncoder()
  while (encoder.encode(characters.join('')).length > 180) characters.pop()
  const name = characters.join('').replace(/[.\s]+$/gu, '') || 'Run 对话'
  return `${/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(name) ? '_' : ''}${name}.zip`
}

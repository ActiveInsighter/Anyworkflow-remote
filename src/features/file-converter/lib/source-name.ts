/** Longest suggested name: it also becomes the artifact's file name unless one is given. */
const MAX_SUGGESTED_NAME = 120

/** A file's name as a task name: without its extension. */
export function nameFromFile(fileName: string): string {
  return fileName.trim().replace(/\.pdf$/iu, '').trim().slice(0, MAX_SUGGESTED_NAME)
}

/** A task name from a direct PDF link; share links carry no usable name and suggest nothing. */
export function nameFromUrl(value: string): string {
  try {
    const last = new URL(value.trim()).pathname.split('/').filter(Boolean).at(-1) ?? ''
    const name = decodeURIComponent(last)
    return /\.pdf$/iu.test(name) ? nameFromFile(name) : ''
  } catch {
    return ''
  }
}

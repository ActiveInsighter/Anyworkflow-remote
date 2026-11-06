import { safeFilename } from '@/lib/platform/download'

/** PocketBase sanitizes stored filenames; the user's download keeps the Run title. */
export function runExportFilename(title: string): string {
  return safeFilename(title, 'Run 对话', 'zip')
}

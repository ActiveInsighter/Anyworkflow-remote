import { Navigate, useSearchParams } from 'react-router'
import { FileLibrary } from '@/features/files/components/file-library'
import { useSession } from '@/lib/api/session'

export function LibraryPage() {
  const session = useSession()
  const [params] = useSearchParams()
  // Preserve existing template/folder bookmarks while the default library now holds files.
  if (params.has('tab') || params.has('folder')) return <Navigate replace to={`/favorites-and-templates?${params}`} />
  return <FileLibrary key={`${session?.baseUrl}:${session?.record.id}`} />
}

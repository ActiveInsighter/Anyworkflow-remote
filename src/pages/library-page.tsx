import { Navigate, useSearchParams } from 'react-router'
import { FileLibrary } from '@/features/files/components/file-library'
import { useSession } from '@/lib/api/session'

const FILE_FOLDER_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u

export function LibraryPage() {
  const session = useSession()
  const [params] = useSearchParams()
  // Older template/favorite links pointed here; file folders use UUIDs, PocketBase folders do not.
  const folder = params.get('folder')
  if (params.has('tab') || (folder && !FILE_FOLDER_ID.test(folder))) return <Navigate replace to={`/favorites-and-templates?${params}`} />
  return <FileLibrary key={`${session?.baseUrl}:${session?.record.id}`} />
}

import { useMemo } from 'react'
import { toast } from 'sonner'
import { useAsyncData } from '@/hooks/use-async-data'
import { toErrorMessage } from '@/lib/api/errors'
import {
  createLibraryFileFolder,
  deleteLibraryFile,
  deleteLibraryFileFolder,
  listLibraryDrive,
  updateLibraryFile,
  updateLibraryFileFolder,
  type LibraryFile,
  type LibraryFileFolder,
} from '@/lib/api/library-files'
import { useSession } from '@/lib/api/session'

type Drive = Awaited<ReturnType<typeof listLibraryDrive>>

/**
 * Every file and folder of the account, with mutations that patch the loaded copy so the
 * browser updates at once. Deleting a folder reloads: the server moves its contents.
 */
export function useFileDrive() {
  const session = useSession()
  const state = useAsyncData((signal) => listLibraryDrive(signal), [session?.baseUrl, session?.record.id], {
    enabled: Boolean(session),
    errorMessage: toErrorMessage,
  })
  const { setData, reload } = state
  const files = useMemo(() => state.data?.files ?? [], [state.data?.files])
  const folders = useMemo(() => state.data?.folders ?? [], [state.data?.folders])

  const patch = (update: (drive: Drive) => Drive) => setData((current) => (current ? update(current) : current))
  const replaceFile = (file: LibraryFile) =>
    patch((drive) => ({ ...drive, files: drive.files.map((item) => (item.id === file.id ? file : item)) }))
  const replaceFolder = (folder: LibraryFileFolder) =>
    patch((drive) => ({ ...drive, folders: drive.folders.map((item) => (item.id === folder.id ? folder : item)) }))

  return {
    session,
    state,
    files,
    folders,
    async renameFile(file: LibraryFile, fileName: string) {
      replaceFile(await updateLibraryFile(file.id, { fileName }))
      toast.success('已重命名')
    },
    async moveFile(file: LibraryFile, folder: string) {
      replaceFile(await updateLibraryFile(file.id, { folder }))
      toast.success('已移动')
    },
    async deleteFile(file: LibraryFile) {
      await deleteLibraryFile(file.id)
      patch((drive) => ({ ...drive, files: drive.files.filter((item) => item.id !== file.id) }))
      toast.success('文件已删除')
    },
    async createFolder(name: string, parent: string) {
      const folder = await createLibraryFileFolder(name, parent)
      patch((drive) => ({ ...drive, folders: [...drive.folders, folder] }))
      toast.success('文件夹已创建')
      return folder
    },
    async renameFolder(folder: LibraryFileFolder, name: string) {
      replaceFolder(await updateLibraryFileFolder(folder.id, { name }))
      toast.success('已重命名')
    },
    async moveFolder(folder: LibraryFileFolder, parent: string) {
      replaceFolder(await updateLibraryFileFolder(folder.id, { parent }))
      toast.success('已移动')
    },
    async deleteFolder(folder: LibraryFileFolder) {
      await deleteLibraryFileFolder(folder.id)
      await reload()
      toast.success('文件夹已删除')
    },
    /** File a finished upload into the folder it was dropped in, then refresh. */
    async placeUpload(id: string, folder: string) {
      if (folder && folders.some((item) => item.id === folder)) await updateLibraryFile(id, { folder })
      await reload()
    },
  }
}

export type FileDrive = ReturnType<typeof useFileDrive>

import { useMemo } from 'react'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { flattenLibraryFolders } from '@/lib/api/library'
import type { LibraryFolderRecord } from '@/types'

/** Folder picker with the tree shown by indentation; the empty value is the root. */
export function FolderSelect({
  folders,
  value,
  onValueChange,
  label,
  exclude,
  className,
}: {
  folders: readonly LibraryFolderRecord[]
  value: string
  onValueChange: (value: string) => void
  label: string
  /** Hide folders that are not valid targets. */
  exclude?: (folderId: string) => boolean
  className?: string
}) {
  const flat = useMemo(() => flattenLibraryFolders([...folders]), [folders])
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      containerClassName={className}
    >
      <NativeSelectOption value="">根目录</NativeSelectOption>
      {flat
        .filter((folder) => !exclude?.(folder.id))
        .map((folder) => (
          <NativeSelectOption key={folder.id} value={folder.id}>
            {'　'.repeat(folder.depth)}
            {folder.name}
          </NativeSelectOption>
        ))}
    </NativeSelect>
  )
}

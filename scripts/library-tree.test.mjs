import assert from 'node:assert/strict'

const { flattenLibraryFolders, scopedFolders } = await import('../src/lib/library-tree.ts')

const folders = [
  { id: 'root-b', owner: 'owner', parent: '', name: 'B', scope: 'favorite', sortOrder: 2 },
  { id: 'child', owner: 'owner', parent: 'root-b', name: 'Child', scope: '', sortOrder: 1 },
  { id: 'root-a', owner: 'owner', parent: '', name: 'A', scope: '', sortOrder: 1 },
  { id: 'orphan', owner: 'owner', parent: 'missing', name: 'Orphan', scope: '', sortOrder: 3 },
  { id: 'cycle-a', owner: 'owner', parent: 'cycle-b', name: 'Cycle A', scope: '', sortOrder: 4 },
  { id: 'cycle-b', owner: 'owner', parent: 'cycle-a', name: 'Cycle B', scope: '', sortOrder: 5 },
]

const flattened = flattenLibraryFolders(folders)
assert.deepEqual(flattened.map((folder) => [folder.id, folder.depth]), [
  ['root-a', 0],
  ['root-b', 0],
  ['child', 1],
  ['orphan', 0],
  ['cycle-a', 0],
  ['cycle-b', 1],
])

assert.deepEqual(
  scopedFolders(folders, 'favorite', ['child']).map((folder) => folder.id),
  ['root-b', 'child'],
)
assert.deepEqual(
  scopedFolders(folders, 'template', ['root-a', 'orphan']).map((folder) => folder.id),
  ['root-a', 'orphan'],
)

console.log('library tree assertions passed')

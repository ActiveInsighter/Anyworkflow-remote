export interface CatalogModel {
  id: string
  displayName: string
  description: string
  inputTokenLimit: number
  outputTokenLimit: number
  methods: string[]
  thinking: boolean
}
export interface ModelCatalog {
  provider: string
  status: 'idle' | 'syncing' | 'ready' | 'failed'
  models: CatalogModel[]
  syncedAt: string
  requestedAt: string
  error: string
}
export interface SavedModel {
  id: string
  owner: string
  provider: string
  modelId: string
  name: string
}

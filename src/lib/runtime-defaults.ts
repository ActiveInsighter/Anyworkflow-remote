import { ApiError, assertOwner, request } from './pocketbase'
import { normalizeRuntimeConfig, type RuntimeConfig } from './runtime-config'

export interface RuntimeDefaults {
  owner: string
  schemaVersion: 1
  revision: number
  config: RuntimeConfig
}
function checkedDefaults(value: RuntimeDefaults): RuntimeDefaults {
  assertOwner(value)
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new ApiError('运行配置响应无效', 502, 'INVALID_RUNTIME_DEFAULTS')
  }
  return { ...value, config: normalizeRuntimeConfig(value.config) }
}
export async function getRuntimeDefaults(signal?: AbortSignal): Promise<RuntimeDefaults> {
  return checkedDefaults(await request<RuntimeDefaults>('/api/anyworkflow/runtime-defaults', { signal }))
}
export async function saveRuntimeDefaults(config: RuntimeConfig, expectedRevision: number): Promise<RuntimeDefaults> {
  const normalized = normalizeRuntimeConfig(config)
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('运行配置版本无效')
  try {
    return checkedDefaults(await request<RuntimeDefaults>('/api/anyworkflow/runtime-defaults', {
      method: 'PUT', data: { config: normalized, expectedRevision },
    }))
  } catch (error) {
    // A lost response is not permission to issue the write twice.
    if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
      try {
        const saved = await getRuntimeDefaults()
        if ([expectedRevision, expectedRevision + 1].includes(saved.revision) &&
            JSON.stringify(saved.config) === JSON.stringify(normalized)) return saved
      } catch { /* Keep the original write failure. */ }
    }
    throw error
  }
}

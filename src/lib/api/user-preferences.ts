import { ApiError, listOwnedCollection, quoteFilter, request, assertOwner } from './client'
import { requireSession } from './session'
import { normalizeStartLinks, type StartLink } from '../domain/start-links'

/**
 * One record per account in `aw_user_preferences` (unique owner). Owner-only rules on the
 * collection; the stored JSON is re-validated on every read.
 */
const COLLECTION = 'aw_user_preferences'

interface PreferencesRecord {
  id: string
  owner: string
  startLinks?: unknown
}

export interface UserPreferences {
  /** Null until the account saves its first preference. */
  id: string | null
  /** Null when the account never customised its start links: use the defaults. */
  startLinks: StartLink[] | null
}

function fromRecord(record: PreferencesRecord | undefined): UserPreferences {
  return { id: record?.id ?? null, startLinks: record ? normalizeStartLinks(record.startLinks) : null }
}

export async function getUserPreferences(signal?: AbortSignal): Promise<UserPreferences> {
  const owner = requireSession().record.id
  const list = await listOwnedCollection<PreferencesRecord>(
    COLLECTION,
    { filter: `owner="${quoteFilter(owner)}"`, perPage: 1, skipTotal: true },
    (record) => record,
    signal,
  )
  return fromRecord(list.items[0])
}

async function writeRecord(id: string | null, data: Record<string, unknown>): Promise<PreferencesRecord> {
  const owner = requireSession().record.id
  const record = id
    ? await request<PreferencesRecord>(`/api/collections/${COLLECTION}/records/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        data,
      })
    : await request<PreferencesRecord>(`/api/collections/${COLLECTION}/records`, {
        method: 'POST',
        data: { owner, ...data },
      })
  return assertOwner(record)
}

/**
 * Replaces the account's start links. A create that loses a race with another device (the
 * owner index is unique) falls back to updating the record that device created.
 */
export async function saveStartLinks(links: readonly StartLink[], id: string | null): Promise<UserPreferences> {
  const data = { startLinks: links.map(({ id: linkId, label, url }) => ({ id: linkId, label, url })) }
  try {
    return fromRecord(await writeRecord(id, data))
  } catch (error) {
    if (id || !(error instanceof ApiError) || error.status !== 400) throw error
    const existing = await getUserPreferences()
    if (!existing.id) throw error
    return fromRecord(await writeRecord(existing.id, data))
  }
}

import { RUN_COLLECTION } from './config'
import { listOwnedCollection, quoteFilter } from './pocketbase'
import { requireSession } from './session'
import { readStorage, writeStorage } from './storage'

function datePrefix(date: Date): string {
  return `工作流 ${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} #`
}

export function nextRunTitle(titles: readonly string[], reserved: number, date: Date): string {
  const prefix = datePrefix(date)
  let maximum = Number.isSafeInteger(reserved) && reserved > 0 ? reserved : 0
  for (const title of titles) {
    if (!title.startsWith(prefix)) continue
    const index = Number(title.slice(prefix.length).match(/^\d+(?=$|\s)/u)?.[0] || 0)
    if (Number.isSafeInteger(index)) maximum = Math.max(maximum, index)
  }
  if (maximum >= Number.MAX_SAFE_INTEGER) throw new Error('今日工作流序号已超出范围')
  return prefix + String(maximum + 1).padStart(3, '0')
}

const reservations = new Map<string, number>()
let pending: Promise<unknown> = Promise.resolve()

/** Reserve names across tabs on this browser; persisted names also seed other devices. */
export function reserveDefaultRunTitle(date = new Date()): Promise<string> {
  const session = requireSession()
  const prefix = datePrefix(date)
  const key = `anyworkflow.run-name:${session.baseUrl}:${session.record.id}:${prefix}`
  const allocate = async () => {
    const titles: string[] = []
    let page = 1
    while (true) {
      const result = await listOwnedCollection<{ id: string; owner: string; title: string }>(
        RUN_COLLECTION,
        {
          page,
          perPage: 200,
          sort: '+id',
          fields: 'id,owner,title',
          filter: `owner="${quoteFilter(session.record.id)}" && title~"${quoteFilter(prefix)}"`,
        },
        (record) => record,
      )
      titles.push(...result.items.map((record) => record.title))
      if (page >= result.totalPages) break
      page++
    }
    const title = nextRunTitle(
      titles,
      Math.max(reservations.get(key) || 0, Number(readStorage(key)) || 0),
      date,
    )
    const index = Number(title.slice(prefix.length))
    reservations.set(key, index)
    writeStorage(key, String(index))
    return title
  }
  const request = () =>
    typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(key, allocate) : allocate()
  const result = pending.then(request, request)
  pending = result.catch(() => undefined)
  return result
}

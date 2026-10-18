import type { DispatchEventRecord, DispatchTaskRecord } from '@/types'
import { RUN_HIERARCHY_PAGE_SIZE } from './constants'

const pageOf = (index: number) => Math.floor(index / RUN_HIERARCHY_PAGE_SIZE) + 1

/** Run detail URL that opens the page containing `task` and expands it. */
export function taskDeepLink(task: Pick<DispatchTaskRecord, 'id' | 'run' | 'runIndex'>): string {
  return `/runs/${task.run}?task=${task.id}&taskPage=${pageOf(task.runIndex)}`
}

/** Run detail URL that expands `task` and then `event` on its Event page. */
export function eventDeepLink(
  task: Pick<DispatchTaskRecord, 'id' | 'run' | 'runIndex'>,
  event: Pick<DispatchEventRecord, 'id' | 'eventIndex'>,
): string {
  return `${taskDeepLink(task)}&event=${event.id}&eventPage=${pageOf(event.eventIndex)}`
}

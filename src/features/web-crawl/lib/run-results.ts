import { isCrawlRunActive } from '@/lib/api/web-crawl'
import type { CrawlRun, CrawlRunItem, CrawlRunResult } from '@/types/web-crawl'
import { crawlErrorText } from './crawl-display'

export type PageOutcome = 'succeeded' | 'failed' | 'canceled' | 'waiting'

export interface PageResult {
  item: CrawlRunItem
  outcome: PageOutcome
  itemCount: number
  /** Readable failure, empty unless it failed. */
  error: string
  title: string
}

function outcomeOf(result: CrawlRunResult | undefined, active: boolean): PageOutcome {
  if (result) return result.status
  // A finished run settles every page; one missing here only happens on old or partial rows.
  return active ? 'waiting' : 'failed'
}

/** Each page of a run with what happened to it, in the order the run listed them. */
export function pageResults(run: Pick<CrawlRun, 'id' | 'status' | 'items' | 'results'>): PageResult[] {
  const active = isCrawlRunActive(run)
  return (run.items ?? []).map((item) => {
    const result = run.results?.[item.target]
    const outcome = outcomeOf(result, active)
    return {
      item,
      outcome,
      itemCount: result?.itemCount ?? 0,
      error: outcome === 'failed' ? crawlErrorText(result?.errorCode ?? '', result?.error) : '',
      // The owner's name first, as elsewhere; a failure's title is usually the error page's.
      title: item.name || (outcome === 'succeeded' && result?.title) || item.url,
    }
  })
}

/** One target's result inside a run, for that target's own history. */
export function pageResultFor(run: Pick<CrawlRun, 'id' | 'status' | 'items' | 'results'>, targetId: string): PageResult | undefined {
  return pageResults(run).find((result) => result.item.target === targetId)
}

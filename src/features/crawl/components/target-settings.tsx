import { useState, type FormEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { CRAWL_INTERVALS, isXUrl, optionsForUrl, parseCrawlUrls } from '@/lib/api/crawl'
import type { CrawlRunner, CrawlTarget, CrawlTargetInput } from '@/types/crawl'
import { countSetOptions, draftErrors, draftFromOptions, optionsFromDraft, type OptionDraft } from '../lib/option-draft'
import { CategoryField, CrawlOptionFields } from './crawl-option-fields'
import { RunnerField } from './runner-field'

export const TARGET_SETTINGS_FORM = 'crawl-target-settings'

interface Draft {
  url: string
  name: string
  runner: CrawlRunner
  category: string
  intervalMinutes: number
  enabled: boolean
  options: OptionDraft
}

function draftOf(target: CrawlTarget): Draft {
  return {
    url: target.url,
    name: target.name,
    runner: target.runner,
    category: target.category,
    intervalMinutes: target.intervalMinutes,
    enabled: target.enabled,
    options: draftFromOptions(target.options),
  }
}

/** The fields that differ from the saved page, or an error to show instead. */
function changesOf(target: CrawlTarget, draft: Draft): { patch: Partial<CrawlTargetInput> } | { error: string } {
  const parsed = parseCrawlUrls(draft.url)
  const [url] = parsed.urls
  if (!url || parsed.urls.length !== 1 || parsed.invalid.length) return { error: '请填写一个有效的 http(s) 链接' }
  if (Object.keys(draftErrors(draft.options, draft.runner)).length) return { error: '请先修正采集选项' }
  const next: CrawlTargetInput = {
    url,
    name: draft.name.trim(),
    runner: draft.runner,
    category: draft.category.trim() || target.category,
    options: optionsForUrl(url, optionsFromDraft(draft.options, draft.runner), draft.runner),
    intervalMinutes: draft.intervalMinutes,
    enabled: draft.intervalMinutes > 0 && draft.enabled,
  }
  const patch: Partial<CrawlTargetInput> = {}
  for (const key of Object.keys(next) as (keyof CrawlTargetInput)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(target[key])) Object.assign(patch, { [key]: next[key] })
  }
  // The server reads options against the runner and link, so a change to either sends them too.
  if ((patch.runner || patch.url) && !patch.options) patch.options = next.options
  return { patch }
}

/**
 * A page's settings as one form; the sheet's footer submits it (`form={TARGET_SETTINGS_FORM}`).
 * Only changed fields are sent, so an untouched schedule keeps its next run time.
 */
export function TargetSettings({
  target,
  categories,
  online,
  saving,
  onSave,
  onError,
}: {
  target: CrawlTarget
  categories: readonly string[]
  online: boolean
  saving: boolean
  onSave: (patch: Partial<CrawlTargetInput>) => void
  onError: (message: string) => void
}) {
  const [draft, setDraft] = useState(() => draftOf(target))
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const showScope = isXUrl(parseCrawlUrls(draft.url).urls[0] ?? '') || draft.options.scope !== ''
  const optionCount = countSetOptions(draft.options, draft.runner)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const changes = changesOf(target, draft)
    if ('error' in changes) return onError(changes.error)
    onError('')
    if (Object.keys(changes.patch).length) onSave(changes.patch)
  }

  return (
    <form id={TARGET_SETTINGS_FORM} onSubmit={submit} noValidate>
      <fieldset disabled={saving} className="flex min-w-0 flex-col gap-5">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="target-url">链接</FieldLabel>
            <Input id="target-url" type="url" inputMode="url" spellCheck={false} maxLength={2048} className="font-mono text-sm" value={draft.url} onChange={(event) => set('url', event.target.value)} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="target-name">名称</FieldLabel>
            <Input id="target-name" maxLength={120} value={draft.name} placeholder={target.title || '留空时使用页面标题'} onChange={(event) => set('name', event.target.value)} />
          </Field>
          <RunnerField id="target-runner" value={draft.runner} onChange={(runner) => set('runner', runner)} online={online} />
          <CategoryField id="target-category" value={draft.category} onChange={(value) => set('category', value)} known={categories} allowAuto={false} />
          <Field>
            <FieldLabel htmlFor="target-interval">抓取频率</FieldLabel>
            <NativeSelect
              id="target-interval"
              value={draft.intervalMinutes}
              onChange={(event) => {
                const minutes = Number(event.target.value)
                // Choosing a frequency means "crawl on this schedule"; manual turns the schedule off.
                setDraft((current) => ({ ...current, intervalMinutes: minutes, enabled: minutes > 0 }))
              }}
            >
              {CRAWL_INTERVALS.map((option) => <NativeSelectOption key={option.minutes} value={option.minutes}>{option.label}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          {draft.intervalMinutes > 0 ? (
            <Field orientation="horizontal" className="items-start sm:pt-7">
              <Switch id="target-enabled" checked={draft.enabled} onCheckedChange={(checked) => set('enabled', checked)} />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="target-enabled">按频率自动抓取</FieldLabel>
                <FieldDescription>暂停后只在手动抓取时更新。</FieldDescription>
              </div>
            </Field>
          ) : null}
        </div>

        <Collapsible className="group/options border-t pt-4" defaultOpen={optionCount > 0}>
          <CollapsibleTrigger className="-mx-1 flex min-h-touch items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35 sm:min-h-7">
            <ChevronRight aria-hidden="true" className="size-3.5 transition-transform duration-fast group-data-[state=open]/options:rotate-90" />
            采集选项
            {optionCount ? <Badge variant="info" className="h-4.5 min-w-4.5 px-1 text-micro tabular-nums" aria-label={`已设置 ${optionCount} 项`}>{optionCount}</Badge> : null}
          </CollapsibleTrigger>
          <CollapsibleContent forceMount className="pt-3 data-[state=closed]:hidden">
            <CrawlOptionFields id="target-options" draft={draft.options} onChange={(options) => set('options', options)} runner={draft.runner} showScope={showScope} />
          </CollapsibleContent>
        </Collapsible>
      </fieldset>
    </form>
  )
}

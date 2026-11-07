import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Composer, ComposerBar, ComposerBody } from '@/components/layout/composer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { CRAWL_INTERVALS, MAX_CRAWL_TARGETS, parseCrawlUrls } from '@/lib/api/web-crawl'
import type { WebCrawlState } from '../hooks/use-web-crawl'
import { countSetOptions, draftErrors, EMPTY_OPTION_DRAFT, optionsFromDraft, type OptionDraft } from '../lib/option-draft'
import { CategoryField, CrawlOptionFields } from './crawl-option-fields'

const MAX_URLS_PER_ADD = 50
const SHOWN_HOSTS = 3
const DEFAULT_INTERVAL = 1440

function hostsOf(urls: string[]): string[] {
  return [...new Set(urls.map((url) => new URL(url).hostname.replace(/^www\./u, '')))]
}

/** New pages: paste links, pick how often, add. How they are crawled folds away until needed. */
export function CrawlComposer({ crawl, categories }: { crawl: WebCrawlState; categories: readonly string[] }) {
  const [text, setText] = useState('')
  const [intervalMinutes, setIntervalMinutes] = useState(DEFAULT_INTERVAL)
  const [contentType, setContentType] = useState('')
  const [draft, setDraft] = useState<OptionDraft>(EMPTY_OPTION_DRAFT)
  const [crawlNow, setCrawlNow] = useState(true)
  const [error, setError] = useState('')
  const parsed = useMemo(() => parseCrawlUrls(text), [text])
  const hosts = useMemo(() => hostsOf(parsed.urls), [parsed.urls])
  const optionCount = countSetOptions(draft)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (crawl.adding) return
    if (parsed.invalid.length) return setError(`无法识别：${parsed.invalid.slice(0, 3).join('、')}`)
    if (!parsed.urls.length) return setError('请填写至少一个链接')
    if (parsed.urls.length > MAX_URLS_PER_ADD) return setError(`一次最多添加 ${MAX_URLS_PER_ADD} 个链接`)
    if (Object.keys(draftErrors(draft)).length) return setError('请先修正抓取选项')
    setError('')
    const outcome = await crawl.add(parsed.urls, { ...optionsFromDraft(draft), contentType: contentType.trim(), intervalMinutes, enabled: intervalMinutes > 0 }, crawlNow)
    if (!outcome) return
    // Rejected links stay in the box with the reason, ready to fix and resubmit.
    setText(outcome.failed.map((item) => item.url).join('\n'))
    const firstFailure = outcome.failed[0]
    if (firstFailure) setError(`${firstFailure.message}：${firstFailure.url}`)
    if (outcome.created.length) {
      toast.success(outcome.started ? `已添加 ${outcome.created.length} 个页面，开始抓取` : `已添加 ${outcome.created.length} 个页面`)
    }
  }

  function submitOnShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <Composer aria-labelledby="crawl-composer-title" onSubmit={(event) => void submit(event)} noValidate>
      <h2 id="crawl-composer-title" className="sr-only">添加抓取页面</h2>
      <ComposerBody className="pb-1 sm:pb-2">
        <fieldset disabled={crawl.adding} className="flex min-w-0 flex-col gap-3">
          <Label htmlFor="crawl-urls" className="sr-only">页面链接</Label>
          <Textarea
            id="crawl-urls"
            name="urls"
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={submitOnShortcut}
            placeholder={'粘贴要抓取的页面或 X 帖子链接\n每行一个，也可以一次粘贴多个'}
            spellCheck={false}
            aria-describedby="crawl-urls-help"
            className="max-h-56 min-h-20 resize-none overflow-y-auto rounded-none border-0 bg-transparent p-1 font-mono text-sm leading-6 shadow-none placeholder:font-sans focus-visible:ring-0 md:text-sm"
          />

          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="crawl-interval">抓取频率</FieldLabel>
              <NativeSelect id="crawl-interval" value={intervalMinutes} onChange={(event) => setIntervalMinutes(Number(event.target.value))}>
                {CRAWL_INTERVALS.map((option) => <NativeSelectOption key={option.minutes} value={option.minutes}>{option.label}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <CategoryField id="crawl-category" value={contentType} onChange={setContentType} known={categories} />
          </div>

          <Collapsible className="group/options">
            <CollapsibleTrigger className="-mx-1 flex min-h-touch items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35 sm:min-h-7">
              <ChevronRight aria-hidden="true" className="size-3.5 transition-transform duration-fast group-data-[state=open]/options:rotate-90" />
              抓取选项
              {optionCount ? <Badge variant="info" className="h-4.5 min-w-4.5 px-1 text-micro tabular-nums" aria-label={`已设置 ${optionCount} 项`}>{optionCount}</Badge> : null}
            </CollapsibleTrigger>
            {/* Stays mounted while folded: what was entered still applies to the batch. */}
            <CollapsibleContent forceMount className="pt-3 pb-3 data-[state=closed]:hidden">
              <CrawlOptionFields id="crawl-new" draft={draft} onChange={setDraft} showX />
            </CollapsibleContent>
          </Collapsible>

          <ErrorAlert inline>{error || crawl.addError}</ErrorAlert>
        </fieldset>
      </ComposerBody>
      <ComposerBar>
        <div id="crawl-urls-help" role="status" className="me-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground tabular-nums">
          {parsed.urls.length ? (
            <>
              <span className="font-medium text-foreground">{parsed.urls.length} 个链接</span>
              {hosts.slice(0, SHOWN_HOSTS).map((host) => <span key={host} className="max-w-40 truncate">{host}</span>)}
              {hosts.length > SHOWN_HOSTS ? <span>等 {hosts.length} 个站点</span> : null}
            </>
          ) : (
            <span>最多保存 {MAX_CRAWL_TARGETS} 个页面</span>
          )}
        </div>
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <label className="flex min-h-touch cursor-pointer items-center gap-2 text-caption text-muted-foreground sm:min-h-0">
            <Switch checked={crawlNow} onCheckedChange={setCrawlNow} aria-label="添加后立即抓取" />
            立即抓取
          </label>
          <Button type="submit" size="touch" className="min-w-28" disabled={crawl.adding} title="Ctrl + Enter">
            {crawl.adding ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
            {crawl.adding ? '添加中…' : '添加页面'}
          </Button>
        </div>
      </ComposerBar>
    </Composer>
  )
}

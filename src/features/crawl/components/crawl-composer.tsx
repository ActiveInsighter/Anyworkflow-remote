import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { BookmarkPlus, ChevronRight, Play } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Composer, ComposerBar, ComposerBody } from '@/components/layout/composer'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { CRAWL_INTERVALS, isXUrl, MAX_URLS_PER_SUBMIT, parseCrawlUrls } from '@/lib/api/crawl'
import type { CrawlRunner } from '@/types/crawl'
import type { CrawlState } from '../hooks/use-crawl'
import { loginHosts } from '../lib/crawl-display'
import { countSetOptions, draftErrors, EMPTY_OPTION_DRAFT, optionsFromDraft, type OptionDraft } from '../lib/option-draft'
import { CategoryField, CrawlOptionFields } from './crawl-option-fields'
import { RunnerField } from './runner-field'

const SHOWN_HOSTS = 3
const DEFAULT_INTERVAL = 1440

function hostsOf(urls: string[]): string[] {
  return [...new Set(urls.map((url) => new URL(url).hostname.replace(/^www\./u, '')))]
}

/**
 * Where crawls start: paste links, choose where they run, go. Saving them as pages to crawl on a
 * schedule is one switch away; how a page is read folds away until needed.
 */
export function CrawlComposer({
  crawl,
  categories,
  onSubmitted,
}: {
  crawl: CrawlState
  categories: readonly string[]
  /** After an accepted submission: whether it saved pages, so the page can show where they went. */
  onSubmitted: (saved: boolean) => void
}) {
  const [text, setText] = useState('')
  const [runner, setRunner] = useState<CrawlRunner>('cloud')
  const [category, setCategory] = useState('')
  const [save, setSave] = useState(false)
  const [intervalMinutes, setIntervalMinutes] = useState(DEFAULT_INTERVAL)
  const [draft, setDraft] = useState<OptionDraft>(EMPTY_OPTION_DRAFT)
  const [error, setError] = useState('')
  const parsed = useMemo(() => parseCrawlUrls(text), [text])
  const hosts = useMemo(() => hostsOf(parsed.urls), [parsed.urls])
  const needsLogin = useMemo(() => (runner === 'cloud' ? loginHosts(parsed.urls) : []), [parsed.urls, runner])
  const optionCount = countSetOptions(draft, runner)
  const online = crawl.online.length > 0

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (crawl.submitting) return
    if (parsed.invalid.length) return setError(`无法识别：${parsed.invalid.slice(0, 3).join('、')}`)
    if (!parsed.urls.length) return setError('请填写至少一个链接')
    if (parsed.urls.length > MAX_URLS_PER_SUBMIT) return setError(`一次最多提交 ${MAX_URLS_PER_SUBMIT} 个链接`)
    if (Object.keys(draftErrors(draft, runner)).length) return setError('请先修正采集选项')
    setError('')
    const outcome = await crawl.submit(parsed.urls, {
      runner,
      category: category.trim(),
      options: optionsFromDraft(draft, runner),
      save: save ? { intervalMinutes } : null,
    })
    if (!outcome) return
    // Rejected links stay in the box with the reason, ready to fix and resubmit.
    setText(outcome.failed.map((item) => item.url).join('\n'))
    const firstFailure = outcome.failed[0]
    if (firstFailure) setError(`${firstFailure.message}：${firstFailure.url}`)
    if (!outcome.accepted) return
    if (save) toast.success(`已保存 ${outcome.accepted} 个页面${outcome.notStarted ? `，${outcome.notStarted} 个没有开始抓取` : '，开始抓取'}`)
    else toast.success(`已提交 ${outcome.accepted} 个抓取`)
    onSubmitted(save)
  }

  function submitOnShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <Composer aria-labelledby="crawl-composer-title" onSubmit={(event) => void submit(event)} noValidate>
      <h2 id="crawl-composer-title" className="sr-only">新建网页采集</h2>
      <ComposerBody className="pb-1 sm:pb-2">
        <fieldset disabled={crawl.submitting} className="flex min-w-0 flex-col gap-4">
          <div>
            <Label htmlFor="crawl-urls" className="sr-only">页面链接</Label>
            <Textarea
              id="crawl-urls"
              name="urls"
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={submitOnShortcut}
              placeholder={'粘贴网页或社交媒体帖子的链接\n每行一个，也可以一次粘贴多个'}
              spellCheck={false}
              aria-describedby="crawl-urls-help"
              className="max-h-56 min-h-20 resize-none overflow-y-auto rounded-none border-0 bg-transparent p-1 font-mono text-sm leading-6 shadow-none placeholder:font-sans focus-visible:ring-0 md:text-sm"
            />
          </div>

          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <RunnerField id="crawl-runner" value={runner} onChange={setRunner} online={online} />
            <CategoryField id="crawl-category" value={category} onChange={setCategory} known={categories} />
          </div>

          {needsLogin.length ? (
            <Alert variant="info" size="sm">
              <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{needsLogin.join('、')} 通常需要登录才能看到完整内容。</span>
                <Button type="button" size="sm" variant="link" className="h-auto px-0" onClick={() => setRunner('browser')}>
                  改用浏览器
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <Field orientation="horizontal" className="items-start">
              <Switch id="crawl-save" className="mt-0.5" checked={save} onCheckedChange={setSave} aria-describedby="crawl-save-help" />
              <FieldContent>
                <FieldLabel htmlFor="crawl-save">保存为页面</FieldLabel>
                <FieldDescription id="crawl-save-help">加入页面列表，可按频率重复抓取，内容变化时标出。</FieldDescription>
              </FieldContent>
            </Field>
            {save ? (
              <Field>
                <FieldLabel htmlFor="crawl-interval">抓取频率</FieldLabel>
                <NativeSelect id="crawl-interval" value={intervalMinutes} onChange={(event) => setIntervalMinutes(Number(event.target.value))}>
                  {CRAWL_INTERVALS.map((option) => <NativeSelectOption key={option.minutes} value={option.minutes}>{option.label}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
            ) : null}
          </div>

          <Collapsible className="group/options">
            <CollapsibleTrigger className="-mx-1 flex min-h-touch items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35 sm:min-h-7">
              <ChevronRight aria-hidden="true" className="size-3.5 transition-transform duration-fast group-data-[state=open]/options:rotate-90" />
              采集选项
              {optionCount ? <Badge variant="info" className="h-4.5 min-w-4.5 px-1 text-micro tabular-nums" aria-label={`已设置 ${optionCount} 项`}>{optionCount}</Badge> : null}
            </CollapsibleTrigger>
            {/* Stays mounted while folded: what was entered still applies to the batch. */}
            <CollapsibleContent forceMount>
              <div className="pt-3 pb-3">
                <CrawlOptionFields id="crawl-new" draft={draft} onChange={setDraft} runner={runner} showScope={parsed.urls.some(isXUrl) || draft.scope !== ''} />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <ErrorAlert inline>{error || crawl.submitError}</ErrorAlert>
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
            <span>一次最多 {MAX_URLS_PER_SUBMIT} 个</span>
          )}
        </div>
        <Button type="submit" size="touch" className="w-full sm:w-auto sm:min-w-32" disabled={crawl.submitting} title="Ctrl + Enter">
          {crawl.submitting ? <Spinner data-icon="inline-start" /> : save ? <BookmarkPlus data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          {crawl.submitting ? '提交中…' : save ? '保存并抓取' : '开始抓取'}
        </Button>
      </ComposerBar>
    </Composer>
  )
}

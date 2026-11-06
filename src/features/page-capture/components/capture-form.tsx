import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronRight, Play } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Composer, ComposerBar, ComposerBody } from '@/components/layout/composer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { MAX_CAPTURE_URLS, parseCaptureUrls } from '@/lib/api/page-capture'
import type { CaptureJobsState } from '../hooks/use-capture-jobs'

const MIN_TIMEOUT = 10
const MAX_TIMEOUT = 280
const SHOWN_HOSTS = 3

const SWITCHES = [
  { key: 'scroll', label: '滚动加载', help: '逐屏滚动到底部，用于懒加载和无限滚动页面。' },
  { key: 'keepHtml', label: '保留 HTML', help: '除 Markdown 外同时保存清理后的 HTML。' },
  { key: 'generic', label: '只用通用解析', help: '跳过站点规则，用于对比效果。' },
] as const

type SwitchKey = (typeof SWITCHES)[number]['key']

const EMPTY_FIELDS = { waitFor: '', contentSelector: '', removeSelectors: '', timeoutSeconds: '' }

function hostsOf(urls: string[]): string[] {
  return [...new Set(urls.map((url) => new URL(url).hostname.replace(/^www\./u, '')))]
}

/** New captures: paste links and go. Per-batch overrides fold away until needed. */
export function CaptureForm({ capture }: { capture: CaptureJobsState }) {
  const [text, setText] = useState('')
  const [switches, setSwitches] = useState<Record<SwitchKey, boolean>>({ scroll: false, keepHtml: false, generic: false })
  const [fields, setFields] = useState(EMPTY_FIELDS)
  const [error, setError] = useState('')
  const parsed = useMemo(() => parseCaptureUrls(text), [text])
  const hosts = useMemo(() => hostsOf(parsed.urls), [parsed.urls])
  const optionCount = [...Object.values(switches), ...Object.values(fields).map((value) => value.trim())].filter(Boolean).length

  function setField(key: keyof typeof EMPTY_FIELDS, value: string) {
    setFields((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (capture.creating) return
    if (parsed.invalid.length) {
      setError(`无法识别：${parsed.invalid.slice(0, 3).join('、')}`)
      return
    }
    if (!parsed.urls.length) {
      setError('请填写至少一个链接')
      return
    }
    if (parsed.urls.length > MAX_CAPTURE_URLS) {
      setError(`一次最多提交 ${MAX_CAPTURE_URLS} 个链接`)
      return
    }
    setError('')
    const outcome = await capture.submit(parsed.urls, {
      ...switches,
      waitFor: fields.waitFor,
      contentSelector: fields.contentSelector,
      removeSelectors: fields.removeSelectors.split('\n'),
      timeoutSeconds: Number(fields.timeoutSeconds) || undefined,
    })
    if (!outcome) return
    // Rejected links stay in the box with the reason, ready to fix and resubmit.
    setText(outcome.failed.map((item) => item.url).join('\n'))
    const firstFailure = outcome.failed[0]
    if (firstFailure) setError(`${firstFailure.message}：${firstFailure.url}`)
    if (outcome.created) toast.success(`已提交 ${outcome.created} 个采集任务`)
  }

  function submitOnShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <Composer aria-labelledby="capture-form-title" onSubmit={(event) => void submit(event)} noValidate>
      <h2 id="capture-form-title" className="sr-only">新建采集</h2>
      <ComposerBody className="pb-1 sm:pb-2">
        <fieldset disabled={capture.creating} className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="capture-urls" className="sr-only">页面链接</Label>
          <Textarea
            id="capture-urls"
            name="urls"
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={submitOnShortcut}
            placeholder={'粘贴要采集的页面链接\n每行一个，也可以一次粘贴多个'}
            spellCheck={false}
            aria-describedby="capture-urls-help"
            className="max-h-56 min-h-20 resize-none overflow-y-auto rounded-none border-0 bg-transparent p-1 font-mono text-sm leading-6 shadow-none placeholder:font-sans focus-visible:ring-0 md:text-sm"
          />

          <Collapsible className="group/options">
            <CollapsibleTrigger className="-mx-1 flex min-h-touch items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35 sm:min-h-7">
              <ChevronRight aria-hidden="true" className="size-3.5 transition-transform duration-fast group-data-[state=open]/options:rotate-90" />
              采集选项
              {optionCount ? <Badge variant="info" className="h-4.5 min-w-4.5 px-1 text-micro tabular-nums" aria-label={`已设置 ${optionCount} 项`}>{optionCount}</Badge> : null}
            </CollapsibleTrigger>
            {/* Stays mounted while folded: what was entered still applies to the batch. */}
            <CollapsibleContent forceMount className="grid min-w-0 gap-4 pt-3 pb-3 data-[state=closed]:hidden sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="capture-wait">等待元素</FieldLabel>
                <Input id="capture-wait" name="waitFor" maxLength={500} placeholder=".article-body" className="font-mono text-xs md:text-xs" value={fields.waitFor} onChange={(event) => setField('waitFor', event.target.value)} />
                <FieldDescription>出现后再开始解析。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="capture-content">正文选择器</FieldLabel>
                <Input id="capture-content" name="contentSelector" maxLength={500} placeholder="main article" className="font-mono text-xs md:text-xs" value={fields.contentSelector} onChange={(event) => setField('contentSelector', event.target.value)} />
                <FieldDescription>指定后优先于站点规则和通用解析。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="capture-remove">移除元素</FieldLabel>
                <Textarea id="capture-remove" name="removeSelectors" rows={2} placeholder={'.ad\n.comments'} spellCheck={false} className="min-h-16 font-mono text-xs md:text-xs" value={fields.removeSelectors} onChange={(event) => setField('removeSelectors', event.target.value)} />
                <FieldDescription>每行一个选择器。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="capture-timeout">超时（秒）</FieldLabel>
                <Input id="capture-timeout" name="timeoutSeconds" type="number" inputMode="numeric" min={MIN_TIMEOUT} max={MAX_TIMEOUT} step={1} placeholder="90" value={fields.timeoutSeconds} onChange={(event) => setField('timeoutSeconds', event.target.value)} />
                <FieldDescription>{MIN_TIMEOUT}–{MAX_TIMEOUT} 秒。</FieldDescription>
              </Field>
              <div className="grid min-w-0 gap-4 sm:col-span-2 sm:grid-cols-3">
                {SWITCHES.map(({ key, label, help }) => (
                  <Field key={key} orientation="horizontal" className="items-start">
                    <FieldContent>
                      <FieldLabel htmlFor={`capture-${key}`}>{label}</FieldLabel>
                      <FieldDescription id={`capture-${key}-help`}>{help}</FieldDescription>
                    </FieldContent>
                    <Switch
                      id={`capture-${key}`}
                      className="mt-0.5"
                      checked={switches[key]}
                      onCheckedChange={(checked) => setSwitches((current) => ({ ...current, [key]: checked }))}
                      aria-describedby={`capture-${key}-help`}
                    />
                  </Field>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <ErrorAlert inline>{error || capture.createError}</ErrorAlert>
        </fieldset>
      </ComposerBody>
      <ComposerBar>
        <div id="capture-urls-help" role="status" className="me-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground tabular-nums">
          {parsed.urls.length ? (
            <>
              <span className="font-medium text-foreground">{parsed.urls.length} 个链接</span>
              {hosts.slice(0, SHOWN_HOSTS).map((host) => <span key={host} className="max-w-40 truncate">{host}</span>)}
              {hosts.length > SHOWN_HOSTS ? <span>等 {hosts.length} 个站点</span> : null}
            </>
          ) : (
            <span>一次最多 {MAX_CAPTURE_URLS} 个</span>
          )}
        </div>
        <Button type="submit" size="touch" className="w-full sm:w-auto" disabled={capture.creating} title="Ctrl + Enter">
          {capture.creating ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          {capture.creating ? '提交中…' : '开始采集'}
        </Button>
      </ComposerBar>
    </Composer>
  )
}

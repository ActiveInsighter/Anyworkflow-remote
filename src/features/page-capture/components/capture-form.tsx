import { useState, type FormEvent } from 'react'
import { ChevronRight, Play } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { MAX_CAPTURE_URLS, parseCaptureUrls } from '@/lib/api/page-capture'
import type { CaptureJobsState } from '../hooks/use-capture-jobs'

const MIN_TIMEOUT = 10
const MAX_TIMEOUT = 280

const SWITCHES = [
  { key: 'scroll', label: '滚动加载', help: '逐屏滚动到底部，用于懒加载和无限滚动页面。' },
  { key: 'keepHtml', label: '保留 HTML', help: '除 Markdown 外同时保存清理后的 HTML。' },
  { key: 'generic', label: '只用通用解析', help: '跳过站点规则，用于对比效果。' },
] as const

type SwitchKey = (typeof SWITCHES)[number]['key']

/** New captures: one link per line, with per-batch overrides folded away until needed. */
export function CaptureForm({ capture }: { capture: CaptureJobsState }) {
  const [text, setText] = useState('')
  const [switches, setSwitches] = useState<Record<SwitchKey, boolean>>({ scroll: false, keepHtml: false, generic: false })
  const [error, setError] = useState('')
  const parsed = parseCaptureUrls(text)

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
    const form = new FormData(event.currentTarget)
    const field = (name: string) => String(form.get(name) ?? '')
    const timeout = Number(field('timeoutSeconds'))
    const outcome = await capture.submit(parsed.urls, {
      ...switches,
      waitFor: field('waitFor'),
      contentSelector: field('contentSelector'),
      removeSelectors: field('removeSelectors').split('\n'),
      timeoutSeconds: timeout || undefined,
    })
    if (!outcome) return
    // Rejected links stay in the box with the reason, ready to fix and resubmit.
    setText(outcome.failed.map((item) => item.url).join('\n'))
    const firstFailure = outcome.failed[0]
    if (firstFailure) setError(`${firstFailure.message}：${firstFailure.url}`)
    if (outcome.created) toast.success(`已提交 ${outcome.created} 个采集任务`)
  }

  return (
    <Card aria-labelledby="capture-form-title">
      <CardHeader>
        <CardTitle id="capture-form-title">新建采集</CardTitle>
      </CardHeader>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <CardContent>
          <fieldset disabled={capture.creating} className="min-w-0">
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="capture-urls">页面链接</FieldLabel>
                <Textarea
                  id="capture-urls"
                  name="urls"
                  rows={5}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={'https://example.com/article\n每行一个，也可以直接粘贴多个'}
                  spellCheck={false}
                  aria-describedby="capture-urls-help"
                  className="font-mono text-xs"
                />
                <FieldDescription id="capture-urls-help">
                  {parsed.urls.length ? `${parsed.urls.length} 个链接` : `一次最多 ${MAX_CAPTURE_URLS} 个`}
                </FieldDescription>
              </Field>

              <Collapsible className="group/options">
                <CollapsibleTrigger className="-mx-1 flex min-h-touch items-center gap-1 rounded-md px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8">
                  <ChevronRight aria-hidden="true" className="size-3.5 transition-transform duration-fast group-data-[state=open]/options:rotate-90" />
                  采集选项
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <FieldGroup className="gap-5">
                    <Field>
                      <FieldLabel htmlFor="capture-wait">等待元素</FieldLabel>
                      <Input id="capture-wait" name="waitFor" maxLength={500} placeholder=".article-body" className="font-mono text-xs" />
                      <FieldDescription>出现后再开始解析。</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="capture-content">正文选择器</FieldLabel>
                      <Input id="capture-content" name="contentSelector" maxLength={500} placeholder="main article" className="font-mono text-xs" />
                      <FieldDescription>指定后优先于站点规则和通用解析。</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="capture-remove">移除元素</FieldLabel>
                      <Textarea id="capture-remove" name="removeSelectors" rows={2} placeholder={'.ad\n.comments'} spellCheck={false} className="font-mono text-xs" />
                      <FieldDescription>每行一个选择器。</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="capture-timeout">超时（秒）</FieldLabel>
                      <Input id="capture-timeout" name="timeoutSeconds" type="number" inputMode="numeric" min={MIN_TIMEOUT} max={MAX_TIMEOUT} step={1} placeholder="90" />
                    </Field>
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
                  </FieldGroup>
                </CollapsibleContent>
              </Collapsible>

              <ErrorAlert inline>{error || capture.createError}</ErrorAlert>
            </FieldGroup>
          </fieldset>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={capture.creating}>
            {capture.creating ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {capture.creating ? '提交中…' : '开始采集'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

import type { DataMessagePartProps } from '@assistant-ui/react'
import { Brain, ChevronDown, Code2, Download, FileJson, FileText, Terminal } from 'lucide-react'
import { MarkdownReader } from '@/components/data-display/markdown-reader'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { safeFilename, saveBlob } from '@/lib/platform/download'
import { safeHref } from '@/lib/web-urls'
import type { GeminiMessage, GeminiResponsePart } from '@/types/gemini'

function Disclosure({ title, icon: Icon, children }: { title: string; icon: typeof Brain; children: React.ReactNode }) {
  return <Collapsible className="my-2 min-w-0 rounded-lg border bg-muted/20">
    <CollapsibleTrigger className="group flex min-h-touch w-full min-w-0 items-center gap-2 px-3 text-start text-caption font-medium hover:bg-muted/50">
      <Icon className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 break-words">{title}</span>
      <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
    <CollapsibleContent><div className="min-w-0 border-t p-3 text-body">{children}</div></CollapsibleContent>
  </Collapsible>
}
export function JsonDetails({ value }: { value: unknown }) {
  return <pre className="max-h-96 min-w-0 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-6">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>
}
function isPart(value: unknown): value is GeminiResponsePart {
  return Boolean(value && typeof value === 'object' && 'type' in value && 'id' in value)
}
export function GeminiActivity({ data }: DataMessagePartProps) {
  if (!isPart(data)) return null
  if (data.type === 'reasoning') return <Disclosure title="思考摘要" icon={Brain}>
    {data.text ? <MarkdownReader markdown={data.text} /> : <p className="text-muted-foreground">模型未返回这一步的思考摘要。</p>}
  </Disclosure>
  const call = data.type === 'tool-call'
  const result = data.type === 'tool-result'
  return <Disclosure title={`${call ? '工具调用' : result ? '工具结果' : '附件与其他信息'} · ${data.name || data.providerType || '输出'}`} icon={call ? Code2 : result ? Terminal : FileText}>
    {data.callId ? <p className="mb-2 break-all text-caption text-muted-foreground">调用 ID：{data.callId}</p> : null}
    <JsonDetails value={data.data} />
  </Disclosure>
}
function sourceLinks(value: unknown): { title: string; href: string }[] {
  const found = new Map<string, string>()
  function visit(node: unknown, depth: number) {
    if (depth > 12 || !node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(item => visit(item, depth + 1)); return }
    const row = node as Record<string, unknown>
    const url = row.uri ?? row.url
    const href = typeof url === 'string' ? safeHref(url) : undefined
    if (href) found.set(href, typeof row.title === 'string' ? row.title : href)
    Object.values(row).forEach(item => visit(item, depth + 1))
  }
  visit(value, 0)
  return [...found].map(([href, title]) => ({ href, title }))
}
function isInfo(value: unknown): value is { message: GeminiMessage; title: string } {
  return Boolean(value && typeof value === 'object' && 'message' in value && 'title' in value)
}
const USAGE_LABELS: Record<string, string> = { totalTokenCount: '总计', promptTokenCount: '输入', candidatesTokenCount: '输出',
  thoughtsTokenCount: '思考', toolUseTokenCount: '工具', cachedContentTokenCount: '缓存', agentStepCount: 'Agent 步骤' }
export function GeminiResponseInfo({ data }: DataMessagePartProps) {
  if (!isInfo(data)) return null
  const { message, title } = data
  const response = message.response
  const sources = sourceLinks(response)
  const missingThought = !response?.parts.some(part => part.type === 'reasoning' && part.text)
  return <div className="mt-3 min-w-0 space-y-2">
    <ErrorAlert>{message.error}</ErrorAlert>
    {response?.capture.truncated ? <p role="status" className="text-caption text-warning">执行详情过长，部分内容已截短{response.capture.omittedParts ? `，省略 ${response.capture.omittedParts} 个内容块` : ''}。完整回复正文单独保留。</p> : null}
    {missingThought && (message.usage?.thoughtsTokenCount ?? 0) > 0 ? <p className="text-caption text-muted-foreground">模型使用了思考 Token，未返回可显示的思考摘要。</p> : null}
    {sources.length ? <Disclosure title={`引用来源 · ${sources.length}`} icon={FileText}><ul className="space-y-2">
      {sources.map(source => <li key={source.href}><a href={source.href} target="_blank" rel="noopener noreferrer" className="break-words text-primary underline underline-offset-2">{source.title}</a></li>)}
    </ul></Disclosure> : null}
    {Object.keys(message.usage ?? {}).length ? <Disclosure title={`${message.usage.totalTokenCount?.toLocaleString() ?? '—'} Token · 明细`} icon={FileJson}>
      <dl className="grid grid-cols-2 gap-2 text-caption tabular-nums">{Object.entries(USAGE_LABELS).map(([key, label]) => {
        const value = message.usage[key as keyof typeof message.usage]
        return typeof value === 'number' ? <div key={key} className="flex justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd>{value.toLocaleString()}</dd></div> : null
      })}</dl>
      {message.finishReason ? <p className="mt-3 text-caption text-muted-foreground">结束原因：{message.finishReason}</p> : null}
    </Disclosure> : null}
    {response ? <Disclosure title="响应详情" icon={FileJson}><JsonDetails value={{ protocol: response.protocol, capture: response.capture, ...response.metadata }} /></Disclosure> : null}
    <div className="flex flex-wrap gap-1">
      {message.reply ? <Button type="button" variant="ghost" size="sm" onClick={() => saveBlob(new Blob([message.reply], { type: 'text/markdown;charset=utf-8' }), safeFilename(title, 'Gemini 回复', 'md'))}><Download />下载回复</Button> : null}
      {response ? <Button type="button" variant="ghost" size="sm" onClick={() => saveBlob(new Blob([JSON.stringify({ reply: message.reply, usage: message.usage, finishReason: message.finishReason, response }, null, 2)], { type: 'application/json' }), safeFilename(title, 'Gemini 响应', 'json'))}><FileJson />导出响应</Button> : null}
    </div>
  </div>
}

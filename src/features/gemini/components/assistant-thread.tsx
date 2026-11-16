import { ActionBarPrimitive, MessagePrimitive, ThreadPrimitive } from '@assistant-ui/react'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import { ArrowDown, Bot, Copy, Sparkles, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GeminiActivity, GeminiResponseInfo } from './gemini-response-parts'

function MarkdownText() {
  return <div className="min-w-0 break-words text-body leading-7 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-s-2 [&_blockquote]:ps-4 [&_h1]:my-5 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:my-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:my-3 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:ps-6 [&_p]:my-3 [&_pre]:my-4 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-xs [&_table]:block [&_table]:max-w-full [&_table]:overflow-auto [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_ul]:list-disc [&_ul]:ps-6">
    <MarkdownTextPrimitive components={{ a: ({ href, children }) => /^https?:\/\//iu.test(href ?? '') ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>, img: ({ alt }) => <span className="text-muted-foreground">{alt || '图片'}</span> }} />
  </div>
}
function UserMessage() {
  return <MessagePrimitive.Root className="ms-auto flex w-full min-w-0 max-w-3xl justify-end py-4" data-role="user">
    <div className="max-w-[90%] min-w-0 rounded-2xl bg-muted px-4 py-2.5 sm:max-w-[85%]">
      <span className="sr-only"><UserRound />你</span>
      <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
    </div>
  </MessagePrimitive.Root>
}
function AssistantMessage() {
  return <MessagePrimitive.Root className="w-full min-w-0 py-4" data-role="assistant">
    <div className="mb-2 flex items-center gap-2 text-caption font-medium"><Bot className="size-5 text-primary" />助手</div>
    <MessagePrimitive.Parts components={{ Text: MarkdownText, data: { by_name: { 'gemini-activity': GeminiActivity, 'gemini-info': GeminiResponseInfo } } }} />
    <ActionBarPrimitive.Root className="mt-2 flex items-center gap-1">
      <ActionBarPrimitive.Copy asChild><Button variant="ghost" size="icon-touch" aria-label="复制回复"><Copy /></Button></ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>
  </MessagePrimitive.Root>
}
export function AssistantThread() {
  return <ThreadPrimitive.Root className="relative flex min-h-0 min-w-0 flex-1 flex-col">
    <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 sm:px-8" autoScroll>
      <ThreadPrimitive.Empty>
        <div className="mx-auto flex min-h-64 max-w-xl flex-col items-center justify-center gap-4 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Sparkles className="size-6" /></div>
          <h2 className="text-title font-semibold">今天想聊些什么？</h2>
          <p className="text-body text-muted-foreground">直接提问，或添加 Markdown 文件批量处理。</p>
        </div>
      </ThreadPrimitive.Empty>
      <div className="mx-auto w-full max-w-3xl pb-8">
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
      </div>
    </ThreadPrimitive.Viewport>
    <ThreadPrimitive.ScrollToBottom asChild><Button variant="outline" size="icon-touch" className="absolute bottom-3 start-1/2 -translate-x-1/2 rounded-full shadow-sm" aria-label="滚动到最新回复"><ArrowDown /></Button></ThreadPrimitive.ScrollToBottom>
  </ThreadPrimitive.Root>
}

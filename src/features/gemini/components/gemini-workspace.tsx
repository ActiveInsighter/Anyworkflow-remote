import { createContext, useContext, useEffect, useLayoutEffect, type ReactNode } from 'react'
import { AssistantRuntimeProvider, useAui } from '@assistant-ui/react'
import { Link, useSearchParams } from 'react-router'
import { Archive, Download, FileJson } from 'lucide-react'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { ThreadListSidebar } from '@/components/assistant-ui/elements/threadlist-sidebar.aui'
import { ModelSelector } from '@/components/assistant-ui/elements/model-selector.aui'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/assistant-ui/ui/sidebar'
import { Separator } from '@/components/assistant-ui/ui/separator'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/assistant-ui/ui/breadcrumb'
import { Button } from '@/components/assistant-ui/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/assistant-ui/ui/dialog'
import { SelectField, SelectOption } from '@/components/ui/select'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { useSavedModels } from '@/features/models/hooks/use-saved-models'
import { getLibraryFile } from '@/lib/api/library-files'
import { updateGeminiThread } from '@/lib/api/gemini'
import { saveBlob, safeFilename } from '@/lib/platform/download'
import { useGeminiBackend, type GeminiBackend } from '../hooks/use-gemini-backend'
import { libraryAttachment } from '../lib/markdown-attachments'
import { GeminiConfigSheet } from './gemini-config-sheet'

const BackendContext = createContext<GeminiBackend | null>(null)
function useBackend() {
  const value = useContext(BackendContext)
  if (!value) throw new Error('Gemini backend provider is missing')
  return value
}

/** Official templates/default/app/assistant.tsx with the backend runtime and route controls. */
export function GeminiWorkspace() {
  const backend = useGeminiBackend()
  useLayoutEffect(() => {
    document.documentElement.dataset.chatUi = 'official'
    return () => { delete document.documentElement.dataset.chatUi }
  }, [])
  return <BackendContext.Provider value={backend}>
    <AssistantRuntimeProvider runtime={backend.runtime}>
      <SidebarProvider>
        <div className="flex h-dvh w-full pr-0.5" data-testid="gemini-workspace">
          <BackendSidebar />
          <SidebarInset className="min-w-0">
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb className="min-w-0 flex-1">
                <BreadcrumbList className="flex-nowrap">
                  <BreadcrumbItem className="hidden md:block"><BreadcrumbLink asChild><Link to="/">AnyWorkflow</Link></BreadcrumbLink></BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem className="min-w-0"><BreadcrumbPage className="truncate">{backend.job?.title || 'New chat'}</BreadcrumbPage></BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <ArchivedChats />
              {backend.message ? <ResponseDetails /> : null}
              <GeminiConfigSheet config={backend.config} />
            </header>
            {(backend.view.data?.messages.length ?? 0) > 1 ? <div className="px-4 py-2"><SelectField aria-label="选择分段" value={backend.selected} onValueChange={backend.setSelected}>
              {backend.view.data!.messages.map(message => <SelectOption key={message.id} value={message.id}>{message.index}. {message.sourceName} · 第 {message.part} 段</SelectOption>)}
            </SelectField></div> : null}
            {backend.error ? <div className="px-4 pt-2"><ErrorAlert>{backend.error}</ErrorAlert><Button variant="ghost" size="sm" onClick={() => { void backend.config.reload(); void backend.view.reload(); void backend.detail.reload(); void backend.ancestors.reload(); void backend.catalog.reload() }}>重新加载</Button></div> : null}
            <div className="min-h-0 flex-1 overflow-hidden">
              <Thread components={{ ComposerExtra: ComposerBackendOptions }} />
            </div>
          </SidebarInset>
          <RuntimeSync />
        </div>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  </BackendContext.Provider>
}
function BackendSidebar() {
  const sidebar = useSidebar()
  return <ThreadListSidebar onClick={event => {
    if (event.target instanceof Element && event.target.closest('[data-slot="aui_thread-list-item-trigger"], [data-slot="aui_thread-list-new"]')) sidebar.setOpenMobile(false)
  }} />
}
function ComposerBackendOptions() {
  const backend = useBackend()
  const saved = useSavedModels()
  const models = [...new Map([{ id: backend.model, name: backend.model }, ...(saved.data ?? []).map(model => ({ id: model.modelId, name: model.name }))].map(model => [model.id, model])).values()]
  return <ModelSelector models={models} value={backend.model} onValueChange={backend.setModel} variant="ghost" size="sm" className="max-w-40 sm:max-w-56" searchable />
}
function RuntimeSync() {
  const backend = useBackend()
  const aui = useAui()
  const sidebar = useSidebar()
  const [params, setParams] = useSearchParams()
  const file = params.get('file')
  useEffect(() => { sidebar.setOpenMobile(false) }, [backend.id, sidebar.setOpenMobile])
  useEffect(() => {
    if (!file) return
    const abort = new AbortController()
    void getLibraryFile(file, abort.signal).then(value => libraryAttachment(value, abort.signal)).then(attachment => {
      if (abort.signal.aborted) return
      void aui.composer().addAttachment(attachment)
      setParams(current => { const next = new URLSearchParams(current); next.delete('file'); return next }, { replace: true })
    }).catch(error => { if (!abort.signal.aborted) backend.setError(error instanceof Error ? error.message : '无法读取 Markdown 文件') })
    return () => abort.abort()
  }, [file, aui, setParams, backend.setError])
  return null
}
function ArchiveDialogBody({ children }: { children: ReactNode }) {
  return <DialogContent><DialogHeader><DialogTitle>Archived chats</DialogTitle><DialogDescription>打开或恢复已归档的对话。</DialogDescription></DialogHeader>{children}</DialogContent>
}
function ArchivedChats() {
  const backend = useBackend()
  const rows = backend.threads.filter(job => job.archived)
  return <Dialog><DialogTrigger asChild><TooltipIconButton tooltip="Archived chats"><Archive /></TooltipIconButton></DialogTrigger>
    <ArchiveDialogBody>{rows.length ? rows.map(job => <div key={job.id} className="flex min-w-0 items-center gap-2">
      <Button variant="ghost" className="min-w-0 flex-1 justify-start truncate" onClick={() => backend.open(job.id)}>{job.title}</Button>
      <Button variant="outline" size="sm" onClick={() => { void updateGeminiThread(job.id, { archived: false }).then(() => backend.catalog.reload()).catch(error => backend.setError(error.message)) }}>Restore</Button>
    </div>) : <p className="text-sm text-muted-foreground">No archived chats</p>}</ArchiveDialogBody>
  </Dialog>
}
function ResponseDetails() {
  const { message, job } = useBackend()
  if (!message || !job) return null
  const response = { usage: message.usage, finishReason: message.finishReason, error: message.error,
    reasoning: message.response?.parts.some(part => part.type === 'reasoning' && part.text) ? 'Public summary returned' : 'The API did not return a public reasoning summary',
    response: message.response ?? null }
  return <Dialog><DialogTrigger asChild><TooltipIconButton tooltip="Response details"><FileJson /></TooltipIconButton></DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Response details</DialogTitle><DialogDescription>模型返回的用量、工具、引用和响应元数据。</DialogDescription></DialogHeader>
      <pre className="min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs leading-6">{JSON.stringify(response, null, 2)}</pre>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => saveBlob(new Blob([JSON.stringify({ reply: message.reply, ...response }, null, 2)], { type: 'application/json' }), safeFilename(job.title, 'Gemini response', 'json'))}><Download />Export JSON</Button></div>
    </DialogContent>
  </Dialog>
}

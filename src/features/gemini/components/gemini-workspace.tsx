import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AssistantRuntimeProvider, useAui } from '@assistant-ui/react'
import { useSearchParams } from 'react-router'
import { Menu } from '@base-ui/react/menu'
import { Download, FileJson, Home, RotateCcw, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { DemoShell, type DemoView } from '@/components/assistant-ui/home-demo/shell'
import { DemoIntegrationProvider } from '@/components/assistant-ui/home-demo/integration'
import { useFullscreenOverlay } from '@/components/assistant-ui/home-demo/fullscreen'
import { menuItemClass } from '@/components/assistant-ui/home-demo/styles'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/assistant-ui/ui/dialog'
import { Button } from '@/components/assistant-ui/ui/button'
import { useSavedModels } from '@/features/models/hooks/use-saved-models'
import { getModelCatalog } from '@/lib/api/models'
import { getLibraryFile } from '@/lib/api/library-files'
import { clearSession, useSession } from '@/lib/api/session'
import { saveBlob, safeFilename } from '@/lib/platform/download'
import { useAsyncData } from '@/hooks/use-async-data'
import { GeminiMarkIcon } from '@/components/icons/gemini-mark'
import { useGeminiBackend } from '../hooks/use-gemini-backend'
import { libraryAttachment } from '../lib/markdown-attachments'
import { GeminiResponseData } from './gemini-response-data'
import { GeminiConfigSheet } from './gemini-config-sheet'

/** The website's HomeDemo shell and renderer, with our backend in its integration slots. */
export function GeminiWorkspace() {
  const backend=useGeminiBackend(), session=useSession(), saved=useSavedModels()
  const modelCatalog=useAsyncData(getModelCatalog,[])
  const [view,setView]=useState<DemoView>('thread'),[sidebarCollapsed,setSidebarCollapsed]=useState(false)
  const [settingsOpen,setSettingsOpen]=useState(false),[responseId,setResponseId]=useState<string | null>(null)
  const {expanded,toggle,overlayRef}=useFullscreenOverlay()
  const records=[...(backend.message ? [backend.message] : []),...backend.priorMessages]
  const response=records.find(record=>record.id===responseId)
  const modelInfo=modelCatalog.data?.models.find(model=>model.id===backend.model || model.id===backend.job?.options.agent?.model)
  const models=[...new Map([{id:backend.model,name:modelInfo?.displayName || backend.model},...(saved.data ?? []).map(model=>({id:model.modelId,name:model.name}))].map(model=>[model.id,{...model,
    icon:<GeminiMarkIcon className="size-3.5" />,
    ...(modelCatalog.data?.models.find(item=>item.id===model.id)?.thinking ? {efforts:[{id:'minimal',name:'Minimal'},{id:'low',name:'Low'},{id:'medium',name:'Med'},{id:'high',name:'High'}]} : {}),
  }])).values()]
  const usage=backend.message?.usage
  const lastError=useRef('')
  useLayoutEffect(()=>{document.documentElement.dataset.chatUi='home-demo';return()=>{delete document.documentElement.dataset.chatUi}},[])
  useEffect(()=>{setResponseId(null)},[backend.id])
  useEffect(()=>{if(backend.error && backend.error!==lastError.current)toast.error(backend.error);lastError.current=backend.error},[backend.error])
  const reload=()=>{void backend.config.reload();void backend.view.reload();void backend.detail.reload();void backend.ancestors.reload();void backend.catalog.reload()}
  const shell=<DemoShell expanded={expanded} onToggleExpanded={toggle} view={view} onViewChange={setView} sidebarCollapsed={sidebarCollapsed} onSidebarCollapsedChange={setSidebarCollapsed}
    menuExtra={defer=><>
      <Menu.Item className={menuItemClass} onClick={()=>defer(()=>setSettingsOpen(true))}><Settings className="size-3.5" />Message settings</Menu.Item>
      {backend.message ? <Menu.Item className={menuItemClass} onClick={()=>defer(()=>setResponseId(backend.message!.id))}><FileJson className="size-3.5" />Response details</Menu.Item> : null}
      {(backend.view.data?.messages.length ?? 0)>1 ? <>
        <Menu.Separator className="bg-border my-1 h-px" />
        <Menu.Group><Menu.GroupLabel className="px-2 py-1 text-xs text-muted-foreground">Segments</Menu.GroupLabel>
          {backend.view.data!.messages.map(message=><Menu.Item key={message.id} className={menuItemClass} onClick={()=>backend.setSelected(message.id)}>{message.index}. {message.sourceName} · {message.part}</Menu.Item>)}
        </Menu.Group>
      </> : null}
      <Menu.Item className={menuItemClass} onClick={reload}><RotateCcw className="size-3.5" />Refresh conversation</Menu.Item>
      <Menu.Item className={menuItemClass} render={<a href="/" />}><Home className="size-3.5" />AnyWorkflow</Menu.Item>
    </>} />
  return <DemoIntegrationProvider value={{model:backend.model,setModel:backend.setModel,models,effort:backend.effort,setEffort:backend.setEffort,
    contextWindow:modelInfo?.inputTokenLimit,threadId:backend.threadRoot,
    usage:usage ? {totalTokens:usage.totalTokenCount,inputTokens:usage.promptTokenCount,outputTokens:usage.candidatesTokenCount,reasoningTokens:usage.thoughtsTokenCount,cachedInputTokens:usage.cachedContentTokenCount} : undefined,
    accountName:session?.record.name || session?.record.email || 'Account',openSettings:()=>setSettingsOpen(true),signOut:clearSession,submitFeedback:backend.feedback,showResponse:setResponseId}}>
    <AssistantRuntimeProvider runtime={backend.runtime}>
      <div className="h-dvh w-full overflow-hidden bg-background text-foreground" data-testid="gemini-workspace">
        {expanded ? createPortal(<div ref={overlayRef} role="dialog" aria-modal="true" aria-label="Thread fullscreen" tabIndex={-1} className="bg-background fixed inset-0 z-50 overflow-hidden outline-none">{shell}</div>,document.body) : shell}
      </div>
      <GeminiConfigSheet config={backend.config} open={settingsOpen} onOpenChange={setSettingsOpen} hideTrigger />
      <Dialog open={Boolean(responseId)} onOpenChange={open=>{if(!open)setResponseId(null)}}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Response details</DialogTitle><DialogDescription>模型返回的用量、工具、引用和响应信息。</DialogDescription></DialogHeader>
          {response ? <>
            <pre className="overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 text-xs leading-6">{JSON.stringify({usage:response.usage,finishReason:response.finishReason,error:response.error,
              reasoning:response.response?.parts.some(part=>part.type==='reasoning' && part.text) ? 'Public summary returned' : 'The API did not return a public reasoning summary',response:response.response ?? null},null,2)}</pre>
            <Button variant="outline" onClick={()=>saveBlob(new Blob([JSON.stringify({reply:response.reply,usage:response.usage,finishReason:response.finishReason,error:response.error,response:response.response},null,2)],{type:'application/json'}),safeFilename(backend.job?.title || '', 'Gemini response','json'))}><Download />Export JSON</Button>
          </> : null}
        </DialogContent>
      </Dialog>
      <GeminiResponseData />
      <RuntimeSync onError={backend.setError} />
    </AssistantRuntimeProvider>
  </DemoIntegrationProvider>
}
function RuntimeSync({onError}:{onError:(error:string)=>void}) {
  const aui=useAui(),[params,setParams]=useSearchParams(),file=params.get('file')
  useEffect(()=>{
    if(!file)return
    const abort=new AbortController()
    void getLibraryFile(file,abort.signal).then(value=>libraryAttachment(value,abort.signal)).then(async attachment=>{
      if(abort.signal.aborted)return
      await aui.composer.addAttachment(attachment)
      if(!abort.signal.aborted)setParams(current=>{const next=new URLSearchParams(current);next.delete('file');return next},{replace:true})
    }).catch(error=>{if(!abort.signal.aborted)onError(error instanceof Error ? error.message : '无法读取 Markdown 文件')})
    return()=>abort.abort()
  },[file,aui,setParams,onError])
  return null
}

import { useAssistantDataUI, type DataMessagePartComponent } from '@assistant-ui/react'
import { FileJson, Terminal } from 'lucide-react'
import { ToolTraceCard } from '@/components/assistant-ui/home-demo/shared/tool-trace'
import type { GeminiResponsePart } from '@/types/gemini'

// Keep provider results without a call ID visible, without inventing a call association.
const ResponseData: DataMessagePartComponent<GeminiResponsePart> = ({data}) => <ToolTraceCard
  icon={data.type==='artifact' ? <FileJson /> : <Terminal />}
  signature={`${data.name || data.providerType || (data.type==='artifact' ? 'Artifact' : 'Tool')} ${data.type==='tool-result' ? 'result' : ''}`.trim()}
  description={null} result={data.data ?? data.text ?? null} />
export function GeminiResponseData() {
  useAssistantDataUI({name:'gemini-response',render:ResponseData})
  return null
}

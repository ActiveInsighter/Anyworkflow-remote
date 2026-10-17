import { useId } from 'react'
import { Field, TextInput } from './ui'
import { Select } from '@/components/ui/select'
import type { BrowserModelSelection, ModelSelection, ReasoningEffort } from '@/lib/runtime-config'

const SITES = [
  { id: 'chatgpt', label: 'ChatGPT', models: ['GPT-6', 'GPT-5.6 Sol'] },
  { id: 'claude', label: 'Claude', models: ['Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5', 'Fable 5.1'] },
] as const
const EFFORTS: readonly { value: ReasoningEffort; label: string }[] = [
  { value: 'none', label: '无' }, { value: 'minimal', label: '最低' },
  { value: 'low', label: '低' }, { value: 'medium', label: '中等' },
  { value: 'high', label: '高' }, { value: 'xhigh', label: '超高' },
  { value: 'max', label: '最高' }, { value: 'standard', label: '标准' },
  { value: 'extended', label: '扩展' }, { value: 'heavy', label: '深度' },
]

export function ModelSelectionFields({ value, onChange }: {
  value: BrowserModelSelection
  onChange: (site: 'chatgpt' | 'claude', patch: Partial<ModelSelection>) => void
}) {
  const id = useId()
  return <fieldset className="grid min-w-0 gap-4 border-t border-border pt-4">
    <legend className="px-1 text-sm font-medium">模型与思考程度</legend>
    <p className="text-xs leading-5 text-muted-foreground">留空保持页面当前选择；可选项以账号实际可用模型为准。</p>
    {SITES.map(site => <fieldset key={site.id} className="grid min-w-0 gap-3">
      <legend className="mb-2 text-sm font-medium">{site.label}</legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Field label={`${site.label} 模型`}>
          <TextInput value={value[site.id].model ?? ''} maxLength={128}
            list={`${id}-${site.id}-models`} placeholder="保持当前模型"
            onChange={event => onChange(site.id, { model: event.target.value || null })} />
        </Field>
        <datalist id={`${id}-${site.id}-models`}>
          {site.models.map(model => <option key={model} value={model} />)}
        </datalist>
        <Field label={`${site.label} 思考程度`}>
          <Select value={value[site.id].reasoningEffort ?? ''} containerClassName="w-full"
            onChange={event => onChange(site.id, { reasoningEffort: (event.target.value || null) as ReasoningEffort | null })}>
            <option value="">保持当前思考程度</option>
            {EFFORTS.map(effort => <option key={effort.value} value={effort.value}>{effort.label}</option>)}
          </Select>
        </Field>
      </div>
    </fieldset>)}
  </fieldset>
}

import { useId } from 'react'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { ModelSelection, ModelSite, ReasoningEffort, SiteModelSelection } from '@/lib/domain/runtime-config'

const SITES: readonly { id: ModelSite; label: string; models: readonly string[] }[] = [
  { id: 'chatgpt', label: 'ChatGPT', models: ['GPT-6', 'GPT-5.6 Sol'] },
  { id: 'claude', label: 'Claude', models: ['Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5', 'Fable 5.1'] },
]
const EFFORTS: readonly { value: ReasoningEffort; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'minimal', label: '最低' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中等' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '超高' },
  { value: 'max', label: '最高' },
  { value: 'standard', label: '标准' },
  { value: 'extended', label: '扩展' },
  { value: 'heavy', label: '深度' },
]

/** Per-site model and reasoning effort. Empty keeps whatever the site currently has selected. */
export function ModelSelectionFields({
  value,
  onChange,
}: {
  value: ModelSelection
  onChange: (site: ModelSite, patch: Partial<SiteModelSelection>) => void
}) {
  const id = useId()
  return (
    <FieldSet className="gap-4">
      <div>
        <FieldLegend variant="label" className="mb-1">模型与思考程度</FieldLegend>
        <FieldDescription>留空保持页面当前选择；可选项以账号实际可用模型为准。</FieldDescription>
      </div>
      {SITES.map((site) => (
        <FieldGroup key={site.id} className="gap-3">
          <p className="text-sm font-medium">{site.label}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-${site.id}-model`}>{site.label} 模型</FieldLabel>
              <Input
                id={`${id}-${site.id}-model`}
                list={`${id}-${site.id}-models`}
                maxLength={128}
                placeholder="保持当前模型"
                value={value[site.id].model ?? ''}
                onChange={(event) => onChange(site.id, { model: event.target.value || null })}
              />
              <datalist id={`${id}-${site.id}-models`}>
                {site.models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-${site.id}-effort`}>{site.label} 思考程度</FieldLabel>
              <NativeSelect
                id={`${id}-${site.id}-effort`}
                value={value[site.id].reasoningEffort ?? ''}
                onChange={(event) =>
                  onChange(site.id, { reasoningEffort: (event.target.value || null) as ReasoningEffort | null })
                }
              >
                <NativeSelectOption value="">保持当前思考程度</NativeSelectOption>
                {EFFORTS.map((effort) => (
                  <NativeSelectOption key={effort.value} value={effort.value}>
                    {effort.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </FieldGroup>
      ))}
    </FieldSet>
  )
}

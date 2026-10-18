import { useId } from 'react'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { ModelSelection, ModelSurface, ReasoningEffort, SiteModelSelection } from '@/lib/domain/runtime-config'
import { EFFORT_LABELS, MODEL_CATALOG, findCatalogModel } from '../lib/model-catalog'

/** Pages with the same picker share one group; the links they are reached from are listed in `pages`. */
const SITES: readonly { id: ModelSurface; label: string; pages: string }[] = [
  { id: 'chatgpt', label: 'ChatGPT', pages: '主界面、图片界面' },
  { id: 'chatgptCloud', label: 'ChatGPT Cloud', pages: 'Cloud 界面' },
  { id: 'claude', label: 'Claude', pages: '主界面、Code 界面' },
]

/** Per-site model and reasoning effort. Only combinations the site's own picker offers can be chosen. */
export function ModelSelectionFields({
  value,
  onChange,
  surface,
}: {
  surface?: ModelSurface
  value: Required<ModelSelection>
  onChange: (site: ModelSurface, patch: Partial<SiteModelSelection>) => void
}) {
  const id = useId()
  return (
    <FieldSet className="gap-4">
      <div>
        <FieldLegend variant="label" className="mb-1">
          模型与思考程度
        </FieldLegend>
        <FieldDescription>留空保持页面当前选择；只列出该站点实际可选的项。</FieldDescription>
      </div>
      {SITES.filter((site) => !surface || site.id === surface).map((site) => {
        const current = value[site.id]
        const unsupported = MODEL_CATALOG[site.id].length === 0 && current.model === null
        const known = findCatalogModel(site.id, current.model)
        // A value saved earlier that the picker no longer lists stays visible instead of vanishing.
        const orphanModel = current.model && !known ? current.model : null
        const efforts: readonly ReasoningEffort[] = known
          ? known.efforts
          : current.reasoningEffort
            ? [current.reasoningEffort]
            : []
        // Likewise an effort the chosen model does not offer is shown flagged so it can be cleared.
        const orphanEffort =
          current.reasoningEffort && !efforts.includes(current.reasoningEffort) ? current.reasoningEffort : null
        const effortLocked = known ? known.efforts.length === 0 : current.model === null || orphanModel !== null
        return (
          <FieldGroup key={site.id} className="gap-3">
            {!surface ? (
              <div>
                <p className="text-sm font-medium">{site.label}</p>
                <p className="text-xs text-muted-foreground">适用页面：{site.pages}</p>
              </div>
            ) : null}
            {unsupported ? (
              <FieldDescription>该页面的模型选项尚未适配，暂时保持页面当前选择。</FieldDescription>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${id}-${site.id}-model`}>{site.label} 模型</FieldLabel>
                  <NativeSelect
                    id={`${id}-${site.id}-model`}
                    value={known?.name ?? orphanModel ?? ''}
                    onChange={(event) => {
                      const next = findCatalogModel(site.id, event.target.value) ?? null
                      const keep = next && current.reasoningEffort && next.efforts.includes(current.reasoningEffort)
                      onChange(site.id, {
                        model: event.target.value || null,
                        reasoningEffort: keep ? current.reasoningEffort : null,
                      })
                    }}
                  >
                    <NativeSelectOption value="">保持当前模型</NativeSelectOption>
                    {MODEL_CATALOG[site.id].map((model) => (
                      <NativeSelectOption key={model.name} value={model.name}>
                        {model.name}
                      </NativeSelectOption>
                    ))}
                    {orphanModel ? (
                      <NativeSelectOption value={orphanModel}>{orphanModel}（已不在列表中）</NativeSelectOption>
                    ) : null}
                  </NativeSelect>
                </Field>
                <Field data-disabled={effortLocked || undefined}>
                  <FieldLabel htmlFor={`${id}-${site.id}-effort`}>{site.label} 思考程度</FieldLabel>
                  <NativeSelect
                    id={`${id}-${site.id}-effort`}
                    disabled={effortLocked && !current.reasoningEffort}
                    value={current.reasoningEffort ?? ''}
                    onChange={(event) =>
                      onChange(site.id, { reasoningEffort: (event.target.value || null) as ReasoningEffort | null })
                    }
                  >
                    <NativeSelectOption value="">
                      {known && known.efforts.length === 0
                        ? '该模型无思考程度选项'
                        : current.model === null
                          ? '先选择模型'
                          : '保持当前思考程度'}
                    </NativeSelectOption>
                    {efforts.map((effort) => (
                      <NativeSelectOption key={effort} value={effort}>
                        {EFFORT_LABELS[effort]}
                      </NativeSelectOption>
                    ))}
                    {orphanEffort ? (
                      <NativeSelectOption value={orphanEffort}>
                        {EFFORT_LABELS[orphanEffort]}（该模型不支持）
                      </NativeSelectOption>
                    ) : null}
                  </NativeSelect>
                </Field>
              </div>
            )}
          </FieldGroup>
        )
      })}
    </FieldSet>
  )
}

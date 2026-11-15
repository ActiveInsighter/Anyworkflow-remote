import { useState } from 'react'
import { Save, SlidersHorizontal } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalPane,
  ModalSplit,
  ModalTitle,
  ModalTrigger,
} from '@/components/ui/modal'
import { SelectField, SelectOption } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { SavedModelSelect } from '@/features/models/components/saved-model-select'
import { useAsyncAction } from '@/hooks/use-async-action'
import type { AsyncState } from '@/hooks/use-async-data'
import { saveGeminiConfig } from '@/lib/api/gemini'
import type { GeminiConfig, GeminiConfigRecord } from '@/types/gemini'

export function GeminiConfigSheet({ config }: { config: AsyncState<GeminiConfigRecord> }) {
  const [open, setOpen] = useState(false)
  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="touch"
            aria-label="消息配置"
            disabled={!config.data}
          />
        }
      >
        <SlidersHorizontal />
        <span className="hidden sm:inline">消息配置</span>
      </ModalTrigger>
      <ModalContent size="lg" height="fixed">
        <ModalHeader>
          <ModalTitle>消息配置</ModalTitle>
        </ModalHeader>
        {open && config.data ? (
          <ConfigEditor
            key={config.data.revision}
            record={config.data}
            onSaved={(record) => {
              config.setData(record)
              setOpen(false)
            }}
            onReload={() => void config.reload()}
          />
        ) : null}
      </ModalContent>
    </Modal>
  )
}

function ConfigEditor({
  record,
  onSaved,
  onReload,
}: {
  record: GeminiConfigRecord
  onSaved: (record: GeminiConfigRecord) => void
  onReload: () => void
}) {
  const [draft, setDraft] = useState(record.config)
  const action = useAsyncAction()
  function change<K extends keyof GeminiConfig>(key: K, value: GeminiConfig[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    action.clearError()
  }
  return (
    <>
      <ModalSplit columns="minmax(0,1.1fr) minmax(0,1fr)">
        <ModalPane>
          <form
            id="gemini-config-form"
            onSubmit={(event) => {
              event.preventDefault()
              void action.run('save', async () => onSaved(await saveGeminiConfig(draft, record.revision)), {
                failure: false,
                success: '消息配置已保存',
              })
            }}
          >
            <fieldset disabled={action.busy} className="min-w-0">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="gemini-default-model">默认模型</FieldLabel>
                  <SavedModelSelect
                    id="gemini-default-model"
                    value={draft.model}
                    onChange={(value) => change('model', value)}
                    disabled={action.busy}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="gemini-system">系统提示词</FieldLabel>
                  <Textarea
                    id="gemini-system"
                    value={draft.systemPrompt}
                    maxLength={12000}
                    rows={12}
                    className="min-h-52"
                    onChange={(event) => change('systemPrompt', event.target.value)}
                    placeholder="每次发送都会使用的角色与要求"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="gemini-delimiter">分隔符</FieldLabel>
                  <Input
                    id="gemini-delimiter"
                    value={draft.delimiter}
                    maxLength={120}
                    required
                    onChange={(event) => change('delimiter', event.target.value)}
                  />
                  <FieldDescription>分隔符独占一行。代码块中的分隔符不会拆分。</FieldDescription>
                </Field>
              </FieldGroup>
            </fieldset>
          </form>
        </ModalPane>
        <ModalPane tone="muted">
          <fieldset disabled={action.busy} className="min-w-0">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="gemini-thinking">思考程度</FieldLabel>
                <SelectField
                  id="gemini-thinking"
                  value={draft.thinkingLevel}
                  onValueChange={(value) => change('thinkingLevel', value)}
                >
                  <SelectOption value="">模型默认</SelectOption>
                  {['minimal', 'low', 'medium', 'high'].map((value) => (
                    <SelectOption key={value} value={value}>
                      {value}
                    </SelectOption>
                  ))}
                </SelectField>
              </Field>
              <div className="grid min-w-0 grid-cols-2 gap-4">
                {(
                  [
                    ['concurrency', '并发数', 1, 16],
                    ['maxOutputTokens', '输出 Token 上限', 256, 65536],
                    ['rpmPerKey', '每个密钥 RPM', 1, 60],
                    ['rpdPerKey', '每个密钥 RPD', 1, 10000],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <Field key={key}>
                    <FieldLabel htmlFor={`gemini-${key}`}>{label}</FieldLabel>
                    <Input
                      form="gemini-config-form"
                      id={`gemini-${key}`}
                      type="number"
                      required
                      min={min}
                      max={max}
                      step={1}
                      value={Number.isFinite(draft[key]) ? draft[key] : ''}
                      onChange={(event) => change(key, event.target.valueAsNumber)}
                    />
                    <FieldDescription>
                      {min}–{max.toLocaleString()}
                    </FieldDescription>
                  </Field>
                ))}
              </div>
            </FieldGroup>
          </fieldset>
        </ModalPane>
      </ModalSplit>
      <ModalFooter>
        <div className="me-auto min-w-0 flex-1">
          <ErrorAlert inline>{action.error}</ErrorAlert>
          {action.error ? (
            <Button type="button" variant="link" size="sm" onClick={onReload}>
              重新加载配置
            </Button>
          ) : (
            <p className="text-caption text-muted-foreground">保存后用于新消息</p>
          )}
        </div>
        <Button form="gemini-config-form" type="submit" disabled={action.busy}>
          {action.busy ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}保存配置
        </Button>
      </ModalFooter>
    </>
  )
}

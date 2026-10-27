import { RotateCcw, Save, SlidersHorizontal } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalPane,
  ModalSplit,
  ModalTag,
  ModalTags,
  ModalTitle,
  ModalTrigger,
} from '@/components/ui/modal'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_PDF_SYSTEM_PROMPT, MAX_SYSTEM_PROMPT_CHARS, type PdfConversionOptions } from '@/lib/api/file-conversion'
import type { ConversionConfigState } from '../hooks/use-conversion-config'
import {
  choiceAppliesTo,
  choiceField,
  choiceValueLabel,
  MODELFLARE_DEFAULT_MODEL,
  numberField,
  optionGroups,
  type ChoiceOptionKey,
  type NumericOptionKey,
} from '../lib/conversion-options'

function configStatus(config: ConversionConfigState): string {
  if (config.loading) return '正在加载…'
  if (config.loadError) return '加载失败'
  return `当前版本 ${config.config?.revision ?? '—'} · 保存后对新任务生效`
}

/**
 * System prompt and model parameters shared by every job; saved separately from a submission.
 * A floating sheet with the prompt beside the parameters on wide screens, one column on phones.
 */
export function ConversionConfigSheet({ config }: { config: ConversionConfigState }) {
  const { options } = config
  const disabled = config.loading || config.saving

  return (
    <Modal>
      <ModalTrigger render={<Button variant="outline" size="touch" />}>
        <SlidersHorizontal data-icon="inline-start" />
        转换配置
      </ModalTrigger>
      <ModalContent size="xl" height="fixed">
        <ModalHeader>
          <ModalTitle>转换配置</ModalTitle>
          <ModalTags>
            <ModalTag role="status">{configStatus(config)}</ModalTag>
          </ModalTags>
        </ModalHeader>
        <ModalSplit columns="minmax(0,1.15fr) minmax(0,1fr)">
          <ModalPane>
            <ErrorAlert inline className="mb-4">{config.loadError}</ErrorAlert>
            <fieldset disabled={disabled} className="min-w-0">
              <Field>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="pdf-system-prompt">系统提示词</FieldLabel>
                  <Button type="button" variant="ghost" size="touch" disabled={disabled} onClick={() => config.setSystemPrompt(DEFAULT_PDF_SYSTEM_PROMPT)}>
                    <RotateCcw data-icon="inline-start" />
                    恢复默认
                  </Button>
                </div>
                <Textarea
                  id="pdf-system-prompt"
                  name="systemPrompt"
                  maxLength={MAX_SYSTEM_PROMPT_CHARS}
                  rows={16}
                  className="min-h-64 resize-y font-mono text-xs leading-relaxed md:text-xs"
                  value={config.systemPrompt}
                  onChange={(event) => config.setSystemPrompt(event.target.value)}
                  aria-describedby="pdf-system-prompt-help"
                />
                <FieldDescription id="pdf-system-prompt-help" className="flex min-w-0 justify-between gap-3">
                  <span className="min-w-0 flex-1">转录与校对要求均在此编辑；留空恢复默认</span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums">
                    {config.systemPrompt.length} / {MAX_SYSTEM_PROMPT_CHARS}
                  </span>
                </FieldDescription>
              </Field>
            </fieldset>
          </ModalPane>
          <ModalPane tone="muted">
            <fieldset disabled={disabled} className="min-w-0">
              <FieldGroup className="gap-7">
                <FieldSet className="min-w-0 gap-0">
                  <FieldLegend variant="label" className="float-left mb-4 w-full text-sm">模型接口</FieldLegend>
                  <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
                    <Field>
                      <FieldLabel htmlFor="pdf-provider">接口</FieldLabel>
                      <NativeSelect
                        id="pdf-provider"
                        name="provider"
                        value={options.provider}
                        onChange={(event) => config.setProvider(event.target.value as PdfConversionOptions['provider'])}
                      >
                        <NativeSelectOption value="gemini">Gemini</NativeSelectOption>
                        <NativeSelectOption value="modelflare">ModelFlare</NativeSelectOption>
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="pdf-model">
                        {options.provider === 'gemini' ? 'Gemini 模型' : 'ModelFlare 视觉模型 ID'}
                      </FieldLabel>
                      <Input
                        id="pdf-model"
                        name="model"
                        list={options.provider === 'modelflare' ? 'pdf-modelflare-models' : undefined}
                        required
                        maxLength={107}
                        className="font-mono"
                        value={options.model}
                        onChange={(event) => config.setOption('model', event.target.value)}
                      />
                      {options.provider === 'modelflare' ? (
                        <datalist id="pdf-modelflare-models">
                          <option value={MODELFLARE_DEFAULT_MODEL} />
                        </datalist>
                      ) : null}
                    </Field>
                  </div>
                </FieldSet>

                {optionGroups.map((group) => (
                  <FieldSet key={group.title} className="min-w-0 gap-0 border-t pt-6">
                    <FieldLegend variant="label" className="float-left mb-4 w-full text-sm">{group.title}</FieldLegend>
                    <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-4">
                      {group.choices
                        .filter((key) => choiceAppliesTo(key, options.provider))
                        .map((key) => <ChoiceOption key={key} config={config} name={key} />)}
                      {group.numbers.map((key) => <NumberOption key={key} config={config} name={key} />)}
                    </div>
                  </FieldSet>
                ))}
              </FieldGroup>
            </fieldset>
          </ModalPane>
        </ModalSplit>
        <ModalFooter className="border-t">
          <ErrorAlert inline className="me-auto min-w-0 flex-1">{config.error}</ErrorAlert>
          <Button type="button" size="touch" onClick={() => void config.save()} disabled={disabled}>
            {config.saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            {config.saving ? '保存中…' : '保存配置'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

function NumberOption({ config, name }: { config: ConversionConfigState; name: NumericOptionKey }) {
  const [, label, minimum, maximum] = numberField(name)
  return (
    <Field>
      <FieldLabel htmlFor={`pdf-${name}`}>{label}</FieldLabel>
      <Input
        id={`pdf-${name}`}
        name={name}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        required
        className="tabular-nums"
        value={config.numberText[name]}
        onChange={(event) => config.setNumberText(name, event.target.value)}
        onBlur={(event) => config.commitNumber(name, event.currentTarget.value)}
        aria-invalid={config.isInvalid(name)}
        aria-describedby={`pdf-${name}-help`}
      />
      <FieldDescription id={`pdf-${name}-help`} className="tabular-nums">
        {name === 'max_output_tokens' ? '0 为自动' : `${minimum}–${maximum}`}
      </FieldDescription>
    </Field>
  )
}

function ChoiceOption({ config, name }: { config: ConversionConfigState; name: ChoiceOptionKey }) {
  const [, label, values] = choiceField(name)
  return (
    <Field>
      <FieldLabel htmlFor={`pdf-${name}`}>{label}</FieldLabel>
      <NativeSelect
        id={`pdf-${name}`}
        name={name}
        value={config.options[name]}
        onChange={(event) => config.setOption(name, event.target.value as PdfConversionOptions[typeof name])}
      >
        {values.map((value) => (
          <NativeSelectOption key={value} value={value}>
            {choiceValueLabel(value)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}

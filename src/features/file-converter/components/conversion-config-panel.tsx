import { ChevronDown, Save } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { MAX_SYSTEM_PROMPT_CHARS, type PdfConversionOptions } from '@/lib/api/file-conversion'
import type { ConversionConfigState } from '../hooks/use-conversion-config'
import { choiceAppliesTo, choiceFields, MODELFLARE_DEFAULT_MODEL, numberFields } from '../lib/conversion-options'

function configStatus(config: ConversionConfigState): string {
  if (config.loading) return '正在加载转换配置…'
  if (config.loadError) return '配置加载失败'
  return `配置已加载 · 版本 ${config.config?.revision ?? '—'}`
}

/** System prompt and model parameters shared by every job; saved separately from a submission. */
export function ConversionConfigPanel({ config }: { config: ConversionConfigState }) {
  const { options } = config
  const disabled = config.loading || config.saving

  return (
    <Card>
      <Collapsible className="group/config">
        <CardHeader>
          <CardTitle>转换配置</CardTitle>
          <CardDescription role="status">{configStatus(config)}</CardDescription>
          <CardAction>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                系统提示词与高级参数
                <ChevronDown
                  data-icon="inline-end"
                  className="transition-transform duration-fast group-data-[state=open]/config:rotate-180"
                />
              </Button>
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>
        {config.loadError ? (
          <CardContent className="pb-0 sm:pb-0">
            <ErrorAlert inline>{config.loadError}</ErrorAlert>
          </CardContent>
        ) : null}
        <CollapsibleContent>
          <CardContent>
            <fieldset disabled={disabled} className="min-w-0">
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="pdf-system-prompt">系统提示词（所有任务共用）</FieldLabel>
                  <Textarea
                    id="pdf-system-prompt"
                    name="systemPrompt"
                    maxLength={MAX_SYSTEM_PROMPT_CHARS}
                    rows={10}
                    className="max-h-96 resize-y font-mono text-xs md:text-xs"
                    value={config.systemPrompt}
                    onChange={(event) => config.setSystemPrompt(event.target.value)}
                    aria-describedby="pdf-system-prompt-help"
                  />
                  <FieldDescription id="pdf-system-prompt-help">
                    先发送系统提示词，再追加本次的转换要求；保存时留空恢复内置默认。
                    <span className="tabular-nums">
                      {' '}
                      {config.systemPrompt.length} / {MAX_SYSTEM_PROMPT_CHARS}
                    </span>
                  </FieldDescription>
                </Field>

                <div className="grid min-w-0 grid-cols-2 gap-4">
                  <Field className="col-span-2">
                    <FieldLabel htmlFor="pdf-provider">模型接口</FieldLabel>
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
                  <Field className="col-span-2">
                    <FieldLabel htmlFor="pdf-model">
                      {options.provider === 'gemini' ? 'Gemini 模型' : 'ModelFlare 视觉模型 ID'}
                    </FieldLabel>
                    <Input
                      id="pdf-model"
                      name="model"
                      list={options.provider === 'modelflare' ? 'pdf-modelflare-models' : undefined}
                      required
                      maxLength={107}
                      value={options.model}
                      onChange={(event) => config.setOption('model', event.target.value)}
                    />
                    {options.provider === 'modelflare' ? (
                      <datalist id="pdf-modelflare-models">
                        <option value={MODELFLARE_DEFAULT_MODEL} />
                      </datalist>
                    ) : null}
                  </Field>

                  {numberFields.map(([key, label, minimum, maximum]) => (
                    <Field key={key}>
                      <FieldLabel htmlFor={`pdf-${key}`}>{label}</FieldLabel>
                      <Input
                        id={`pdf-${key}`}
                        name={key}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        required
                        value={config.numberText[key]}
                        onChange={(event) => config.setNumberText(key, event.target.value)}
                        onBlur={(event) => config.commitNumber(key, event.currentTarget.value)}
                        aria-invalid={config.isInvalid(key)}
                        aria-describedby={key === 'concurrency' ? 'pdf-concurrency-help' : undefined}
                      />
                      {key === 'concurrency' ? (
                        <FieldDescription id="pdf-concurrency-help">
                          允许 {minimum}–{maximum} 个并发请求
                        </FieldDescription>
                      ) : null}
                    </Field>
                  ))}

                  {choiceFields
                    .filter(([key]) => choiceAppliesTo(key, options.provider))
                    .map(([key, label, values]) => (
                      <Field key={key}>
                        <FieldLabel htmlFor={`pdf-${key}`}>{label}</FieldLabel>
                        <NativeSelect
                          id={`pdf-${key}`}
                          name={key}
                          value={options[key]}
                          onChange={(event) =>
                            config.setOption(key, event.target.value as PdfConversionOptions[typeof key])
                          }
                        >
                          {values.map((value) => (
                            <NativeSelectOption key={value} value={value}>
                              {value || '自动'}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                    ))}
                </div>
              </FieldGroup>
            </fieldset>
            <ErrorAlert inline className="mt-4">
              {config.error}
            </ErrorAlert>
          </CardContent>
          <CardFooter>
            <Button type="button" variant="outline" onClick={() => void config.save()} disabled={disabled}>
              {config.saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              {config.saving ? '保存中…' : '保存配置'}
            </Button>
          </CardFooter>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

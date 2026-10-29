import { useId, useState } from 'react'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SettingsRow } from '@/components/navigation/settings-row'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  DEFAULT_START_URL,
  resolvePageRuntimeConfig,
  withPageRuntimeConfig,
  type RuntimeConfig,
  type RuntimePageUrl,
} from '@/lib/domain/runtime-config'
import { START_LINKS } from '@/lib/domain/start-links'
import { runtimeConfigError } from '../lib/runtime-config-error'
import { withDefaultStartUrl } from '../lib/compose-config'
import { StartUrlField } from './start-url-field'
import { ModelSelectionFields } from './model-selection-fields'

type BrowserConfig = RuntimeConfig['browser']
const toNumber = (text: string) => (text === '' ? Number.NaN : Number(text))
const toText = (value: number) => (Number.isNaN(value) ? '' : String(value))

function NumberField({
  id,
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        value={toText(value)}
        onChange={(event) => onChange(toNumber(event.target.value))}
      />
    </Field>
  )
}

function SwitchField({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <Field orientation="horizontal" className="min-h-touch sm:min-h-9">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </Field>
  )
}

/** One configuration navigator for account defaults and per-Run overrides. */
export function RuntimeConfigFields({
  value,
  onChange,
  disabled = false,
  selectedPage,
  onSelectPage,
  linkForPage,
}: {
  value: RuntimeConfig
  onChange: (config: RuntimeConfig) => void
  disabled?: boolean
  selectedPage?: string | null
  onSelectPage?: (id: string | null) => void
  linkForPage?: (id: string) => string
}) {
  const [localPage, setLocalPage] = useState<string | null>(null)
  const pageId = selectedPage === undefined ? localPage : selectedPage
  const select = onSelectPage ?? setLocalPage
  const page = START_LINKS.find((link) => link.id === pageId)
  const id = useId()
  const error = runtimeConfigError(value)
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {page ? (
        <>
          <Button type="button" variant="ghost" className="self-start -ml-2" onClick={() => select(null)}>
            <ArrowLeft aria-hidden="true" />
            返回运行配置
          </Button>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{page.label}</h2>
            <a
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              <span className="break-all">{page.url}</span>
              <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
              <span className="sr-only">（新窗口打开）</span>
            </a>
          </div>
          <PageRuntimeFields
            value={value}
            url={page.url}
            surface={page.surface}
            disabled={disabled}
            onChange={onChange}
          />
        </>
      ) : pageId ? (
        <>
          <p className="text-sm text-muted-foreground">未找到此页面配置。</p>
          <Button variant="outline" onClick={() => select(null)}>
            返回运行配置
          </Button>
        </>
      ) : (
        <>
          <FieldSet disabled={disabled}>
            <StartUrlField
              id={`${id}-start-url`}
              value={value.defaultStartUrl ?? DEFAULT_START_URL}
              onChange={(url) => onChange(withDefaultStartUrl(value, url))}
            />
          </FieldSet>
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">页面默认配置</h2>
            <div className="divide-y overflow-hidden rounded-lg border">
              {START_LINKS.map((link) => {
                const current = resolvePageRuntimeConfig(value, link.url)
                return (
                  <SettingsRow
                    key={link.id}
                    title={link.label}
                    description={link.url}
                    detail={`${current.browser.replyTimeoutMinutes || '—'} 分钟 · ${current.modelSelection.model ?? '保持当前模型'}`}
                    to={linkForPage?.(link.id)}
                    onClick={() => select(link.id)}
                    disabled={disabled && Boolean(linkForPage)}
                  />
                )
              })}
            </div>
          </div>
        </>
      )}
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  )
}

function PageRuntimeFields({
  value,
  url,
  surface,
  disabled,
  onChange,
}: {
  value: RuntimeConfig
  url: RuntimePageUrl
  surface: import('@/lib/domain/runtime-config').ModelSurface
  disabled: boolean
  onChange: (config: RuntimeConfig) => void
}) {
  const id = useId()
  const page = resolvePageRuntimeConfig(value, url)
  const browser = page.browser
  const update = (patch: Partial<BrowserConfig>) =>
    onChange(withPageRuntimeConfig(value, url, { ...page, browser: { ...browser, ...patch } }))
  const waitDisabled = !browser.randomWait.enabled
  return (
    <FieldSet disabled={disabled} className="min-w-0 gap-4">
      <FieldGroup className="gap-4">
        <ModelSelectionFields
          surface={surface}
          value={{ chatgpt: page.modelSelection, chatgptCloud: page.modelSelection, claude: page.modelSelection }}
          onChange={(_surface, patch) =>
            onChange(
              withPageRuntimeConfig(value, url, { ...page, modelSelection: { ...page.modelSelection, ...patch } }),
            )
          }
        />
        <FieldSeparator />
        <NumberField
          id={`${id}-timeout`}
          label="回复超时（分钟）"
          min={1}
          max={1440}
          value={browser.replyTimeoutMinutes}
          onChange={(replyTimeoutMinutes) => update({ replyTimeoutMinutes })}
        />
        <FieldSeparator />
        <SwitchField
          id={`${id}-async-collection`}
          label="异步回收"
          description="发送后保持等待回复，由扩展后台独立回收。每个 Act 使用独立会话和一条消息。"
          checked={browser.deferredReply.enabled}
          onCheckedChange={(enabled) => update({ deferredReply: { ...browser.deferredReply, enabled } })}
        />
        <NumberField
          id={`${id}-collection-delay`}
          label="自动回收延迟（分钟）"
          min={0}
          max={1440}
          disabled={!browser.deferredReply.enabled}
          value={browser.deferredReply.delayMinutes}
          onChange={(delayMinutes) => update({ deferredReply: { ...browser.deferredReply, delayMinutes } })}
        />
        <FieldSeparator />
        <SwitchField
          id={`${id}-random`}
          label="随机等待"
          checked={browser.randomWait.enabled}
          onCheckedChange={(enabled) => update({ randomWait: { ...browser.randomWait, enabled } })}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            id={`${id}-min`}
            label="最短等待（秒）"
            min={0}
            max={86400}
            disabled={waitDisabled}
            value={browser.randomWait.minSeconds}
            onChange={(minSeconds) => update({ randomWait: { ...browser.randomWait, minSeconds } })}
          />
          <NumberField
            id={`${id}-max`}
            label="最长等待（秒）"
            min={0}
            max={86400}
            disabled={waitDisabled}
            value={browser.randomWait.maxSeconds}
            onChange={(maxSeconds) => update({ randomWait: { ...browser.randomWait, maxSeconds } })}
          />
        </div>
      </FieldGroup>
    </FieldSet>
  )
}

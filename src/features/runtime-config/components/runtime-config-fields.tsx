import { useId } from 'react'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { defaultModelSelection, type ModelSite, type RuntimeConfig, type SiteModelSelection } from '@/lib/domain/runtime-config'
import { runtimeConfigError } from '../lib/runtime-config-error'
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

/** Browser executor settings for a Run or for the account defaults. */
export function RuntimeConfigFields({
  value,
  onChange,
  disabled = false,
}: {
  value: RuntimeConfig
  onChange: (config: RuntimeConfig) => void
  disabled?: boolean
}) {
  const id = useId()
  const browser = value.browser
  const update = (patch: Partial<BrowserConfig>) => onChange({ ...value, browser: { ...browser, ...patch } })
  const randomWait = (patch: Partial<BrowserConfig['randomWait']>) => update({ randomWait: { ...browser.randomWait, ...patch } })
  const deferred = (patch: Partial<BrowserConfig['deferredReply']>) =>
    update({ deferredReply: { ...browser.deferredReply, ...patch } })
  /** Any override makes the config v2; clearing them all returns to v1 so its checksum bytes stay stable. */
  const selectModel = (site: ModelSite, patch: Partial<SiteModelSelection>) => {
    const current = value.modelSelection ?? defaultModelSelection()
    const next = { ...current, [site]: { ...current[site], ...patch } }
    const configured = Object.values(next).some((item) => item.model !== null || item.reasoningEffort !== null)
    onChange(configured ? { schemaVersion: 2, browser, modelSelection: next } : { schemaVersion: 1, browser })
  }
  const waitDisabled = !browser.randomWait.enabled || browser.deferredReply.enabled
  const error = runtimeConfigError(value)

  return (
    <FieldSet disabled={disabled} className="min-w-0 gap-4">
      <FieldGroup className="gap-4">
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
          id={`${id}-random`}
          label="随机等待"
          checked={browser.randomWait.enabled}
          onCheckedChange={(enabled) => randomWait({ enabled })}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            id={`${id}-min`}
            label="最短等待（秒）"
            min={0}
            max={86400}
            disabled={waitDisabled}
            value={browser.randomWait.minSeconds}
            onChange={(minSeconds) => randomWait({ minSeconds })}
          />
          <NumberField
            id={`${id}-max`}
            label="最长等待（秒）"
            min={0}
            max={86400}
            disabled={waitDisabled}
            value={browser.randomWait.maxSeconds}
            onChange={(maxSeconds) => randomWait({ maxSeconds })}
          />
        </div>
        <FieldSeparator />
        <SwitchField
          id={`${id}-deferred`}
          label="并发投递后回收"
          description={browser.deferredReply.enabled ? '并发投递期间不使用随机等待。' : undefined}
          checked={browser.deferredReply.enabled}
          onCheckedChange={(enabled) => deferred({ enabled })}
        />
        <NumberField
          id={`${id}-delay`}
          label="回收延迟（分钟）"
          min={0}
          max={1440}
          disabled={!browser.deferredReply.enabled}
          value={browser.deferredReply.delayMinutes}
          onChange={(delayMinutes) => deferred({ delayMinutes })}
        />
        <FieldSeparator />
        <ModelSelectionFields value={value.modelSelection ?? defaultModelSelection()} onChange={selectModel} />
      </FieldGroup>
      {error ? <FieldError>{error}</FieldError> : null}
    </FieldSet>
  )
}

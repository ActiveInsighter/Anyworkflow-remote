import { useId } from 'react'
import { Field, TextInput } from './ui'
import { normalizeRuntimeConfig, type RuntimeConfig } from '@/lib/runtime-config'

export function runtimeConfigError(config: RuntimeConfig): string {
  try { normalizeRuntimeConfig(config); return '' }
  catch { return '超时需为 1–1440 分钟；等待需为 0–86400 秒且上限不小于下限；回收延迟需为 0–1440 分钟。' }
}

export function RuntimeConfigFields({ value, onChange, disabled = false }: {
  value: RuntimeConfig; onChange: (config: RuntimeConfig) => void; disabled?: boolean
}) {
  const id = useId()
  const browser = value.browser
  const update = (patch: Partial<RuntimeConfig['browser']>) => onChange({ ...value, browser: { ...browser, ...patch } })
  const number = (text: string) => text === '' ? Number.NaN : Number(text)
  const display = (number: number) => Number.isNaN(number) ? '' : String(number)
  const error = runtimeConfigError(value)
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-4">
      <Field label="回复超时（分钟）">
        <TextInput type="number" name={`${id}-timeout`} min={1} max={1440} step={1} value={display(browser.replyTimeoutMinutes)}
          onChange={event => update({ replyTimeoutMinutes: number(event.target.value) })} />
      </Field>
      <div className="grid gap-3 border-t border-border pt-4">
        <label className="flex min-h-11 items-center gap-3 text-sm" htmlFor={`${id}-random`}>
          <input id={`${id}-random`} type="checkbox" className="size-4 accent-primary" checked={browser.randomWait.enabled}
            onChange={event => update({ randomWait: { ...browser.randomWait, enabled: event.target.checked } })} />
          随机等待
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="最短等待（秒）">
            <TextInput type="number" name={`${id}-min`} min={0} max={86400} step={1} value={display(browser.randomWait.minSeconds)}
              disabled={!browser.randomWait.enabled || browser.deferredReply.enabled}
              onChange={event => update({ randomWait: { ...browser.randomWait, minSeconds: number(event.target.value) } })} />
          </Field>
          <Field label="最长等待（秒）">
            <TextInput type="number" name={`${id}-max`} min={0} max={86400} step={1} value={display(browser.randomWait.maxSeconds)}
              disabled={!browser.randomWait.enabled || browser.deferredReply.enabled}
              onChange={event => update({ randomWait: { ...browser.randomWait, maxSeconds: number(event.target.value) } })} />
          </Field>
        </div>
      </div>
      <div className="grid gap-3 border-t border-border pt-4">
        <label className="flex min-h-11 items-center gap-3 text-sm" htmlFor={`${id}-deferred`}>
          <input id={`${id}-deferred`} type="checkbox" className="size-4 accent-primary" checked={browser.deferredReply.enabled}
            onChange={event => update({ deferredReply: { ...browser.deferredReply, enabled: event.target.checked } })} />
          并发投递后回收
        </label>
        <Field label="回收延迟（分钟）">
          <TextInput type="number" name={`${id}-delay`} min={0} max={1440} step={1} value={display(browser.deferredReply.delayMinutes)}
            disabled={!browser.deferredReply.enabled}
            onChange={event => update({ deferredReply: { ...browser.deferredReply, delayMinutes: number(event.target.value) } })} />
        </Field>
        {browser.deferredReply.enabled ? <p className="text-xs text-muted-foreground">并发投递期间不使用随机等待。</p> : null}
      </div>
      {error ? <p role="alert" className="text-xs leading-5 text-destructive">{error}</p> : null}
    </fieldset>
  )
}

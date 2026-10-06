import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErrorBanner, LoadingState, Panel, PanelHeader } from './ui'
import { RuntimeConfigFields, runtimeConfigError } from './runtime-config-fields'
import { getRuntimeDefaults, saveRuntimeDefaults, type RuntimeDefaults } from '@/lib/runtime-defaults'
import { type RuntimeConfig } from '@/lib/runtime-config'
import { toErrorMessage } from '@/lib/api'

export function RuntimeDefaultsPanel() {
  const [saved, setSaved] = useState<RuntimeDefaults | null>(null)
  const [config, setConfig] = useState<RuntimeConfig | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    void getRuntimeDefaults(controller.signal).then(value => {
      if (controller.signal.aborted) return
      setSaved(value); setConfig(value.config)
    }).catch(cause => { if (!controller.signal.aborted) setError(toErrorMessage(cause)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])
  async function save() {
    if (!saved || !config || saving || runtimeConfigError(config)) return
    setSaving(true); setError('')
    try {
      const next = await saveRuntimeDefaults(config, saved.revision)
      setSaved(next); setConfig(next.config); toast.success('默认运行配置已保存')
    } catch (cause) { setError(toErrorMessage(cause)) }
    finally { setSaving(false) }
  }
  return (
    <Panel>
      <PanelHeader title="默认运行配置" description="用于新建 Run；已有 Run 保留各自的配置。" />
      <div className="grid gap-4 p-4 sm:p-5">
        {error ? <ErrorBanner>{error}</ErrorBanner> : null}
        {loading ? <LoadingState /> : config ? <RuntimeConfigFields value={config} onChange={setConfig} disabled={saving} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={loading || saving || !config || Boolean(config && runtimeConfigError(config)) || JSON.stringify(config) === JSON.stringify(saved?.config)}
            onClick={() => void save()}>{saving ? '保存中…' : '保存默认配置'}</Button>
          <Button variant="outline" disabled={saving || loading} onClick={() => setReload(value => value + 1)}>重新加载</Button>
        </div>
      </div>
    </Panel>
  )
}

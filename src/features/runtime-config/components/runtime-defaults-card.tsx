import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toErrorMessage } from '@/lib/api'
import { getRuntimeDefaults, saveRuntimeDefaults, type RuntimeDefaults } from '@/lib/api/runtime-defaults'
import type { RuntimeConfig } from '@/lib/domain/runtime-config'
import { runtimeConfigError } from '../lib/runtime-config-error'
import { RuntimeConfigFields } from './runtime-config-fields'

/** Account-wide runtime defaults, saved with optimistic concurrency on `revision`. */
export function RuntimeDefaultsCard() {
  const [saved, setSaved] = useState<RuntimeDefaults | null>(null)
  const [config, setConfig] = useState<RuntimeConfig | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    getRuntimeDefaults(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return
        setSaved(value)
        setConfig(value.config)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(toErrorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reloadCount])

  async function save() {
    if (!saved || !config || saving || runtimeConfigError(config)) return
    setSaving(true)
    setError('')
    try {
      const next = await saveRuntimeDefaults(config, saved.revision)
      setSaved(next)
      setConfig(next.config)
      toast.success('默认运行配置已保存')
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  const unchanged = JSON.stringify(config) === JSON.stringify(saved?.config)
  const invalid = Boolean(config && runtimeConfigError(config))

  return (
    <Card>
      <CardHeader>
        <CardTitle>默认运行配置</CardTitle>
        <CardDescription>用于新建 Run；已有 Run 保留各自的配置。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorAlert inline>{error}</ErrorAlert>
        {loading ? <LoadingState /> : config ? <RuntimeConfigFields value={config} onChange={setConfig} disabled={saving} /> : null}
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <Button disabled={loading || saving || !config || invalid || unchanged} onClick={() => void save()}>
          {saving ? '保存中…' : '保存默认配置'}
        </Button>
        <Button variant="outline" disabled={saving || loading} onClick={() => setReloadCount((value) => value + 1)}>
          重新加载
        </Button>
      </CardFooter>
    </Card>
  )
}

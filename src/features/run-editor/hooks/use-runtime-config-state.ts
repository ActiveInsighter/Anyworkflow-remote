import { useEffect, useRef, useState } from 'react'
import { toErrorMessage } from '@/lib/api'
import { getRuntimeDefaults } from '@/lib/api/runtime-defaults'
import type { RuntimeConfig } from '@/lib/domain/runtime-config'
import { runtimeConfigError } from '@/features/runtime-config/lib/runtime-config-error'

/**
 * The runtime config being edited for this Run. New Runs and templates-in-use start from the
 * account defaults; existing Runs start from their own frozen config.
 *
 * `generation` guards against a slow defaults request landing after the user (or a restored
 * draft) has already chosen a config.
 */
export function useRuntimeConfigState({
  loadsFromRun,
  skipDefaults,
  onDefaultsReloaded,
}: {
  /** An existing Run supplies its config; defaults load only on explicit reload. */
  loadsFromRun: boolean
  /** Template editing has no runtime config at all. */
  skipDefaults: boolean
  onDefaultsReloaded: () => void
}) {
  const [config, setConfig] = useState<RuntimeConfig | null>(null)
  const [ready, setReady] = useState(loadsFromRun || skipDefaults)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloadCount, setReloadCount] = useState(0)
  const generation = useRef(0)
  const reloadedRef = useRef(onDefaultsReloaded)
  reloadedRef.current = onDefaultsReloaded

  useEffect(() => {
    if (skipDefaults || (loadsFromRun && reloadCount === 0)) return
    const controller = new AbortController()
    const started = generation.current
    setLoading(true)
    setError('')
    getRuntimeDefaults(controller.signal)
      .then((defaults) => {
        if (controller.signal.aborted || started !== generation.current) return
        setConfig(defaults.config)
        setReady(true)
        if (reloadCount > 0) reloadedRef.current()
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(toErrorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [loadsFromRun, skipDefaults, reloadCount])

  return {
    config,
    ready,
    loading,
    error,
    invalid: Boolean(config && runtimeConfigError(config)),
    /** Adopt the config stored on a loaded Run. */
    adopt(next: RuntimeConfig | null) {
      setConfig(next)
      setReady(true)
    },
    /** Replace with a user edit or a restored draft; supersedes any in-flight defaults load. */
    replace(next: RuntimeConfig | null) {
      generation.current += 1
      setConfig(next)
      setReady(true)
    },
    reloadDefaults() {
      generation.current += 1
      setReloadCount((value) => value + 1)
    },
  }
}

export type RuntimeConfigState = ReturnType<typeof useRuntimeConfigState>

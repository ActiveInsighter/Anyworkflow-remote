import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { toErrorMessage } from '@/lib/api/errors'
import {
  DEFAULT_PDF_TO_MD_OPTIONS,
  getPdfConversionConfig,
  savePdfConversionConfig,
  type FileConversionConfig,
  type PdfConversionOptions,
} from '@/lib/api/file-conversion'
import {
  configErrorMessage,
  MODELFLARE_DEFAULT_MODEL,
  numberDrafts,
  parseNumberDraft,
  readDraftOptions,
  type NumericDraft,
  type NumericOptionKey,
} from '../lib/conversion-options'

/**
 * The owner's saved conversion config and its unsaved draft. Numeric options are edited as text
 * so a half-typed value never snaps back; they are validated on blur and again on save.
 */
export function useConversionConfig() {
  const [config, setConfig] = useState<FileConversionConfig | null>(null)
  const [options, setOptions] = useState<PdfConversionOptions>(DEFAULT_PDF_TO_MD_OPTIONS)
  const [numberText, setNumberTextState] = useState<NumericDraft>(() => numberDrafts(DEFAULT_PDF_TO_MD_OPTIONS))
  const [systemPrompt, setSystemPromptState] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')

  function applySaved(saved: FileConversionConfig) {
    setConfig(saved)
    setOptions(saved.options)
    // An emptied prompt comes back as the stored default, so the form shows what will be sent.
    setSystemPromptState(saved.systemPrompt)
    setNumberTextState(numberDrafts(saved.options))
    setLoadError('')
  }

  useEffect(() => {
    let active = true
    getPdfConversionConfig()
      .then((saved) => {
        if (active) applySaved(saved)
      })
      .catch((cause) => {
        if (active) setLoadError(configErrorMessage(cause))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  function setOption<K extends keyof PdfConversionOptions>(key: K, value: PdfConversionOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }))
  }

  /** Switching provider resets the model to that provider's default. */
  function setProvider(provider: PdfConversionOptions['provider']) {
    setOptions((current) => ({
      ...current,
      provider,
      model: provider === 'gemini' ? DEFAULT_PDF_TO_MD_OPTIONS.model : MODELFLARE_DEFAULT_MODEL,
    }))
  }

  function setNumberText(key: NumericOptionKey, value: string) {
    setNumberTextState((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function commitNumber(key: NumericOptionKey, raw: string) {
    const parsed = parseNumberDraft(key, raw)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    setOptions((current) => ({ ...current, [key]: parsed.value }))
    setNumberTextState((current) => ({ ...current, [key]: String(parsed.value) }))
    setError('')
  }

  function setSystemPrompt(value: string) {
    setSystemPromptState(value)
    setError('')
  }

  async function save() {
    if (saving) return
    setError('')
    const parsed = readDraftOptions(options, numberText)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    setSaving(true)
    try {
      const target = config || (await getPdfConversionConfig())
      const saved = await savePdfConversionConfig(target, parsed.value, systemPrompt)
      applySaved(saved)
      toast.success(`配置已保存（版本 ${saved.revision}）`)
    } catch (cause) {
      setError(toErrorMessage(cause, '配置保存失败，请重试'))
    } finally {
      setSaving(false)
    }
  }

  const isInvalid = (key: NumericOptionKey) => Boolean(error) && 'error' in parseNumberDraft(key, numberText[key])

  return {
    config,
    loading,
    saving,
    loadError,
    error,
    options,
    setOption,
    setProvider,
    numberText,
    setNumberText,
    commitNumber,
    isInvalid,
    systemPrompt,
    setSystemPrompt,
    save,
  }
}

export type ConversionConfigState = ReturnType<typeof useConversionConfig>

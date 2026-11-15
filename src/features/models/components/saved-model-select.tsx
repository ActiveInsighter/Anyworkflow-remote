import { Bot } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle, ModalTrigger } from '@/components/ui/modal'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { useSavedModels } from '../hooks/use-saved-models'
import { ModelLibrary } from './model-library'

/** Shared across every Gemini feature. Current legacy IDs remain selectable. */
export function SavedModelSelect({
  id,
  value,
  onChange,
  disabled,
  manage = true,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  manage?: boolean
}) {
  const models = useSavedModels()
  const hasCurrent = models.data?.some((model) => model.modelId === value)
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        <NativeSelect
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || models.loading}
          className="w-full min-w-0"
          aria-label="选择已保存的模型"
        >
          {!hasCurrent ? (
            <NativeSelectOption value={value}>
              {value}
              {models.data?.length ? '（当前）' : '（默认）'}
            </NativeSelectOption>
          ) : null}
          {models.data?.map((model) => (
            <NativeSelectOption key={model.id} value={model.modelId}>
              {model.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {manage ? <ModelManagerButton /> : null}
      </div>
      <ErrorAlert inline className="mt-1">
        {models.error}
      </ErrorAlert>
    </div>
  )
}

export function ModelManagerButton({ showLabel = false }: { showLabel?: boolean }) {
  return (
    <Modal>
      <ModalTrigger render={<Button type="button" variant="ghost" size={showLabel ? 'touch' : 'icon-touch'} aria-label="管理模型" />}>
        <Bot />{showLabel ? <span className="hidden sm:inline">模型库</span> : null}
      </ModalTrigger>
      <ModalContent size="md" height="fixed">
        <ModalHeader>
          <ModalTitle>模型库</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <ModelLibrary />
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

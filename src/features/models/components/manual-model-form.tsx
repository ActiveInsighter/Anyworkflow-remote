import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useAsyncAction } from '@/hooks/use-async-action'
import { saveModel } from '@/lib/api/models'
import { notifyModelsChanged } from '../hooks/use-saved-models'

export function ManualModelForm() {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const action = useAsyncAction()
  return <section aria-labelledby="manual-model-heading" className="border-t pt-6">
    <h2 id="manual-model-heading" className="text-base font-semibold">手动添加</h2>
    <form className="mt-4 space-y-4" onSubmit={(event) => {
      event.preventDefault()
      const modelId = id.trim().replace(/^models\//u, '')
      void action.run('add', async () => {
        await saveModel(modelId, name.trim() || undefined)
        notifyModelsChanged()
        setId(''); setName('')
      }, { failure: false, success: '模型已添加' })
    }}>
      <Field>
        <FieldLabel htmlFor="manual-model-id">模型 ID</FieldLabel>
        <Input id="manual-model-id" value={id} onChange={(event) => { setId(event.target.value); action.clearError() }}
          placeholder="gemini-…" required maxLength={117} autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={action.busy} />
      </Field>
      <Field>
        <FieldLabel htmlFor="manual-model-name">显示名称（可选）</FieldLabel>
        <Input id="manual-model-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={128} disabled={action.busy} />
      </Field>
      <ErrorAlert>{action.error}</ErrorAlert>
      <Button type="submit" variant="outline" disabled={action.busy || !id.trim()}>
        {action.busy ? <Spinner /> : <Plus />}添加模型
      </Button>
    </form>
  </section>
}

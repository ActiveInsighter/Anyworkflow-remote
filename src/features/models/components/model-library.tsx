import { useState } from 'react'
import { ManualModelForm } from './manual-model-form'
import { Bookmark, Check, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SelectField, SelectOption } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useAsyncAction } from '@/hooks/use-async-action'
import { useAsyncData } from '@/hooks/use-async-data'
import { deleteSavedModel, getModelCatalog, refreshModelCatalog, saveModel } from '@/lib/api/models'
import { formatDateTime } from '@/lib/format'
import type { CatalogModel, SavedModel } from '@/types/models'
import { notifyModelsChanged, useSavedModels } from '../hooks/use-saved-models'

function supported(model: CatalogModel) {
  return (
    /^gemini-/u.test(model.id) &&
    model.methods.includes('generateContent') &&
    !/(?:tts|image|native-audio|robotics|computer-use)/iu.test(model.id)
  )
}

export function ModelLibrary() {
  const saved = useSavedModels()
  const catalog = useAsyncData(getModelCatalog, [], {
    pollMs: (value) => (value?.status === 'syncing' ? 2500 : 60000),
  })
  const action = useAsyncAction()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const models = (catalog.data?.models ?? [])
    .filter(supported)
    .filter((model) => `${model.id} ${model.displayName}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))
  const model = models.find((model) => model.id === selected) ?? models[0]
  const alreadySaved = saved.data?.some((row) => row.modelId === model?.id)
  const syncing =
    catalog.data?.status === 'syncing' && Date.now() - Date.parse(catalog.data.requestedAt) < 600000
  function refresh() {
    void action.run(
      'refresh',
      async () => {
        await refreshModelCatalog()
        await catalog.reload()
      },
      { failure: false, success: '已请求刷新模型目录' },
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <section className="min-w-0" aria-labelledby="saved-models-heading">
        <h2 id="saved-models-heading" className="text-base font-semibold">
          已保存的模型
        </h2>
        <p className="mt-1 text-caption text-muted-foreground">文件转换、Gemini 消息共用。</p>
        <ErrorAlert className="mt-3">{saved.error}</ErrorAlert>
        {saved.loading && !saved.data ? <LoadingState label="加载模型…" /> : null}
        {saved.data?.length === 0 ? (
          <p className="py-6 text-body text-muted-foreground">还没有保存的模型。可手动添加或从官方目录选择。</p>
        ) : null}
        <div className="mt-3 divide-y">
          {saved.data?.map((row) => (
            <SavedModelRow key={row.id} model={row} />
          ))}
        </div>
      </section>
      <ManualModelForm />
      <section className="min-w-0 border-t pt-6" aria-labelledby="official-models-heading">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="official-models-heading" className="text-base font-semibold">
              Gemini 官方目录
            </h2>
            <p className="mt-1 text-caption text-muted-foreground">
              {catalog.data?.syncedAt
                ? `更新于 ${formatDateTime(catalog.data.syncedAt)}`
                : '刷新后选择可用的文本模型'}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={action.busy || syncing}
            onClick={refresh}
          >
            {syncing || action.pending === 'refresh' ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            {syncing ? '同步中' : '刷新目录'}
          </Button>
        </div>
        <ErrorAlert className="mt-3">{action.error || catalog.error || catalog.data?.error}</ErrorAlert>
        {catalog.loading && !catalog.data ? <LoadingState label="加载官方目录…" /> : null}
        {catalog.data?.models.length ? (
          <div className="mt-5 flex min-w-0 flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="model-search">搜索模型</FieldLabel>
              <Input
                id="model-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索名称或模型 ID"
                type="search"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="catalog-model">选择模型</FieldLabel>
              <SelectField
                id="catalog-model"
                value={model?.id ?? ''}
                onValueChange={(value) => setSelected(value)}
                disabled={!models.length}
              >
                {!models.length ? <SelectOption value="">没有匹配的文本模型</SelectOption> : null}
                {models.map((row) => (
                  <SelectOption key={row.id} value={row.id}>
                    {row.displayName} · {row.id}
                  </SelectOption>
                ))}
              </SelectField>
              {model ? (
                <FieldDescription className="break-words">
                  输入 {model.inputTokenLimit.toLocaleString()} · 输出{' '}
                  {model.outputTokenLimit.toLocaleString()} Token{model.thinking ? ' · 支持思考' : ''}
                </FieldDescription>
              ) : null}
            </Field>
            <Button
              type="button"
              className="self-start"
              disabled={!model || alreadySaved || action.busy}
              onClick={() => {
                if (model)
                  void action.run(
                    'save',
                    async () => {
                      await saveModel(model.id)
                      notifyModelsChanged()
                    },
                    { failure: false, success: '模型已保存' },
                  )
              }}
            >
              {alreadySaved ? <Check data-icon="inline-start" /> : <Bookmark data-icon="inline-start" />}
              {alreadySaved ? '已保存' : '保存模型'}
            </Button>
          </div>
        ) : syncing ? (
          <p role="status" className="py-6 text-body text-muted-foreground">
            正在获取官方模型，完成后自动显示。
          </p>
        ) : null}
        <a
          className="mt-5 inline-block text-caption text-muted-foreground underline underline-offset-4 hover:text-foreground"
          href="https://ai.google.dev/api/models"
          target="_blank"
          rel="noreferrer"
        >
          查看官方 Models API
        </a>
      </section>
    </div>
  )
}

function SavedModelRow({ model }: { model: SavedModel }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(model.name)
  const action = useAsyncAction()
  return (
    <div className="py-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              aria-label={`模型名称 ${model.modelId}`}
              value={name}
              maxLength={128}
              onChange={(event) => setName(event.target.value)}
            />
          ) : (
            <p className="truncate text-body font-medium">{model.name}</p>
          )}
          <p className="mt-1 break-all text-caption text-muted-foreground">{model.modelId}</p>
        </div>
        <Button
          type="button"
          size="icon-touch"
          variant="ghost"
          disabled={action.busy || (editing && !name.trim())}
          aria-label={`${editing ? '保存名称' : '重命名'} ${model.modelId}`}
          onClick={() => {
            if (!editing) {
              setName(model.name)
              setEditing(true)
              return
            }
            void action.run(
              'rename',
              async () => {
                await saveModel(model.modelId, name)
                setEditing(false)
                notifyModelsChanged()
              },
              { failure: false },
            )
          }}
        >
          {editing ? <Check /> : <Pencil />}
        </Button>
        <Button
          type="button"
          size="icon-touch"
          variant="ghost"
          disabled={action.busy}
          aria-label={`移除模型 ${model.modelId}`}
          onClick={() => {
            void action.run(
              'remove',
              async () => {
                await deleteSavedModel(model.id)
                notifyModelsChanged()
              },
              { failure: false },
            )
          }}
        >
          <Trash2 />
        </Button>
      </div>
      <ErrorAlert inline className="mt-1">
        {action.error}
      </ErrorAlert>
    </div>
  )
}

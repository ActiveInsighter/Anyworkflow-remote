import { useState, type ChangeEvent } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { contentTypeLabel } from '../lib/crawl-display'
import { draftErrors, type OptionDraft } from '../lib/option-draft'

const MONO = 'font-mono text-xs md:text-xs'

/**
 * How a page is crawled, shared by the composer's fold and a target's settings. X fields show only
 * where X posts can be crawled; everything empty means the crawler's defaults.
 */
export function CrawlOptionFields({
  id,
  draft,
  onChange,
  showX,
}: {
  /** Prefix for field ids, unique per form. */
  id: string
  draft: OptionDraft
  onChange: (draft: OptionDraft) => void
  showX: boolean
}) {
  const errors = draftErrors(draft)
  const set = <K extends keyof OptionDraft>(key: K, value: OptionDraft[K]) => onChange({ ...draft, [key]: value })
  const text = (key: 'selector' | 'attribute' | 'waitFor' | 'delay' | 'timeout' | 'maxPosts') => ({
    id: `${id}-${key}`,
    value: draft[key],
    onChange: (event: ChangeEvent<HTMLInputElement>) => set(key, event.target.value),
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': `${id}-${key}-help`,
  })

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${id}-mode`}>页面类型</FieldLabel>
        <NativeSelect id={`${id}-mode`} value={draft.mode} onChange={(event) => set('mode', event.target.value as OptionDraft['mode'])}>
          <NativeSelectOption value="auto">自动识别</NativeSelectOption>
          <NativeSelectOption value="page">普通网页</NativeSelectOption>
          <NativeSelectOption value="x">X 帖子</NativeSelectOption>
        </NativeSelect>
        <FieldDescription>自动识别会把 x.com 链接当作帖子。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-transport`}>抓取方式</FieldLabel>
        <NativeSelect id={`${id}-transport`} value={draft.transport} onChange={(event) => set('transport', event.target.value as OptionDraft['transport'])}>
          <NativeSelectOption value="">自动</NativeSelectOption>
          <NativeSelectOption value="http">仅 HTTP</NativeSelectOption>
          <NativeSelectOption value="browser">浏览器渲染</NativeSelectOption>
        </NativeSelect>
        <FieldDescription>自动：X 先用 HTTP，网页用浏览器。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-selector`}>内容选择器</FieldLabel>
        <Input {...text('selector')} maxLength={500} placeholder="body" spellCheck={false} className={MONO} />
        <FieldDescription id={`${id}-selector-help`}>只保存匹配元素；留空保存整页。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-attribute`}>属性</FieldLabel>
        <Input {...text('attribute')} maxLength={100} placeholder="href" spellCheck={false} className={MONO} />
        <FieldError>{errors.attribute}</FieldError>
        <FieldDescription id={`${id}-attribute-help`}>取属性值而不是文字，例如链接地址。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-waitFor`}>等待元素</FieldLabel>
        <Input {...text('waitFor')} maxLength={500} placeholder=".article-body" spellCheck={false} className={MONO} />
        <FieldError>{errors.waitFor}</FieldError>
        <FieldDescription id={`${id}-waitFor-help`}>出现后再提取，需要浏览器。</FieldDescription>
      </Field>
      <div className="grid min-w-0 grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor={`${id}-delay`}>渲染等待（秒）</FieldLabel>
          <Input {...text('delay')} type="number" inputMode="decimal" min={0} max={30} step={1} placeholder="3" />
          <FieldError>{errors.delay}</FieldError>
          <FieldDescription id={`${id}-delay-help`} className="sr-only">0–30 秒</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-timeout`}>超时（秒）</FieldLabel>
          <Input {...text('timeout')} type="number" inputMode="decimal" min={1} max={120} step={1} placeholder="30" />
          <FieldError>{errors.timeout}</FieldError>
          <FieldDescription id={`${id}-timeout-help`} className="sr-only">最多 120 秒</FieldDescription>
        </Field>
      </div>
      {showX ? (
        <>
          <Field>
            <FieldLabel htmlFor={`${id}-xScope`}>X 帖子范围</FieldLabel>
            <NativeSelect id={`${id}-xScope`} value={draft.xScope} onChange={(event) => set('xScope', event.target.value as OptionDraft['xScope'])}>
              <NativeSelectOption value="">按链接决定</NativeSelectOption>
              <NativeSelectOption value="target">只要链接指向的帖子</NativeSelectOption>
              <NativeSelectOption value="visible">页面上可见的公开帖子</NativeSelectOption>
            </NativeSelect>
            <FieldDescription>主页链接会自动抓取可见帖子。</FieldDescription>
          </Field>
          {draft.xScope === 'visible' ? (
            <Field>
              <FieldLabel htmlFor={`${id}-maxPosts`}>最多帖子数</FieldLabel>
              <Input {...text('maxPosts')} type="number" inputMode="numeric" min={1} max={50} step={1} placeholder="1" />
              <FieldError>{errors.maxPosts}</FieldError>
              <FieldDescription id={`${id}-maxPosts-help`}>1–50 条。</FieldDescription>
            </Field>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

const BUILT_IN = ['social_media', 'webpage']
const CUSTOM = '__custom__'

/**
 * Where results are filed. Empty lets the server choose (社交媒体 for X, 网页 otherwise); owners
 * can reuse a category they made before or type a new one.
 */
export function CategoryField({
  id,
  value,
  onChange,
  known,
  allowAuto = true,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  known: readonly string[]
  allowAuto?: boolean
}) {
  const options = [...new Set([...BUILT_IN, ...known])]
  const [typing, setTyping] = useState(() => value !== '' && !options.includes(value))

  return (
    <Field>
      <FieldLabel htmlFor={id}>分类</FieldLabel>
      <div className="flex min-w-0 flex-col gap-2">
        <NativeSelect
          id={id}
          value={typing ? CUSTOM : value}
          onChange={(event) => {
            const next = event.target.value
            setTyping(next === CUSTOM)
            onChange(next === CUSTOM ? '' : next)
          }}
        >
          {allowAuto ? <NativeSelectOption value="">自动</NativeSelectOption> : null}
          {options.map((type) => <NativeSelectOption key={type} value={type}>{contentTypeLabel(type)}</NativeSelectOption>)}
          <NativeSelectOption value={CUSTOM}>新建分类…</NativeSelectOption>
        </NativeSelect>
        {typing ? (
          <Input
            aria-label="新分类名称"
            value={value}
            maxLength={64}
            placeholder="例如：行业新闻"
            onChange={(event) => onChange(event.target.value)}
            autoFocus
          />
        ) : null}
      </div>
    </Field>
  )
}

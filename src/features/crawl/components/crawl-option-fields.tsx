import { useState, type ChangeEvent } from 'react'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { CrawlRunner } from '@/types/crawl'
import { BUILT_IN_CATEGORY_IDS, categoryLabel } from '../lib/crawl-display'
import { draftErrors, MAX_ITEMS_RANGE, TIMEOUT_RANGE, type OptionDraft } from '../lib/option-draft'

const MONO = 'font-mono text-xs md:text-xs'

const SWITCHES = [
  { key: 'scroll', label: '滚动加载', help: '逐屏滚动到底部，用于懒加载和无限滚动。' },
  { key: 'keepHtml', label: '保留 HTML', help: '除 Markdown 外同时保存清理后的 HTML。' },
  { key: 'generic', label: '只用通用解析', help: '跳过站点规则，用于对比效果。' },
] as const

/**
 * How a page is read, shared by the composer's fold and a page's settings. Everything empty means
 * the crawler's defaults. The cloud read mode shows only for the cloud; the reading scope only
 * where a site lists many entries (X).
 */
export function CrawlOptionFields({
  id,
  draft,
  onChange,
  runner,
  showScope,
}: {
  /** Prefix for field ids, unique per form. */
  id: string
  draft: OptionDraft
  onChange: (draft: OptionDraft) => void
  runner: CrawlRunner
  showScope: boolean
}) {
  const errors = draftErrors(draft, runner)
  const set = <K extends keyof OptionDraft>(key: K, value: OptionDraft[K]) => onChange({ ...draft, [key]: value })
  const text = (key: 'waitFor' | 'contentSelector' | 'timeoutSeconds' | 'maxItems') => ({
    id: `${id}-${key}`,
    value: draft[key],
    onChange: (event: ChangeEvent<HTMLInputElement>) => set(key, event.target.value),
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': `${id}-${key}-help`,
  })

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      {runner === 'cloud' ? (
        <Field>
          <FieldLabel htmlFor={`${id}-transport`}>云端读取方式</FieldLabel>
          <NativeSelect id={`${id}-transport`} value={draft.transport} onChange={(event) => set('transport', event.target.value as OptionDraft['transport'])}>
            <NativeSelectOption value="">默认</NativeSelectOption>
            <NativeSelectOption value="auto">先静态读取，没有内容再用浏览器</NativeSelectOption>
            <NativeSelectOption value="http">只静态读取</NativeSelectOption>
            <NativeSelectOption value="browser">浏览器渲染</NativeSelectOption>
          </NativeSelect>
          <FieldDescription>默认：X 先静态读取，其他网页用浏览器。</FieldDescription>
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${id}-timeoutSeconds`}>超时（秒）</FieldLabel>
        <Input {...text('timeoutSeconds')} type="number" inputMode="numeric" min={TIMEOUT_RANGE.min} max={TIMEOUT_RANGE.max} step={1} placeholder="90" />
        <FieldError>{errors.timeoutSeconds}</FieldError>
        <FieldDescription id={`${id}-timeoutSeconds-help`}>{TIMEOUT_RANGE.min}–{TIMEOUT_RANGE.max} 秒。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-waitFor`}>等待元素</FieldLabel>
        <Input {...text('waitFor')} maxLength={500} placeholder=".article-body" spellCheck={false} className={MONO} />
        <FieldError>{errors.waitFor}</FieldError>
        <FieldDescription id={`${id}-waitFor-help`}>出现后再开始解析。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-contentSelector`}>正文选择器</FieldLabel>
        <Input {...text('contentSelector')} maxLength={500} placeholder="main article" spellCheck={false} className={MONO} />
        <FieldDescription id={`${id}-contentSelector-help`}>指定后优先于站点规则和通用解析。</FieldDescription>
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor={`${id}-removeSelectors`}>移除元素</FieldLabel>
        <Textarea
          id={`${id}-removeSelectors`}
          rows={2}
          placeholder={'.ad\n.comments'}
          spellCheck={false}
          className={`min-h-16 ${MONO}`}
          value={draft.removeSelectors}
          onChange={(event) => set('removeSelectors', event.target.value)}
          aria-invalid={errors.removeSelectors ? true : undefined}
          aria-describedby={`${id}-removeSelectors-help`}
        />
        <FieldError>{errors.removeSelectors}</FieldError>
        <FieldDescription id={`${id}-removeSelectors-help`}>每行一个选择器。</FieldDescription>
      </Field>
      {showScope ? (
        <>
          <Field>
            <FieldLabel htmlFor={`${id}-scope`}>读取范围</FieldLabel>
            <NativeSelect id={`${id}-scope`} value={draft.scope} onChange={(event) => set('scope', event.target.value as OptionDraft['scope'])}>
              <NativeSelectOption value="">按链接决定</NativeSelectOption>
              <NativeSelectOption value="target">只要链接指向的帖子</NativeSelectOption>
              <NativeSelectOption value="visible">页面上的帖子</NativeSelectOption>
            </NativeSelect>
            <FieldDescription>主页链接总是读取页面上的帖子。</FieldDescription>
          </Field>
          {draft.scope === 'visible' ? (
            <Field>
              <FieldLabel htmlFor={`${id}-maxItems`}>最多条数</FieldLabel>
              <Input {...text('maxItems')} type="number" inputMode="numeric" min={MAX_ITEMS_RANGE.min} max={MAX_ITEMS_RANGE.max} step={1} placeholder="20" />
              <FieldError>{errors.maxItems}</FieldError>
              <FieldDescription id={`${id}-maxItems-help`}>{MAX_ITEMS_RANGE.min}–{MAX_ITEMS_RANGE.max} 条。</FieldDescription>
            </Field>
          ) : null}
        </>
      ) : null}
      <div className="grid min-w-0 gap-4 sm:col-span-2 sm:grid-cols-3">
        {SWITCHES.map(({ key, label, help }) => (
          <Field key={key} orientation="horizontal" className="items-start" data-invalid={errors[key] ? true : undefined}>
            <FieldContent>
              <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
              <FieldDescription id={`${id}-${key}-help`}>{help}</FieldDescription>
              <FieldError>{errors[key]}</FieldError>
            </FieldContent>
            <Switch
              id={`${id}-${key}`}
              className="mt-0.5"
              checked={draft[key]}
              onCheckedChange={(checked) => set(key, checked)}
              aria-describedby={`${id}-${key}-help`}
              aria-invalid={errors[key] ? true : undefined}
            />
          </Field>
        ))}
      </div>
    </div>
  )
}

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
  const options = [...new Set([...BUILT_IN_CATEGORY_IDS, ...known])]
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
          {options.map((category) => <NativeSelectOption key={category} value={category}>{categoryLabel(category)}</NativeSelectOption>)}
          <NativeSelectOption value={CUSTOM}>新建分类…</NativeSelectOption>
        </NativeSelect>
        {typing ? (
          <Input aria-label="新分类名称" value={value} maxLength={64} placeholder="例如：行业新闻" onChange={(event) => onChange(event.target.value)} autoFocus />
        ) : null}
      </div>
    </Field>
  )
}

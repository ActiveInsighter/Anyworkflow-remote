import { useMemo } from 'react'
import { ImageOff } from 'lucide-react'
import { parseMarkdown, type Block, type Inline } from '../lib/markdown-blocks'
import { safeHref } from '../lib/capture-display'

function InlineText({ inlines }: { inlines: Inline[] }) {
  return inlines.map((inline, index) => {
    if (inline.kind === 'strong') return <strong key={index} className="font-semibold">{inline.text}</strong>
    if (inline.kind === 'emphasis') return <em key={index}>{inline.text}</em>
    if (inline.kind === 'code') return <code key={index} className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.875em]">{inline.text}</code>
    if (inline.kind === 'image') {
      return (
        <span key={index} className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 text-caption text-muted-foreground">
          <ImageOff aria-hidden="true" className="size-3" />
          {inline.text || '图片'}
        </span>
      )
    }
    if (inline.kind === 'link') {
      const href = safeHref(inline.href)
      if (!href) return <span key={index}>{inline.text}</span>
      return (
        <a key={index} href={href} target="_blank" rel="noreferrer noopener" className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
          {inline.text}
        </a>
      )
    }
    return <span key={index}>{inline.text}</span>
  })
}

const HEADING_CLASS = {
  1: 'mt-8 text-xl font-semibold first:mt-0',
  2: 'mt-7 text-lg font-semibold first:mt-0',
  3: 'mt-6 text-base font-semibold first:mt-0',
  4: 'mt-5 text-sm font-semibold first:mt-0',
} as const

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'heading') {
    const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4'
    return <Tag className={HEADING_CLASS[block.level]}><InlineText inlines={block.inlines} /></Tag>
  }
  if (block.kind === 'quote') {
    return <blockquote className="mt-4 border-s-2 border-primary/40 ps-4 text-muted-foreground"><InlineText inlines={block.inlines} /></blockquote>
  }
  if (block.kind === 'list') {
    const List = block.ordered ? 'ol' : 'ul'
    return (
      <List className={`mt-3 flex flex-col gap-1 ps-5 ${block.ordered ? 'list-decimal' : 'list-disc'} marker:text-muted-foreground`}>
        {block.items.map((item, index) => <li key={index}><InlineText inlines={item} /></li>)}
      </List>
    )
  }
  if (block.kind === 'code') {
    return <pre className="mt-4 overflow-x-auto rounded-lg bg-subtle p-3 font-mono text-xs leading-6"><code>{block.text}</code></pre>
  }
  if (block.kind === 'rule') return <hr className="my-6" />
  return <p className="mt-3 first:mt-0"><InlineText inlines={block.inlines} /></p>
}

/** The captured article as something to read. Everything renders as text; see markdown-blocks. */
export function CaptureReader({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown])
  return (
    <article className="mx-auto max-w-[42rem] text-[0.9375rem]/7 [overflow-wrap:anywhere]">
      {blocks.map((block, index) => <BlockView key={index} block={block} />)}
    </article>
  )
}

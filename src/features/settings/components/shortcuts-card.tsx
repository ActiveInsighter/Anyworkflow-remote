import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Kbd } from '@/components/ui/kbd'
import { IS_APPLE_PLATFORM } from '@/lib/platform/keyboard'
import { EDITOR_COMMAND_META, formatKey } from '@/features/editor/lib/editor-command-meta'

const APP_SHORTCUTS: ReadonlyArray<{ label: string; key: string }> = [
  { label: '展开 / 收起侧边栏', key: 'Mod-b' },
]

/** Editor bindings come from the command registry, so this list cannot drift from the editor. */
const EDITOR_SHORTCUTS: ReadonlyArray<{ label: string; key: string }> = [
  { label: '保存草稿', key: 'Mod-s' },
  ...EDITOR_COMMAND_META.flatMap((command) => ('key' in command && command.key ? [{ label: command.label, key: command.key }] : [])),
  { label: '退出全屏 / 关闭查找', key: 'Escape' },
]

function ShortcutList({ items }: { items: ReadonlyArray<{ label: string; key: string }> }) {
  return (
    <dl className="flex flex-col gap-2.5 text-xs">
      {items.map((shortcut) => (
        <div key={shortcut.label} className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">{shortcut.label}</dt>
          <dd>
            <Kbd>{shortcut.key === 'Escape' ? 'Esc' : formatKey(shortcut.key, IS_APPLE_PLATFORM)}</Kbd>
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ShortcutsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>快捷键</CardTitle>
        <CardDescription>在输入框内时，侧边栏快捷键不会触发。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-2.5">
          <h3 className="text-xs font-medium">应用</h3>
          <ShortcutList items={APP_SHORTCUTS} />
        </section>
        <section className="flex flex-col gap-2.5">
          <h3 className="text-xs font-medium">编辑器</h3>
          <ShortcutList items={EDITOR_SHORTCUTS} />
        </section>
      </CardContent>
    </Card>
  )
}

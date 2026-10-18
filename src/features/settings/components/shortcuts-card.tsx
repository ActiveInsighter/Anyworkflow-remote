import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Kbd, KbdGroup } from '@/components/ui/kbd'

const SHORTCUTS: ReadonlyArray<{ label: string; keys: string[] }> = [
  { label: '展开 / 收起侧边栏', keys: ['Ctrl / ⌘', 'B'] },
  { label: '编辑器内保存草稿', keys: ['Ctrl / ⌘', 'S'] },
  { label: '退出编辑器全屏', keys: ['Esc'] },
]

export function ShortcutsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>快捷键</CardTitle>
        <CardDescription>在输入框内时，侧边栏快捷键不会触发。</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2.5 text-xs">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{shortcut.label}</dt>
              <dd>
                <KbdGroup>
                  {shortcut.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </KbdGroup>
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

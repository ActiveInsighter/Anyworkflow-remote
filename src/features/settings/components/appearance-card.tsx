import { SegmentedControl } from '@/components/form/segmented-control'
import { THEME_OPTIONS } from '@/components/theme/theme-options'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { setThemePreference, useThemePreference } from '@/lib/platform/theme'

export function AppearanceCard() {
  const theme = useThemePreference()
  return (
    <Card>
      <CardHeader>
        <CardTitle>外观</CardTitle>
        <CardDescription>主题跟随系统，或手动指定。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <SegmentedControl label="界面主题" value={theme} onValueChange={setThemePreference} options={THEME_OPTIONS} />
        <p className="text-xs leading-5 text-muted-foreground">也可以在侧边栏底部的账号菜单中切换。</p>
      </CardContent>
    </Card>
  )
}

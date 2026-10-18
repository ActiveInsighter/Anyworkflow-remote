import { Keyboard, Palette, Plug, SlidersHorizontal } from 'lucide-react'
import { SettingsRow } from '@/components/navigation/settings-row'
import { useSession } from '@/lib/api/session'

export function SettingsDirectory() {
  const session = useSession()
  return (
    <nav aria-label="设置目录" className="divide-y overflow-hidden rounded-xl border bg-card">
      <SettingsRow
        title="运行配置"
        description="默认开始链接与各页面的运行偏好"
        icon={SlidersHorizontal}
        to="/settings/runtime"
      />
      <SettingsRow title="外观" description="主题与显示偏好" icon={Palette} to="/settings/appearance" />
      <SettingsRow
        title="连接"
        description={session ? `已连接 · ${session.record.email}` : '后端地址与账号登录'}
        icon={Plug}
        to="/settings/connection"
      />
      <SettingsRow title="快捷键" description="导航与编辑器操作" icon={Keyboard} to="/settings/shortcuts" />
    </nav>
  )
}

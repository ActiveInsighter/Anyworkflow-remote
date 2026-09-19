import { Database, LogOut, Monitor, Moon, Palette, Sun, UserRound } from 'lucide-react'
import { useState } from 'react'
import {
  AppPage,
  ErrorBanner,
  Field,
  PageHeader,
  Panel,
  PanelHeader,
  SectionHeading,
  Segmented,
  TextInput,
} from '@/components/app/ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { login, toErrorMessage } from '@/lib/api'
import { clearSession, getBaseUrl, useSession } from '@/lib/session'
import { setThemePreference, useThemePreference, type ThemePreference } from '@/lib/theme'
import { toast } from 'sonner'

const themeOptions = [
  { value: 'system' as ThemePreference, label: '跟随系统' },
  { value: 'light' as ThemePreference, label: '浅色' },
  { value: 'dark' as ThemePreference, label: '深色' },
]

const themeIcons = {
  system: Monitor,
  light: Sun,
  dark: Moon,
} as const

export function SettingsPage() {
  const session = useSession()
  const theme = useThemePreference()
  const [baseUrl, setBaseUrl] = useState(session?.baseUrl || getBaseUrl())
  const [email, setEmail] = useState(session?.record.email || '')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const ThemeIcon = themeIcons[theme]

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      await login(email, password, baseUrl)
      setPassword('')
      toast.success(session ? '已重新连接' : '连接成功')
    } catch (cause) {
      const message = toErrorMessage(cause, '登录失败')
      setError(message)
      toast.error('连接失败', { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppPage>
      <PageHeader title="设置" description="管理后端连接与界面偏好。" />

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel>
            <PanelHeader
              title="连接"
              description="AnyWorkflow 的 PocketBase 后端地址与账号。"
              actions={
                <Badge variant={session ? 'secondary' : 'outline'} className="rounded-md">
                  {session ? '已连接' : '未连接'}
                </Badge>
              }
            />

            <div className="p-4 sm:p-5">
              {session ? (
                <div className="mb-5 flex items-center gap-3 border-b border-border pb-4">
                  <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <UserRound className="size-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">
                      {session.record.name || session.record.email}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{session.record.email}</div>
                  </div>
                </div>
              ) : null}

              <form className="grid gap-4" onSubmit={submit}>
                <Field label="PocketBase" hint="必须使用 HTTPS，或本地 localhost / 127.0.0.1。">
                  <TextInput
                    name="pocketbase-url"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    autoComplete="url"
                    required
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="邮箱">
                    <TextInput
                      type="email"
                      name="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="username"
                      required
                    />
                  </Field>
                  <Field label="密码">
                    <TextInput
                      type="password"
                      name="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </Field>
                </div>

                <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
                  <Button type="submit" disabled={submitting}>
                    <Database />
                    {submitting ? '连接中…' : session ? '重新连接' : '连接'}
                  </Button>
                  {session ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        clearSession()
                        toast.success('已退出登录')
                      }}
                    >
                      <LogOut />退出登录
                    </Button>
                  ) : null}
                </div>
              </form>
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel>
            <PanelHeader title="外观" description="主题跟随系统，或手动指定。" />
            <div className="grid gap-4 p-4 sm:p-5">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <ThemeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                {theme === 'system' ? '跟随系统' : theme === 'light' ? '浅色' : '深色'}
              </div>
              <Segmented
                label="界面主题"
                value={theme}
                onChange={(next) => setThemePreference(next)}
                options={themeOptions}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                也可以点击侧边栏底部的按钮快速切换。
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="快捷键" />
            <div className="p-4 sm:p-5">
              <SectionHeading title="导航" />
              <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">展开 / 收起侧边栏</span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">Ctrl / ⌘ + B</kbd>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">编辑器内保存草稿</span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">Ctrl / ⌘ + S</kbd>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Palette className="size-3.5" aria-hidden="true" />
                在输入框内时快捷键不会触发。
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </AppPage>
  )
}

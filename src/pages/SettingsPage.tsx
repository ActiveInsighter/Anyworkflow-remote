import { Database, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { AppPage, ErrorBanner, Field, PageHeader, TextInput } from '@/components/app/ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { login, toErrorMessage } from '@/lib/api'
import { clearSession, getBaseUrl, useSession } from '@/lib/session'

export function SettingsPage() {
  const session = useSession()
  const [baseUrl, setBaseUrl] = useState(session?.baseUrl || getBaseUrl())
  const [email, setEmail] = useState(session?.record.email || '')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      await login(email, password, baseUrl)
      setPassword('')
    } catch (cause) {
      setError(toErrorMessage(cause, '登录失败'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppPage>
      <PageHeader
        eyebrow="连接"
        title="连接设置"
        description="Web 版直接复用小程序当前的 PocketBase 认证与数据接口。"
      />

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <Card>
          <CardHeader className="gap-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>AnyWorkflow 账号</CardTitle>
                <CardDescription className="mt-1.5">登录信息只保存在当前浏览器。</CardDescription>
              </div>
              <Badge variant={session ? 'secondary' : 'outline'} className="rounded-full">
                {session ? '已连接' : '未连接'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {session ? (
              <div className="mb-5 flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <UserRound className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{session.record.name || session.record.email}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{session.record.email}</div>
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{session.baseUrl}</div>
                </div>
              </div>
            ) : null}

            <form className="grid gap-4" onSubmit={submit}>
              <Field label="PocketBase 地址" hint="生产环境应使用 HTTPS；默认地址与小程序保持一致。">
                <TextInput value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} autoComplete="url" />
              </Field>
              <Field label="邮箱">
                <TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
              </Field>
              <Field label="密码">
                <TextInput
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder={session ? '重新连接时输入密码' : ''}
                />
              </Field>

              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <Button type="submit" disabled={submitting}>
                  <Database />
                  {submitting ? '正在连接…' : session ? '重新连接' : '连接 AnyWorkflow'}
                </Button>
                {session ? (
                  <Button type="button" variant="outline" onClick={() => clearSession()}>
                    <LogOut />退出登录
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 grid size-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-4" />
            </div>
            <CardTitle>后端兼容</CardTitle>
            <CardDescription>网页端不需要迁移 PocketBase 数据结构。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ['认证集合', 'aw_clients'],
              ['Run 控制', 'commandVersion + 1'],
              ['运行状态', '自动轮询同步'],
              ['编辑格式', '现有 Run DSL'],
            ].map(([label, value], index, items) => (
              <div key={label}>
                <div className="flex items-center justify-between gap-4 py-1">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-right text-xs font-medium">{value}</span>
                </div>
                {index < items.length - 1 ? <Separator className="mt-2" /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppPage>
  )
}

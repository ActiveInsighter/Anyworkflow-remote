import { Database, LogOut, UserRound } from 'lucide-react'
import { useState } from 'react'
import { AppPage, ErrorBanner, Field, PageHeader, TextInput } from '@/components/app/ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
      <PageHeader eyebrow="设置" title="连接" />

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <Card className="max-w-2xl">
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-4">
            <CardTitle>AnyWorkflow</CardTitle>
            <Badge variant={session ? 'secondary' : 'outline'} className="rounded-full">
              {session ? '已连接' : '未连接'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {session ? (
            <div className="mb-5 flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--ui-primary)] text-[var(--ui-primary-foreground)]">
                <UserRound className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{session.record.name || session.record.email}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{session.record.email}</div>
              </div>
            </div>
          ) : null}

          <form className="grid gap-4" onSubmit={submit}>
            <Field label="PocketBase">
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
              />
            </Field>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <Button type="submit" disabled={submitting}>
                <Database />
                {submitting ? '连接中…' : session ? '重新连接' : '连接'}
              </Button>
              {session ? (
                <Button type="button" variant="outline" onClick={() => clearSession()}>
                  <LogOut />退出
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </AppPage>
  )
}

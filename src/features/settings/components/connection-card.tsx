import { useState, type FormEvent } from 'react'
import { Database, LogOut, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { StatusBadge } from '@/components/data-display/status-badge'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { login, toErrorMessage } from '@/lib/api'
import { clearSession, getBaseUrl, useSession } from '@/lib/api/session'

/** Backend URL and account. Signing in replaces the stored session for every tab. */
export function ConnectionCard() {
  const session = useSession()
  const [baseUrl, setBaseUrl] = useState(session?.baseUrl || getBaseUrl())
  const [email, setEmail] = useState(session?.record.email || '')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
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
    <Card>
      <CardHeader>
        <CardTitle>连接</CardTitle>
        <CardDescription>AnyWorkflow 的 PocketBase 后端地址与账号。</CardDescription>
        <CardAction>
          <StatusBadge tone={session ? 'success' : 'neutral'}>{session ? '已连接' : '未连接'}</StatusBadge>
        </CardAction>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent className="flex flex-col gap-5">
          {session ? (
            <>
              <div className="flex items-center gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <UserRound className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-body font-medium">{session.record.name || session.record.email}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{session.record.email}</div>
                </div>
              </div>
              <Separator />
            </>
          ) : null}
          <ErrorAlert inline>{error}</ErrorAlert>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="pocketbase-url">PocketBase</FieldLabel>
              <Input
                id="pocketbase-url"
                name="pocketbase-url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                autoComplete="url"
                required
              />
              <FieldDescription>必须使用 HTTPS，或本地 localhost / 127.0.0.1。</FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="email">邮箱</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">密码</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex-col items-stretch sm:flex-row sm:items-center">
          <Button type="submit" disabled={submitting}>
            <Database data-icon="inline-start" />
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
              <LogOut data-icon="inline-start" />
              退出登录
            </Button>
          ) : null}
        </CardFooter>
      </form>
    </Card>
  )
}

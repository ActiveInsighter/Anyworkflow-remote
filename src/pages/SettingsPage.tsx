import { useState } from 'react'
import { Button, Card, ErrorBanner, Field, PageHeader, TextInput } from '../components/ui'
import { login, toErrorMessage } from '../lib/api'
import { clearSession, getBaseUrl, useSession } from '../lib/session'

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
    <>
      <PageHeader
        eyebrow="连接"
        title="AnyWorkflow 设置"
        description="Web 版直接复用小程序当前的 PocketBase 认证与数据接口。"
      />

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <div className="settings-grid">
        <Card className="settings-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PocketBase</span>
              <h2>{session ? '当前连接' : '连接账号'}</h2>
            </div>
            <span className={session ? 'connection-pill online' : 'connection-pill'}>
              {session ? '已连接' : '未连接'}
            </span>
          </div>

          {session ? (
            <div className="account-summary">
              <div className="account-avatar">{(session.record.name || session.record.email).slice(0, 1).toUpperCase()}</div>
              <div>
                <strong>{session.record.name || session.record.email}</strong>
                <span>{session.record.email}</span>
                <small>{session.baseUrl}</small>
              </div>
            </div>
          ) : null}

          <form className="settings-form" onSubmit={submit}>
            <Field label="PocketBase 地址" hint="生产环境应使用 HTTPS；默认地址与小程序保持一致。">
              <TextInput value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} autoComplete="url" />
            </Field>
            <Field label="邮箱">
              <TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
            </Field>
            <Field label="密码">
              <TextInput type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder={session ? '重新登录时输入密码' : ''} />
            </Field>
            <div className="form-actions">
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? '正在连接…' : session ? '重新连接' : '连接 AnyWorkflow'}
              </Button>
              {session ? (
                <Button type="button" variant="secondary" onClick={() => clearSession()}>退出登录</Button>
              ) : null}
            </div>
          </form>
        </Card>

        <Card className="settings-card info-card">
          <span className="eyebrow">接口兼容</span>
          <h2>后端无需迁移</h2>
          <p>网页版继续使用 <code>aw_clients</code>、<code>aw_dispatch_runs</code>、<code>aw_dispatch_tasks</code> 和 <code>aw_dispatch_events</code>。</p>
          <div className="compat-list">
            <div><span>Run 控制</span><strong>commandVersion + 1</strong></div>
            <div><span>运行状态</span><strong>自动轮询同步</strong></div>
            <div><span>编辑格式</span><strong>现有 Run DSL</strong></div>
          </div>
        </Card>
      </div>
    </>
  )
}

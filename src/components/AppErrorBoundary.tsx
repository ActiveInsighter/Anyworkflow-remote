import { Component, type ErrorInfo, type ReactNode } from 'react'
import { clearSession } from '../lib/session'
import { Button } from './ui'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  error: Error | null
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AnyWorkflow UI crashed', error, info)
  }

  private reload = () => {
    window.location.reload()
  }

  private resetSession = () => {
    clearSession()
    window.location.assign('/')
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="fatal-error-screen">
        <section className="fatal-error-card">
          <div className="fatal-error-code">UI ERROR</div>
          <h1>页面渲染失败</h1>
          <p>前端遇到了未处理的错误。你可以先重新加载；如果问题与登录状态有关，可以清除当前登录状态后重新连接。</p>
          <pre>{this.state.error.message || 'Unknown error'}</pre>
          <div className="fatal-error-actions">
            <Button variant="secondary" onClick={this.reload}>重新加载</Button>
            <Button variant="primary" onClick={this.resetSession}>退出登录并重置</Button>
          </div>
        </section>
      </main>
    )
  }
}

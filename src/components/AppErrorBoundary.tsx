import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { clearSession } from '@/lib/session'

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
      <main className="grid min-h-dvh place-items-center bg-background p-4 text-foreground">
        <section className="w-full max-w-xl rounded-xl border bg-card p-5 shadow-lg sm:p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-destructive">UI ERROR</div>
          <h1 className="mt-2 text-xl font-semibold">页面渲染失败</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            前端遇到了未处理的错误。可以先重新加载；如果问题与登录状态有关，再退出登录并重置。
          </p>
          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-xs leading-5 text-muted-foreground">
            {this.state.error.message || 'Unknown error'}
          </pre>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={this.reload}><RotateCcw />重新加载</Button>
            <Button onClick={this.resetSession}><LogOut />退出登录并重置</Button>
          </div>
        </section>
      </main>
    )
  }
}

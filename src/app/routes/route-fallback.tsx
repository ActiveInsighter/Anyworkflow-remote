import { Suspense, type ReactNode } from 'react'
import { LoadingState } from '@/components/feedback/loading-state'
import { Page } from '@/components/layout/page'

/** Suspense boundary for lazily loaded pages, keeping the page frame while the chunk loads. */
export function RouteFallback({ children, label = '加载页面…' }: { children: ReactNode; label?: string }) {
  return (
    <Suspense
      fallback={
        <Page>
          <LoadingState label={label} />
        </Page>
      }
    >
      {children}
    </Suspense>
  )
}

import type { ReactNode } from 'react'
import { AnimateUIProvider } from '@animate-ui/react/provider'
import { ReducedMotionConfig } from '@animate-ui/react/utils/motion'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

/** Shared motion policy, tooltip timing and toast outlet. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AnimateUIProvider tempo={0.85} reducedMotion="user">
      <ReducedMotionConfig>
        <TooltipProvider delayDuration={300} skipDelayDuration={120}>
          {children}
          <Toaster position="top-center" />
        </TooltipProvider>
      </ReducedMotionConfig>
    </AnimateUIProvider>
  )
}

import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

/** App-wide context: one tooltip timing for every surface, and the toast outlet. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={120}>
      {children}
      <Toaster position="top-center" />
    </TooltipProvider>
  )
}

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-4', className)} {...props} />
}

const tabsListVariants = cva('group/tabs-list inline-flex w-fit items-center text-muted-foreground', {
  variants: {
    variant: {
      /** Segmented pill, for switching views inside a section. */
      default: 'h-9 rounded-lg bg-muted p-1',
      /** Underlined, for page-level filters that sit on a divider. */
      line: 'h-auto gap-5 border-b border-border',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

function TabsList({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 text-xs font-medium whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground [&_svg]:size-3.5',
        'group-data-[variant=default]/tabs-list:h-7 group-data-[variant=default]/tabs-list:rounded-md group-data-[variant=default]/tabs-list:px-2.5 group-data-[variant=default]/tabs-list:data-[state=active]:bg-background group-data-[variant=default]/tabs-list:data-[state=active]:shadow-xs',
        'group-data-[variant=line]/tabs-list:-mb-px group-data-[variant=line]/tabs-list:h-touch group-data-[variant=line]/tabs-list:flex-none group-data-[variant=line]/tabs-list:border-b-2 group-data-[variant=line]/tabs-list:border-transparent group-data-[variant=line]/tabs-list:px-1 group-data-[variant=line]/tabs-list:data-[state=active]:border-primary',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('outline-none', className)} {...props} />
}

export { Tabs, TabsContent, TabsList, TabsTrigger }

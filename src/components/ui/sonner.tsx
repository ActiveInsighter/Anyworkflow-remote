import { Toaster as Sonner, type ToasterProps } from 'sonner'

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      closeButton
      richColors={false}
      duration={2400}
      visibleToasts={2}
      expand={false}
      swipeDirections={['top', 'left', 'right']}
      toastOptions={{
        duration: 2400,
        classNames: {
          toast: 'border border-border bg-card text-card-foreground shadow-md',
          title: 'text-[13px] font-medium',
          description: 'text-xs text-muted-foreground',
          actionButton: 'bg-secondary text-secondary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
          closeButton: '!left-auto !right-2 !top-2 !translate-x-0 !translate-y-0',
        },
      }}
      {...props}
    />
  )
}

import { Toaster as Sonner, type ToasterProps } from 'sonner'

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      closeButton
      richColors={false}
      toastOptions={{
        classNames: {
          toast: 'border border-border bg-card text-card-foreground shadow-md',
          title: 'text-[13px] font-medium',
          description: 'text-xs text-muted-foreground',
          actionButton: 'bg-secondary text-secondary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

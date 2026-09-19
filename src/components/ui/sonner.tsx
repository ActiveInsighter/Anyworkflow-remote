import { Toaster as Sonner, type ToasterProps } from 'sonner'

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      duration={2400}
      visibleToasts={1}
      expand={false}
      swipeDirections={['top', 'left', 'right']}
      {...props}
    />
  )
}

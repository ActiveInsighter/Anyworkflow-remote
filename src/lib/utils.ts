import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge only knows Tailwind's default scales. Without these groups it reads the type
 * scale from styles/tokens/typography.css (`text-caption`, `text-body`…) as text colours, so
 * `cn('text-caption', 'text-muted-foreground')` silently dropped the font size.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['micro', 'caption', 'body', 'title', 'display'] }],
      shadow: [{ shadow: ['panel'] }],
      'tracking': [{ tracking: ['heading', 'snug', 'label'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

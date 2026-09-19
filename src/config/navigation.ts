import type { LucideIcon } from 'lucide-react'
import { BookMarked, House, Settings } from 'lucide-react'

export interface AppNavItem {
  id: string
  label: string
  to: string
  icon: LucideIcon
  match: (pathname: string) => boolean
}

export const appNavigation: AppNavItem[] = [
  {
    id: 'runs',
    label: '工作流',
    to: '/',
    icon: House,
    match: (pathname) => pathname === '/' || pathname.startsWith('/runs/') || pathname.startsWith('/tasks/') || pathname.startsWith('/events/'),
  },
  {
    id: 'library',
    label: '资料库',
    to: '/library',
    icon: BookMarked,
    match: (pathname) => pathname === '/library' || pathname.startsWith('/templates/'),
  },
  {
    id: 'settings',
    label: '设置',
    to: '/settings',
    icon: Settings,
    match: (pathname) => pathname === '/settings',
  },
]

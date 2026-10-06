import type { LucideIcon } from 'lucide-react'
import { CalendarClock, BookMarked, FileText, House, Settings } from 'lucide-react'

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
  { id: 'schedules', label: '重复计划', to: '/schedules', icon: CalendarClock, match: pathname => pathname === '/schedules' },
  {
    id: 'library',
    label: '资料库',
    to: '/library',
    icon: BookMarked,
    match: (pathname) => pathname === '/library' || pathname.startsWith('/templates/'),
  },
  {
    id: 'file-converter',
    label: '文件转换',
    to: '/file-converter',
    icon: FileText,
    match: (pathname) => pathname === '/file-converter' || pathname === '/pdf-to-md',
  },
  {
    id: 'settings',
    label: '设置',
    to: '/settings',
    icon: Settings,
    match: (pathname) => pathname === '/settings',
  },
]

import type { LucideIcon } from 'lucide-react'
import { BookMarked, CalendarClock, FileText, FolderOpen, Globe, LayoutList, Radar, Settings } from 'lucide-react'

export interface AppNavItem {
  id: string
  label: string
  to: string
  icon: LucideIcon
  match: (pathname: string) => boolean
  /** Task kind whose running count the item shows (ids from the shared task catalog). */
  taskKind?: 'run' | 'file-conversion' | 'page-capture' | 'web-crawl'
}

export interface AppNavGroup {
  id: string
  label: string
  items: AppNavItem[]
}

const runs: AppNavItem = {
  id: 'runs',
  label: '工作流',
  to: '/',
  icon: LayoutList,
  taskKind: 'run',
  match: (pathname) =>
    pathname === '/' || pathname.startsWith('/runs/') || pathname.startsWith('/tasks/') || pathname.startsWith('/events/'),
}

const schedules: AppNavItem = {
  id: 'schedules',
  label: '重复计划',
  to: '/schedules',
  icon: CalendarClock,
  match: (pathname) => pathname === '/schedules',
}

const favorites: AppNavItem = {
  id: 'favorites-and-templates',
  label: '收藏和模板',
  to: '/favorites-and-templates',
  icon: BookMarked,
  match: (pathname) => pathname === '/favorites-and-templates' || pathname.startsWith('/templates/'),
}

const library: AppNavItem = {
  id: 'library',
  label: '资料库',
  to: '/library',
  icon: FolderOpen,
  match: (pathname) => pathname === '/library',
}

const fileConverter: AppNavItem = {
  id: 'file-converter',
  label: '文件转换',
  to: '/file-converter',
  icon: FileText,
  taskKind: 'file-conversion',
  match: (pathname) => pathname === '/file-converter' || pathname === '/pdf-to-md',
}

const pageCapture: AppNavItem = {
  id: 'page-capture',
  label: '网页采集',
  to: '/page-capture',
  icon: Globe,
  taskKind: 'page-capture',
  match: (pathname) => pathname === '/page-capture',
}

const webCrawl: AppNavItem = {
  id: 'web-crawl',
  label: '网页抓取',
  to: '/web-crawl',
  icon: Radar,
  taskKind: 'web-crawl',
  match: (pathname) => pathname === '/web-crawl',
}

export const settingsNavItem: AppNavItem = {
  id: 'settings',
  label: '设置',
  to: '/settings',
  icon: Settings,
  match: (pathname) => pathname === '/settings' || pathname.startsWith('/settings/'),
}

/** Primary navigation in sidebar order, grouped by what the user is doing. */
export const appNavigationGroups: AppNavGroup[] = [
  { id: 'work', label: '工作', items: [runs, schedules] },
  { id: 'resources', label: '资源', items: [favorites, library] },
  { id: 'tools', label: '工具', items: [fileConverter, pageCapture, webCrawl] },
]

/** Every destination, flat; settings last. */
export const appNavigation: AppNavItem[] = [...appNavigationGroups.flatMap((group) => group.items), settingsNavItem]

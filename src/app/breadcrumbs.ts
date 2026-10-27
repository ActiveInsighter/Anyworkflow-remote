import { START_LINKS } from '@/lib/domain/start-links'

/** Top-bar trail and back target for each route; keep in step with router.tsx. */
export interface BreadcrumbItem {
  label: string
  to?: string
}

function shortId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 6)}…` : value
}

export function breadcrumbsFor(pathname: string): BreadcrumbItem[] {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return [{ label: '工作流' }]

  if (parts[0] === 'runs') {
    if (parts[1] === 'new') return [{ label: '工作流', to: '/' }, { label: '新建 Run' }]
    const runId = parts[1] || ''
    return [
      { label: '工作流', to: '/' },
      { label: `Run ${shortId(runId)}`, to: `/runs/${runId}` },
      ...(parts[2] === 'edit' ? [{ label: '编辑' }] : []),
    ]
  }

  if (parts[0] === 'file-converter' || parts[0] === 'pdf-to-md') return [{ label: '文件转换' }]
  if (parts[0] === 'library') return [{ label: '资料库' }]
  if (parts[0] === 'favorites-and-templates') return [{ label: '收藏和模板' }]
  if (parts[0] === 'templates') {
    const templateId = parts[1] || ''
    return [{ label: '收藏和模板', to: '/favorites-and-templates?tab=templates' }, { label: `模板 ${shortId(templateId)}` }]
  }
  if (parts[0] === 'schedules') return [{ label: '重复计划' }]
  if (parts[0] === 'settings') {
    if (!parts[1]) return [{ label: '设置' }]
    const title =
      ({ runtime: '运行配置', appearance: '外观', connection: '连接', shortcuts: '快捷键' } as Record<string, string>)[
        parts[1]
      ] ?? '设置'
    return [
      { label: '设置', to: '/settings' },
      { label: title, ...(parts[2] ? { to: '/settings/runtime' } : {}) },
      ...(parts[2] ? [{ label: START_LINKS.find((link) => link.id === parts[2])?.label ?? '页面配置' }] : []),
    ]
  }

  if (parts[0] === 'tasks') return [{ label: '工作流', to: '/' }, { label: `Task ${shortId(parts[1] || '')}` }]
  if (parts[0] === 'events') return [{ label: '工作流', to: '/' }, { label: `Event ${shortId(parts[1] || '')}` }]

  return [{ label: 'AnyWorkflow' }]
}

export function fallbackParent(pathname: string): string {
  if (pathname.startsWith('/settings/runtime/')) return '/settings/runtime'
  if (pathname.startsWith('/settings/')) return '/settings'
  const runEdit = pathname.match(/^\/runs\/([^/]+)\/edit$/u)
  if (runEdit) return `/runs/${runEdit[1]}`
  if (pathname.startsWith('/runs/') || pathname.startsWith('/tasks/') || pathname.startsWith('/events/')) return '/'
  if (pathname.startsWith('/templates/')) return '/favorites-and-templates?tab=templates'
  return '/'
}

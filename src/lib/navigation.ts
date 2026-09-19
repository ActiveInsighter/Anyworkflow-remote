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

  if (parts[0] === 'library') return [{ label: '资料库' }]
  if (parts[0] === 'templates') {
    const templateId = parts[1] || ''
    return [{ label: '资料库', to: '/library?tab=templates' }, { label: `模板 ${shortId(templateId)}` }]
  }
  if (parts[0] === 'settings') return [{ label: '设置' }]

  if (parts[0] === 'tasks') return [{ label: '工作流', to: '/' }, { label: `Task ${shortId(parts[1] || '')}` }]
  if (parts[0] === 'events') return [{ label: '工作流', to: '/' }, { label: `Event ${shortId(parts[1] || '')}` }]

  return [{ label: 'AnyWorkflow' }]
}

export function fallbackParent(pathname: string): string {
  const runEdit = pathname.match(/^\/runs\/([^/]+)\/edit$/u)
  if (runEdit) return `/runs/${runEdit[1]}`
  if (pathname.startsWith('/runs/') || pathname.startsWith('/tasks/') || pathname.startsWith('/events/')) return '/'
  if (pathname.startsWith('/templates/')) return '/library?tab=templates'
  if (pathname === '/library' || pathname === '/settings') return '/'
  return '/'
}

import { House, MapPinOff } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/feedback/empty-state'
import { Page } from '@/components/layout/page'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <Page>
      <EmptyState
        icon={MapPinOff}
        title="页面不存在"
        description="这个地址没有对应的页面，可能已被移动或删除。"
        action={
          <Button asChild>
            <Link to="/">
              <House data-icon="inline-start" />
              返回工作流
            </Link>
          </Button>
        }
      />
    </Page>
  )
}

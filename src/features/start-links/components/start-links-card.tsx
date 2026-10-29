import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useStartLinksDraft } from '../hooks/use-start-links-draft'
import { StartLinksEditor } from './start-links-editor'

/** Settings page section for the account's start links. */
export function StartLinksCard() {
  const draft = useStartLinksDraft()
  return (
    <Card>
      <CardHeader>
        <CardTitle>快捷链接</CardTitle>
        <CardDescription>
          编辑器设置 start_url 时可直接选择这些页面；顺序即菜单顺序，所有设备同步。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StartLinksEditor draft={draft} />
      </CardContent>
    </Card>
  )
}

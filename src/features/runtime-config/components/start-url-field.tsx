import { Link } from 'react-router'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { displayStartUrl } from '@/lib/domain/start-links'
import { useStartLinks } from '@/features/start-links/hooks/use-start-links'

/** Page a Task opens when its `start_url` variable is left empty; offers the account's start links. */
export function StartUrlField({ id, value, onChange }: { id: string; value: string; onChange: (url: string) => void }) {
  const { links } = useStartLinks()
  const known = links.some((link) => link.url === value)
  return (
    <Field>
      <FieldLabel htmlFor={id}>默认开始链接</FieldLabel>
      <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {links.map((link) => (
          <NativeSelectOption key={link.id} value={link.url}>
            {link.label} · {displayStartUrl(link.url)}
          </NativeSelectOption>
        ))}
        {known ? null : <NativeSelectOption value={value}>{value}</NativeSelectOption>}
      </NativeSelect>
      <FieldDescription>
        Task 中 start_url 为空时打开此页面。选项来自
        <Link to="/settings/start-links" className="mx-0.5 underline underline-offset-4 hover:text-foreground">
          快捷链接
        </Link>
        。
      </FieldDescription>
    </Field>
  )
}

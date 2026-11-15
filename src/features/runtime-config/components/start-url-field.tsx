import { Link } from 'react-router'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { SelectField, SelectOption } from '@/components/ui/select'
import { displayStartUrl } from '@/lib/domain/start-links'
import { useStartLinks } from '@/features/start-links/hooks/use-start-links'

/** Page a Task opens when its `start_url` variable is left empty; offers the account's start links. */
export function StartUrlField({ id, value, onChange }: { id: string; value: string; onChange: (url: string) => void }) {
  const { links } = useStartLinks()
  const known = links.some((link) => link.url === value)
  return (
    <Field>
      <FieldLabel htmlFor={id}>默认开始链接</FieldLabel>
      <SelectField id={id} value={value} onValueChange={(value) => onChange(value)}>
        {links.map((link) => (
          <SelectOption key={link.id} value={link.url}>
            {link.label} · {displayStartUrl(link.url)}
          </SelectOption>
        ))}
        {known ? null : <SelectOption value={value}>{value}</SelectOption>}
      </SelectField>
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

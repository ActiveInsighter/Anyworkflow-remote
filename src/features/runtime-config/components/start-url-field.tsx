import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { START_LINKS } from '@/lib/domain/start-links'

/** Page a Task opens when its `start_url` variable is left empty. */
export function StartUrlField({ id, value, onChange }: { id: string; value: string; onChange: (url: string) => void }) {
  const known = START_LINKS.some((link) => link.url === value)
  return (
    <Field>
      <FieldLabel htmlFor={id}>默认开始链接</FieldLabel>
      <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {START_LINKS.map((link) => (
          <NativeSelectOption key={link.id} value={link.url}>
            {link.label} · {link.url}
          </NativeSelectOption>
        ))}
        {known ? null : <NativeSelectOption value={value}>{value}</NativeSelectOption>}
      </NativeSelect>
      <FieldDescription>Task 中 start_url 为空时打开此页面。</FieldDescription>
    </Field>
  )
}

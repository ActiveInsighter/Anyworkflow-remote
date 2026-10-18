import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { THEME_OPTIONS } from '@/components/theme/theme-options'
import { setThemePreference, useThemePreference, type ThemePreference } from '@/lib/platform/theme'

/** Theme choice as a radio group, for embedding in any dropdown menu. */
export function ThemeMenuItems() {
  const preference = useThemePreference()
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>主题</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={preference} onValueChange={(value) => setThemePreference(value as ThemePreference)}>
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuRadioItem key={value} value={value}>
            <Icon aria-hidden="true" />
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  )
}

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { themeLabels, type ThemePreference } from '@/lib/platform/theme'

/** Theme choices in display order, shared by the account menu and the settings page. */
export const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: 'system', label: themeLabels.system, icon: Monitor },
  { value: 'light', label: themeLabels.light, icon: Sun },
  { value: 'dark', label: themeLabels.dark, icon: Moon },
]

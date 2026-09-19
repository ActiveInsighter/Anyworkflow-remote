export type SidebarShortcutEvent = {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  repeat: boolean
  isComposing: boolean
  defaultPrevented: boolean
}

export type SidebarTargetDescriptor = {
  tagName?: string
  isContentEditable?: boolean
  hasEditableAncestor?: boolean
}

export type SidebarModifierState = {
  modifierHeld: boolean
  modifierKey: 'control' | 'meta' | null
}

export type SidebarModifierAction =
  | { type: 'keyboard'; ctrlKey: boolean; metaKey: boolean }
  | { type: 'window-blur' }
  | { type: 'page-hide' }
  | { type: 'visibility-hidden' }

export type SidebarPresentationState = {
  desktopOpen: boolean
  mobileOpen: boolean
}

export type SidebarPresentationAction =
  | { type: 'set-desktop-open'; open: boolean }
  | { type: 'set-mobile-open'; open: boolean }

const STORAGE_PREFIX = 'anyworkflow.sidebar.'

export function sidebarStorageKey(key: string): string {
  return key.startsWith(STORAGE_PREFIX) ? key : STORAGE_PREFIX + key
}

/** Reads the persisted desktop state. Returns undefined when nothing valid is stored. */
export function readSidebarState(storageKey: string): boolean | undefined {
  try {
    const raw = localStorage.getItem(sidebarStorageKey(storageKey))
    if (raw === 'true') return true
    if (raw === 'false') return false
    return undefined
  } catch {
    return undefined
  }
}

export function writeSidebarState(storageKey: string, open: boolean): void {
  try {
    localStorage.setItem(sidebarStorageKey(storageKey), String(open))
  } catch {
    // Storage can be unavailable (private mode, quota). The state simply is not remembered.
  }
}

export function matchesSidebarShortcut(
  event: Pick<SidebarShortcutEvent, 'key' | 'ctrlKey' | 'metaKey'>,
  shortcutKey: string,
): boolean {
  return (
    event.key.toLocaleLowerCase() === shortcutKey.toLocaleLowerCase() &&
    (event.ctrlKey || event.metaKey)
  )
}

export function isTextEntryTarget(target: SidebarTargetDescriptor): boolean {
  const tagName = target.tagName?.toLocaleLowerCase()
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable === true ||
    target.hasEditableAncestor === true
  )
}

export function shouldHandleSidebarShortcut(
  event: SidebarShortcutEvent,
  shortcutKey: string,
  target: SidebarTargetDescriptor,
): boolean {
  return (
    !event.altKey &&
    !event.repeat &&
    !event.isComposing &&
    !event.defaultPrevented &&
    !isTextEntryTarget(target) &&
    matchesSidebarShortcut(event, shortcutKey)
  )
}

export function reduceSidebarModifierState(
  state: SidebarModifierState,
  action: SidebarModifierAction,
): SidebarModifierState {
  if (action.type !== 'keyboard') {
    return state.modifierHeld || state.modifierKey
      ? { modifierHeld: false, modifierKey: null }
      : state
  }

  const modifierHeld = action.ctrlKey || action.metaKey
  const modifierKey = action.metaKey ? 'meta' : action.ctrlKey ? 'control' : null
  return state.modifierHeld === modifierHeld && state.modifierKey === modifierKey
    ? state
    : { modifierHeld, modifierKey }
}

export function reduceSidebarPresentationState(
  state: SidebarPresentationState,
  action: SidebarPresentationAction,
): SidebarPresentationState {
  if (action.type === 'set-desktop-open') {
    return state.desktopOpen === action.open ? state : { ...state, desktopOpen: action.open }
  }
  return state.mobileOpen === action.open ? state : { ...state, mobileOpen: action.open }
}

/**
 * When the sidebar expands or collapses the focused control disappears. Move focus to the
 * matching trigger so keyboard users are never dropped back to the document body.
 */
export function getSidebarFocusHandoffSurface(
  open: boolean,
  activeSurface: 'panel' | 'rail' | null,
): 'panel' | 'rail' | null {
  if (open && activeSurface === 'rail') return 'panel'
  if (!open && activeSurface === 'panel') return 'rail'
  return null
}

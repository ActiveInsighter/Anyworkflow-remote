import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import {
  getSidebarFocusHandoffSurface,
  readSidebarState,
  reduceSidebarModifierState,
  reduceSidebarPresentationState,
  shouldHandleSidebarShortcut,
  writeSidebarState,
  type SidebarModifierAction,
  type SidebarModifierState,
  type SidebarPresentationState,
  type SidebarShortcutEvent,
  type SidebarTargetDescriptor,
} from './state'
import {
  createSidebarMobileTokenStyle,
  createSidebarTokenStyle,
  pickSidebarTokenStyle,
  SIDEBAR_MOBILE_QUERY,
} from './tokens'
import type { SidebarPublicContextValue, SidebarRootProps, SidebarStyle, SidebarSurface } from './types'

export type SidebarInternalContextValue = SidebarPublicContextValue & {
  railId: string
  portalStyle: SidebarStyle
  mobilePortalStyle: SidebarStyle
  getMobileFocusReturn: () => HTMLElement | null
  toggleFromTrigger: (trigger: HTMLElement) => void
  registerSurface: (surface: 'panel' | 'rail', node: HTMLElement | null) => void
  registerTrigger: (surface: SidebarSurface, node: HTMLElement | null) => void
}

const SidebarContext = React.createContext<SidebarInternalContextValue | null>(null)

const DEFAULT_PERSISTENCE = { key: 'desktop' } as const

function getTargetDescriptor(target: EventTarget | null): SidebarTargetDescriptor {
  if (!(target instanceof Element)) return {}

  return {
    tagName: target.tagName,
    isContentEditable: target instanceof HTMLElement ? target.isContentEditable : false,
    hasEditableAncestor:
      target.closest("[contenteditable]:not([contenteditable='false'])") !== null,
  }
}

function toShortcutEvent(event: KeyboardEvent): SidebarShortcutEvent {
  return {
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    repeat: event.repeat,
    isComposing: event.isComposing,
    defaultPrevented: event.defaultPrevented,
  }
}

function toModifierAction(event: KeyboardEvent): SidebarModifierAction {
  return { type: 'keyboard', ctrlKey: event.ctrlKey, metaKey: event.metaKey }
}

export function SidebarRoot({
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  mobileOpen: mobileOpenProp,
  defaultMobileOpen = false,
  onMobileOpenChange,
  shortcutKey = 'b',
  persistence = DEFAULT_PERSISTENCE,
  tokens,
  style,
  className,
  children,
  ...props
}: SidebarRootProps) {
  const [presentationState, dispatchPresentation] = React.useReducer(
    reduceSidebarPresentationState,
    {
      desktopOpen: persistence ? (readSidebarState(persistence.key) ?? defaultOpen) : defaultOpen,
      mobileOpen: defaultMobileOpen,
    } satisfies SidebarPresentationState,
  )
  const open = openProp ?? presentationState.desktopOpen
  const mobileOpen = mobileOpenProp ?? presentationState.mobileOpen

  const [isMobile, setIsMobile] = React.useState(false)
  const [modifierState, setModifierState] = React.useState<SidebarModifierState>({
    modifierHeld: false,
    modifierKey: null,
  })

  const panelId = React.useId()
  const railId = React.useId()
  const mobilePopupId = React.useId()

  const panelRef = React.useRef<HTMLElement | null>(null)
  const railRef = React.useRef<HTMLElement | null>(null)
  const panelTriggerRef = React.useRef<HTMLElement | null>(null)
  const railTriggerRef = React.useRef<HTMLElement | null>(null)
  const externalTriggerRef = React.useRef<HTMLElement | null>(null)
  const mobileOpenerRef = React.useRef<HTMLElement | null>(null)

  const tokenStyle = React.useMemo(() => createSidebarTokenStyle(tokens), [tokens])
  const portalStyle = React.useMemo<SidebarStyle>(
    () => ({ ...tokenStyle, ...pickSidebarTokenStyle(style) }),
    [style, tokenStyle],
  )
  const mobilePortalStyle = React.useMemo<SidebarStyle>(
    () => ({ ...createSidebarMobileTokenStyle(tokens), ...pickSidebarTokenStyle(style) }),
    [style, tokens],
  )

  React.useEffect(() => {
    const media = window.matchMedia(SIDEBAR_MOBILE_QUERY)
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  React.useEffect(() => {
    if (!persistence) return
    writeSidebarState(persistence.key, open)
  }, [open, persistence])

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen === open) return
      if (openProp === undefined) dispatchPresentation({ type: 'set-desktop-open', open: nextOpen })
      onOpenChange?.(nextOpen)
    },
    [onOpenChange, open, openProp],
  )

  const updateMobileOpen = React.useCallback(
    (nextOpen: boolean, opener?: HTMLElement | null) => {
      if (nextOpen === mobileOpen) return
      if (nextOpen) {
        const activeElement = document.activeElement
        mobileOpenerRef.current =
          opener ?? (activeElement instanceof HTMLElement ? activeElement : null)
      }
      if (mobileOpenProp === undefined) {
        dispatchPresentation({ type: 'set-mobile-open', open: nextOpen })
      }
      onMobileOpenChange?.(nextOpen)
    },
    [mobileOpen, mobileOpenProp, onMobileOpenChange],
  )

  const setMobileOpen = React.useCallback(
    (nextOpen: boolean) => updateMobileOpen(nextOpen),
    [updateMobileOpen],
  )

  const toggle = React.useCallback(() => {
    if (window.matchMedia(SIDEBAR_MOBILE_QUERY).matches) updateMobileOpen(!mobileOpen)
    else setOpen(!open)
  }, [mobileOpen, open, setOpen, updateMobileOpen])

  const toggleFromTrigger = React.useCallback(
    (trigger: HTMLElement) => {
      if (window.matchMedia(SIDEBAR_MOBILE_QUERY).matches) {
        updateMobileOpen(!mobileOpen, trigger)
      } else {
        setOpen(!open)
      }
    },
    [mobileOpen, open, setOpen, updateMobileOpen],
  )

  // Expanding or collapsing unmounts the focused control; hand focus to the matching trigger.
  React.useLayoutEffect(() => {
    const activeElement = document.activeElement
    if (!(activeElement instanceof HTMLElement)) return

    const activeSurface = panelRef.current?.contains(activeElement)
      ? 'panel'
      : railRef.current?.contains(activeElement)
        ? 'rail'
        : null
    const targetSurface = getSidebarFocusHandoffSurface(open, activeSurface)
    if (!targetSurface) return

    const target = targetSurface === 'panel' ? panelTriggerRef.current : railTriggerRef.current
    target?.focus({ preventScroll: true })
  }, [open])

  React.useEffect(() => {
    const updateModifier = (action: SidebarModifierAction) => {
      setModifierState((current) => reduceSidebarModifierState(current, action))
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      updateModifier(toModifierAction(event))
      if (
        shortcutKey &&
        shouldHandleSidebarShortcut(toShortcutEvent(event), shortcutKey, getTargetDescriptor(event.target))
      ) {
        event.preventDefault()
        toggle()
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => updateModifier(toModifierAction(event))
    const handleWindowBlur = () => updateModifier({ type: 'window-blur' })
    const handlePageHide = () => updateModifier({ type: 'page-hide' })
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') updateModifier({ type: 'visibility-hidden' })
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [shortcutKey, toggle])

  const registerSurface = React.useCallback((surface: 'panel' | 'rail', node: HTMLElement | null) => {
    if (surface === 'panel') panelRef.current = node
    else railRef.current = node
  }, [])

  const registerTrigger = React.useCallback((surface: SidebarSurface, node: HTMLElement | null) => {
    const triggerRef =
      surface === 'panel' ? panelTriggerRef : surface === 'rail' ? railTriggerRef : externalTriggerRef
    triggerRef.current = node
  }, [])

  const getMobileFocusReturn = React.useCallback(() => {
    if (mobileOpenerRef.current?.isConnected) return mobileOpenerRef.current
    if (externalTriggerRef.current?.isConnected) return externalTriggerRef.current
    return null
  }, [])

  const contextValue = React.useMemo<SidebarInternalContextValue>(
    () => ({
      state: open ? 'expanded' : 'collapsed',
      open,
      mobileOpen,
      isMobile,
      modifierHeld: modifierState.modifierHeld,
      modifierKey: modifierState.modifierKey,
      panelId,
      mobilePopupId,
      setOpen,
      setMobileOpen,
      toggle,
      railId,
      portalStyle,
      mobilePortalStyle,
      getMobileFocusReturn,
      toggleFromTrigger,
      registerSurface,
      registerTrigger,
    }),
    [
      open,
      mobileOpen,
      isMobile,
      modifierState.modifierHeld,
      modifierState.modifierKey,
      panelId,
      mobilePopupId,
      setOpen,
      setMobileOpen,
      toggle,
      railId,
      portalStyle,
      mobilePortalStyle,
      getMobileFocusReturn,
      toggleFromTrigger,
      registerSurface,
      registerTrigger,
    ],
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={120}>
        <div
          {...props}
          data-slot="sidebar-root"
          data-state={open ? 'expanded' : 'collapsed'}
          className={className}
          style={{ ...tokenStyle, ...style }}
        >
          {children}
        </div>
      </TooltipPrimitive.Provider>
    </SidebarContext.Provider>
  )
}

export function useSidebar(): SidebarPublicContextValue {
  const context = React.useContext(SidebarContext)
  if (!context) throw new Error('useSidebar must be used within SidebarRoot')
  return context
}

export function useSidebarContext(): SidebarInternalContextValue {
  const context = React.useContext(SidebarContext)
  if (!context) throw new Error('Sidebar components must be used within SidebarRoot')
  return context
}

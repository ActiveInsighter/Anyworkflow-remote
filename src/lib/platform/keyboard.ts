/** True when a keyboard event originates from a control where typed letters belong to the user. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const tagName = target.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return target.closest("[contenteditable]:not([contenteditable='false'])") !== null
}

/** Apple keyboards label modifiers ⌘ ⌥ ⇧ and bind "Mod" to Command. */
export const IS_APPLE_PLATFORM =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/u.test(navigator.platform || navigator.userAgent)

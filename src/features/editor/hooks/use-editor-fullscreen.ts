import { useEffect, useState, type RefObject } from 'react'
import { EditorView } from '@codemirror/view'

/**
 * Fullscreen editing: Escape exits, the page behind stops scrolling, and on mobile the surface
 * tracks the visual viewport so the virtual keyboard never covers the caret.
 *
 * Outside fullscreen the editor is part of the page and the browser keeps the caret visible on
 * its own; following the visual viewport there made the text jump whenever the page scrolled.
 */
export function useEditorFullscreen(
  shellRef: RefObject<HTMLDivElement | null>,
  viewRef: RefObject<EditorView | null>,
) {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    /**
     * Capture phase on purpose: this has to decide *before* CodeMirror and Radix see the key.
     * Anything the editor already has open — the search panel, the completion popup — owns the
     * first Escape. Checking `defaultPrevented` instead would never fire, because an open
     * tooltip (including the one on the fullscreen button itself) calls preventDefault.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.querySelector('.aw-code-editor .cm-tooltip, .aw-code-editor .cm-panels')) return
      setFullscreen(false)
    }
    document.addEventListener('keydown', onKeyDown, true)
    // Lock both elements: the page scrollbar lives on <html>, so hiding it on <body> alone
    // leaves a strip beside the fullscreen surface.
    const html = document.documentElement.style.overflow
    const body = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.documentElement.style.overflow = html
      document.body.style.overflow = body
    }
  }, [fullscreen])

  useEffect(() => {
    const viewport = window.visualViewport
    const shell = shellRef.current
    if (!fullscreen || !viewport || !shell) return
    let height = viewport.height
    let frame: number | null = null

    const sync = () => {
      // A fixed element sized with 100dvh can still sit behind Android's virtual keyboard.
      // VisualViewport reports the actually visible area, including keyboard/browser chrome.
      shell.style.top = `${viewport.offsetTop}px`
      shell.style.height = `${viewport.height}px`
      // Only the keyboard opening or closing changes the height; keep the caret above it then.
      if (Math.abs(viewport.height - height) < 1) return
      height = viewport.height
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = null
        const view = viewRef.current
        if (!view?.hasFocus) return
        view.dispatch({
          effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'nearest', yMargin: 56 }),
        })
      })
    }

    sync()
    viewport.addEventListener('resize', sync)
    viewport.addEventListener('scroll', sync)
    return () => {
      viewport.removeEventListener('resize', sync)
      viewport.removeEventListener('scroll', sync)
      if (frame !== null) window.cancelAnimationFrame(frame)
      shell.style.removeProperty('top')
      shell.style.removeProperty('height')
    }
  }, [fullscreen, shellRef, viewRef])

  const toggleFullscreen = () => {
    setFullscreen((value) => !value)
    // Entering keeps editing where it was; focusing here (not in an effect) is a user gesture,
    // so a phone opens the keyboard only when the user asked for fullscreen.
    if (viewRef.current?.hasFocus === false && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      viewRef.current.focus()
    }
  }

  return { fullscreen, toggleFullscreen }
}

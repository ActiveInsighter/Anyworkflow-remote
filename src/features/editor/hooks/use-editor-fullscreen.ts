import { useEffect, useRef, useState, type RefObject } from 'react'
import { EditorView } from '@codemirror/view'

/**
 * Fullscreen editing: Escape exits, the page behind stops scrolling, and on mobile the surface
 * tracks the visual viewport so the virtual keyboard never covers the caret.
 */
export function useEditorFullscreen(
  shellRef: RefObject<HTMLDivElement | null>,
  viewRef: RefObject<EditorView | null>,
) {
  const [fullscreen, setFullscreen] = useState(false)
  const frameRef = useRef<number | null>(null)

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
    viewRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.documentElement.style.overflow = html
      document.body.style.overflow = body
    }
  }, [fullscreen, viewRef])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const syncViewport = () => {
      const shell = shellRef.current
      if (fullscreen && shell) {
        // A fixed element sized with 100dvh can still sit behind Android's virtual keyboard.
        // VisualViewport reports the actually visible area, including keyboard/browser chrome.
        shell.style.top = `${viewport.offsetTop}px`
        shell.style.height = `${viewport.height}px`
      }
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        const view = viewRef.current
        if (!view?.hasFocus) return
        view.dispatch({
          effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'nearest', yMargin: 56 }),
        })
      })
    }

    syncViewport()
    viewport.addEventListener('resize', syncViewport)
    viewport.addEventListener('scroll', syncViewport)
    return () => {
      viewport.removeEventListener('resize', syncViewport)
      viewport.removeEventListener('scroll', syncViewport)
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      shellRef.current?.style.removeProperty('top')
      shellRef.current?.style.removeProperty('height')
    }
  }, [fullscreen, shellRef, viewRef])

  return { fullscreen, toggleFullscreen: () => setFullscreen((value) => !value) }
}

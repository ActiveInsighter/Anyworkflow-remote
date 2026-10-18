/** Static metadata attached to routes in router.tsx and read by the shell via `useMatches()`. */
export interface RouteHandle {
  /** The page fills the viewport and owns its scrolling (e.g. the CodeMirror editor). */
  workspace?: boolean
}

import { createContext, use, useState, type ReactNode } from 'react'

/**
 * `follow`: untouched nodes open where the work is (the running Task/Event, the latest Act).
 * `collapsed`: untouched nodes stay closed. Either way, a node the user toggled keeps that choice.
 */
export type ExpansionMode = 'follow' | 'collapsed'

interface ExpansionState {
  mode: ExpansionMode
  overrides: ReadonlyMap<string, boolean>
}

interface ExpansionStore extends ExpansionState {
  setOpen: (key: string, open: boolean) => void
  setMode: (mode: ExpansionMode) => void
}

const ExpansionContext = createContext<ExpansionStore | null>(null)

/**
 * Open/closed state for the whole execution tree, held above it so polling, paging and version
 * reloads never reset what the user expanded. `openKeys` (deep links) are forced open whenever
 * the set changes. Key the provider by Run id so another version starts fresh.
 */
export function ExecutionExpansionProvider({ openKeys, children }: { openKeys: readonly string[]; children: ReactNode }) {
  const seedKey = openKeys.join('|')
  const [state, setState] = useState<ExpansionState & { seedKey: string }>(() => ({
    mode: 'follow',
    overrides: new Map(openKeys.map((key) => [key, true])),
    seedKey,
  }))

  // A new deep link while mounted: adjust during render rather than in an effect.
  if (state.seedKey !== seedKey) {
    const overrides = new Map(state.overrides)
    for (const key of openKeys) overrides.set(key, true)
    setState({ ...state, overrides, seedKey })
  }

  const store: ExpansionStore = {
    mode: state.mode,
    overrides: state.overrides,
    setOpen: (key, open) =>
      setState((current) => ({ ...current, overrides: new Map(current.overrides).set(key, open) })),
    setMode: (mode) => setState((current) => ({ ...current, mode, overrides: new Map() })),
  }

  return <ExpansionContext value={store}>{children}</ExpansionContext>
}

function useExpansionStore(): ExpansionStore {
  const store = use(ExpansionContext)
  if (!store) throw new Error('Execution nodes must render inside ExecutionExpansionProvider')
  return store
}

/** One node's open state: the user's choice if any, otherwise `followDefault` while following. */
export function useNodeExpansion(key: string, followDefault: boolean): [boolean, (open: boolean) => void] {
  const store = useExpansionStore()
  const open = store.overrides.get(key) ?? (store.mode === 'follow' && followDefault)
  return [open, (next) => store.setOpen(key, next)]
}

export function useExpansionMode(): [ExpansionMode, (mode: ExpansionMode) => void] {
  const store = useExpansionStore()
  return [store.mode, store.setMode]
}

export const expansionKey = {
  task: (id: string) => `task:${id}`,
  event: (id: string) => `event:${id}`,
  act: (id: string) => `act:${id}`,
}

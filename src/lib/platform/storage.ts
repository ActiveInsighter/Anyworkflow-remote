export function readStorage(key: string): string | null | undefined {
  try {
    return localStorage.getItem(key)
  } catch {
    // Storage can be blocked by browser privacy settings or unavailable in a
    // non-browser render. Callers can keep an in-memory fallback in that case.
    return undefined
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Persistence is best effort. The active tab can continue in memory.
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Storage failure must not blank the running app.
  }
}

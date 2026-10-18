import { useEffect, useState } from 'react'

/**
 * A clock for relative time readouts. Deliberately coarse: schedules are minute-granular, so a
 * 30s tick keeps "2 小时 15 分后" honest without re-rendering anything on a hot loop.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])

  return now
}

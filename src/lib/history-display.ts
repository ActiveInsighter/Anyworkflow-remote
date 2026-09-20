export function compactMessagePreview(value: string, fallback: string, maxLength = 72): string {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (!normalized) return fallback
  if (normalized.length <= maxLength) return normalized
  const visibleLength = Math.max(1, maxLength - 1)
  return `${normalized.slice(0, visibleLength).trimEnd()}…`
}

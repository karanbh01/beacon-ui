/** "2h ago", "yesterday" — the frame's phrasing, not a timestamp. */
export function relativeTime(then: number, now: number): string {
  const minutes = Math.floor((now - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${String(minutes)}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${String(hours)}h ago`
  if (hours < 48) return 'yesterday'
  return `${String(Math.floor(hours / 24))}d ago`
}

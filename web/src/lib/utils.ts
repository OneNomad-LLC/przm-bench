/** Merge class names — minimal cn() without clsx/tailwind-merge overhead */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

/** Format a percentage score as a string with 1 decimal */
export function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

/** Format latency ms */
export function fmtMs(v: number): string {
  return `${Math.round(v)}ms`
}

/** Format throughput items/sec */
export function fmtThroughput(v: number): string {
  return `${Math.round(v)} items/s`
}

/** Truncate a git SHA to 7 chars */
export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

/** ISO8601 → "May 17, 2026" */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

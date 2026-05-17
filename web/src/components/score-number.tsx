import { cn } from '@/lib/utils'

type ScoreAccent = 'gold' | 'orange' | 'green' | 'red' | 'bench' | 'memory'

interface ScoreNumberProps {
  value: string
  label: string
  sub?: string
  accent?: ScoreAccent
}

const ACCENT_COLOR: Record<ScoreAccent, string> = {
  gold:   'var(--color-gold)',
  orange: 'var(--color-orange)',
  green:  'var(--color-green)',
  red:    'var(--color-red)',
  bench:  'var(--color-bench)',
  memory: 'var(--color-memory)',
}

const BORDER_COLOR: Record<ScoreAccent, string> = {
  gold:   'rgba(250,189,47,0.4)',
  orange: 'rgba(254,128,25,0.4)',
  green:  'rgba(184,187,38,0.4)',
  red:    'rgba(251,73,52,0.4)',
  bench:  'rgba(52,196,104,0.4)',
  memory: 'rgba(232,64,64,0.4)',
}

export function ScoreNumber({ value, label, sub, accent = 'bench' }: ScoreNumberProps) {
  return (
    <div
      className="border-l-2 pl-4"
      style={{ borderColor: BORDER_COLOR[accent] }}
    >
      <div
        className={cn('font-mono text-3xl font-semibold md:text-4xl')}
        style={{ color: ACCENT_COLOR[accent] }}
      >
        {value}
      </div>
      <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-text-muted)]">
        {label}
      </div>
      {sub && (
        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-text-disabled)]">
          {sub}
        </div>
      )}
    </div>
  )
}

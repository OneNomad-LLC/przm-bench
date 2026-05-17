import { cn } from '@/lib/utils'

interface ScoreNumberProps {
  value: string
  label: string
  sub?: string
  accent?: 'gold' | 'orange' | 'green' | 'red'
}

export function ScoreNumber({ value, label, sub, accent = 'gold' }: ScoreNumberProps) {
  const accentClass = {
    gold: 'text-[color:var(--color-gold)]',
    orange: 'text-[color:var(--color-orange)]',
    green: 'text-[color:var(--color-green)]',
    red: 'text-[color:var(--color-red)]',
  }[accent]

  const borderClass = {
    gold: 'border-[color:var(--color-gold)]/40',
    orange: 'border-[color:var(--color-orange)]/40',
    green: 'border-[color:var(--color-green)]/40',
    red: 'border-[color:var(--color-red)]/40',
  }[accent]

  return (
    <div className={cn('border-l-2 pl-4', borderClass)}>
      <div className={cn('font-mono text-3xl font-semibold md:text-4xl', accentClass)}>
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

interface LogoProps {
  size?: number
  color?: string
  className?: string
}

/**
 * przm logo — equilateral triangle suggesting a prism wedge.
 * Filled with a spectral gradient (red→green→blue) to hint at refraction.
 * At small navbar sizes the gradient reads as a subtle shimmer rather than
 * literal rainbow, which keeps the aesthetic infrastructure-grade.
 */
export function Logo({ size = 20, color, className }: LogoProps) {
  const id = 'przm-prism-grad'

  // Equilateral triangle points for a `size × size` bounding box, centered
  const h = size * (Math.sqrt(3) / 2)
  const cx = size / 2
  const top = (size - h) / 2
  const bottom = top + h
  const points = `${cx},${top} ${size},${bottom} 0,${bottom}`

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {!color && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-memory)" />
            <stop offset="50%" stopColor="var(--color-bench)" />
            <stop offset="100%" stopColor="var(--color-runtime)" />
          </linearGradient>
        </defs>
      )}
      <polygon
        points={points}
        fill={color ?? `url(#${id})`}
        opacity={0.92}
      />
    </svg>
  )
}

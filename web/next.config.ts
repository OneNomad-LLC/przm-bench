import type { NextConfig } from 'next'
import path from 'path'

const config: NextConfig = {
  // Point file tracing to the monorepo root so Next.js can resolve
  // ../METHODOLOGY.md, ../data/receipts.json, and ../results/published/*.json
  outputFileTracingRoot: path.join(__dirname, '..'),
}

export default config

/**
 * ndcgAtK — Normalized Discounted Cumulative Gain at K.
 *
 * Standard binary-relevance NDCG formulation:
 *   DCG@K  = Σ rel_i / log2(i+2)  for i in [0, K)
 *   IDCG@K = DCG of the ideal ranking (all relevant items first)
 *   NDCG@K = DCG@K / IDCG@K
 *
 * Binary relevance: rel_i = 1 if retrieved[i] ∈ expected, else 0.
 *
 * Returns 0 when:
 *   - `expected` is empty (no ground truth to score against)
 *   - no retrieved items rank in the top K
 *
 * Note: duplicate IDs in `retrieved` are NOT deduplicated here. The
 * adapter contract requires each returned item to have a distinct ID.
 * If an adapter returns duplicates, its NDCG is naturally penalised
 * (the later duplicate adds 0 gain but consumes a rank slot). The
 * engram longmemeval runner deduplicates session IDs before scoring
 * because it maps sub-chunks back to sessions; at the adapter-contract
 * level that mapping is the adapter's responsibility.
 */
export function ndcgAtK(
  retrieved: string[],
  expected: string[],
  k: number,
): number {
  if (expected.length === 0) return 0

  const relevantSet = new Set(expected)

  // Compute DCG@K over the retrieved list
  let dcg = 0
  const topK = retrieved.slice(0, k)
  for (let i = 0; i < topK.length; i++) {
    if (relevantSet.has(topK[i]!)) {
      // i+2 because rank is 1-indexed and log2(rank+1); at i=0 → log2(2)=1
      dcg += 1 / Math.log2(i + 2)
    }
  }

  // Compute IDCG@K — ideal case: all relevant items ranked first
  const idealCount = Math.min(expected.length, k)
  let idcg = 0
  for (let i = 0; i < idealCount; i++) {
    idcg += 1 / Math.log2(i + 2)
  }

  return idcg === 0 ? 0 : dcg / idcg
}

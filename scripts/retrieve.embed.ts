import fs from 'node:fs'

import { tokenize } from './token-utils'
import { logger } from './logger'
import type { EmbeddingPayload } from './types'

const embedPath = '.rag/embed.json'

if (!fs.existsSync(embedPath)) {
  logger.error('Embedding store not found. Run `pnpm embed:build` first.')
  process.exit(1)
}

const query = process.argv.slice(2).join(' ') || 'toggle'

const payload = JSON.parse(fs.readFileSync(embedPath, 'utf8')) as EmbeddingPayload

if (!payload.documents.length) {
  logger.warn('No embedded documents available.')
  process.exit(0)
}

const tokens = tokenize(query)
if (tokens.length === 0) {
  logger.warn('Query produced no tokens. Check input.')
  process.exit(0)
}

const termCounts = new Map<string, number>()
for (const token of tokens) {
  termCounts.set(token, (termCounts.get(token) ?? 0) + 1)
}

const vector: Record<string, number> = {}
let normSquared = 0
for (const [term, count] of termCounts.entries()) {
  const idf = payload.idf[term]
  if (!idf) continue
  const tf = count / tokens.length
  const weight = tf * idf
  if (weight === 0) continue
  vector[term] = weight
  normSquared += weight * weight
}

const queryNorm = Math.sqrt(normSquared)
if (queryNorm === 0) {
  logger.warn('Query vector norm is zero. Nothing to return.')
  process.exit(0)
}

const scored = payload.documents
  .map((doc) => {
    if (doc.norm === 0) return { doc, score: 0 }
    let dot = 0
    for (const [term, weight] of Object.entries(vector)) {
      const docWeight = doc.vector[term]
      if (!docWeight) continue
      dot += weight * docWeight
    }
    const score = dot / (doc.norm * queryNorm)
    return { doc, score }
  })
  .filter(({ score }) => score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 5)

logger.json(
  scored.map(({ doc, score }) => ({
    id: doc.id,
    file: doc.file,
    name: doc.name,
    kind: doc.kind,
    score: Number(score.toFixed(4)),
  })),
)

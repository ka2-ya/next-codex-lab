import fs from 'node:fs'

import { logger } from './logger'
import type { EmbeddingPayload } from './types'

type Chunk = {
  id: string
  file: string
  name?: string
  kind?: string
  text?: string
}

type Graph = {
  nodes: Record<string, { id: string; file: string; name?: string }>
  imports: Record<string, string[]>
  calls: Record<string, string[]>
}

const query = process.argv.slice(2).join(' ').trim()

if (!query) {
  console.error('Usage: pnpm rag:search:hybrid "<query>"')
  process.exit(1)
}

const toPosix = (value: string) => value.replace(/\\/g, '/')

const SYN: Record<string, string[]> = {
  toggle: ['switch', 'flip', 'invert'],
  complete: ['finish', 'done', 'resolve'],
  '完了': ['complete', 'done'],
  invert: ['toggle', 'flip', 'switch'],
  boolean: ['bool', 'flag'],
  bool: ['boolean', 'flag'],
}

const ALLOWED_DIRS = ['src/app', 'src/server', 'src/domain']
const BOOST_NAME = 2.0
const BOOST_PATH = 1.2
const TOP_K = 10
const EXPAND_RADIUS = 2
const DENSE_WEIGHT = Number.parseFloat(process.env.RAG_DENSE_WEIGHT ?? '0.4')

const rawIndex = JSON.parse(fs.readFileSync('.rag/index.json', 'utf8')) as Chunk[]
const index: Chunk[] = rawIndex.map((entry) => ({
  ...entry,
  file: toPosix(entry.file),
}))

const graphPath = '.rag/graph.json'
const rawGraph: Graph = fs.existsSync(graphPath)
  ? JSON.parse(fs.readFileSync(graphPath, 'utf8'))
  : { nodes: {}, imports: {}, calls: {} }

const graph: Graph = {
  nodes: Object.fromEntries(
    Object.entries(rawGraph.nodes).map(([id, node]) => [id, { ...node, file: toPosix(node.file) }]),
  ),
  imports: Object.fromEntries(
    Object.entries(rawGraph.imports).map(([file, targets]) => [toPosix(file), targets.map(toPosix)]),
  ),
  calls: Object.fromEntries(
    Object.entries(rawGraph.calls).map(([id, callers]) => [id, callers.map(toPosix)]),
  ),
}

const embedPath = '.rag/embed.json'
const embedPayload: EmbeddingPayload | null = fs.existsSync(embedPath)
  ? (JSON.parse(fs.readFileSync(embedPath, 'utf8')) as EmbeddingPayload)
  : null

const denseById = new Map<string, { embedding: number[]; norm: number }>()
if (embedPayload?.documents) {
  for (const doc of embedPayload.documents) {
    if (!doc.embedding || !doc.embeddingNorm || doc.embeddingNorm === 0) continue
    denseById.set(doc.id, { embedding: doc.embedding, norm: doc.embeddingNorm })
  }
}

const splitIdents = (value: string) =>
  value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-\.\/]/g, ' ')

const toks = (value: string) =>
  splitIdents(value)
    .toLowerCase()
    .match(/[a-zA-Z_][a-z0-9_]+|[ぁ-んァ-ヶー一-龠々]+/g) ?? []

const df = new Map<string, number>()
for (const chunk of index) {
  const docTerms = new Set(toks(`${chunk.text ?? ''} ${chunk.name ?? ''} ${chunk.file}`))
  for (const term of docTerms) df.set(term, (df.get(term) ?? 0) + 1)
}

const N = index.length
const idf = (term: string) => Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1

const baseTokens = toks(query)
const expandedTokens = new Set<string>(baseTokens)
for (const token of baseTokens) {
  const synonyms = SYN[token] ?? []
  for (const synonym of synonyms) expandedTokens.add(synonym)
}
const tokenList = Array.from(expandedTokens)

const bm25Lite = (doc: string, tokens: string[]) => {
  const terms = toks(doc)
  if (terms.length === 0) return 0
  const freq = new Map<string, number>()
  for (const term of terms) freq.set(term, (freq.get(term) ?? 0) + 1)
  let score = 0
  for (const token of tokens) {
    const count = freq.get(token) ?? 0
    if (count === 0) continue
    score += (count / terms.length) * idf(token)
  }
  return score
}

const scores = new Map<string, number>()

const denseScores = new Map<string, number>()

const computeScore = (chunk: Chunk) => {
  if (!ALLOWED_DIRS.some((dir) => chunk.file.startsWith(dir))) return Number.NEGATIVE_INFINITY
  const content = `${chunk.text ?? ''} ${chunk.name ?? ''}`
  let score = bm25Lite(content, tokenList)
  const name = chunk.name?.toLowerCase() ?? ''
  const file = chunk.file.toLowerCase()
  for (const token of tokenList) {
    if (name.includes(token)) score += BOOST_NAME
    if (file.includes(token)) score += BOOST_PATH
  }
  if (denseScores.size > 0) {
    const dense = denseScores.get(chunk.id)
    if (dense && Number.isFinite(dense)) {
      score += dense * DENSE_WEIGHT
    }
  }
  return score
}

const getScore = (chunk: Chunk) => {
  if (scores.has(chunk.id)) return scores.get(chunk.id) ?? Number.NEGATIVE_INFINITY
  const value = computeScore(chunk)
  scores.set(chunk.id, value)
  return value
}

const stableSort = <T,>(items: T[], key: (value: T) => number, tie: (value: T) => string) =>
  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const diff = key(b.item) - key(a.item)
      if (diff !== 0) return diff
      const tieBreak = tie(a.item).localeCompare(tie(b.item))
      if (tieBreak !== 0) return tieBreak
      return a.index - b.index
    })
    .map((entry) => entry.item)

const byId = new Map(index.map((chunk) => [chunk.id, chunk]))

const nodesByFile = new Map<string, string[]>()
for (const node of Object.values(graph.nodes)) {
  const list = nodesByFile.get(node.file) ?? []
  list.push(node.id)
  nodesByFile.set(node.file, list)
}

const expandByGraph = (seeds: Chunk[], radius: number) => {
  const seen = new Map<string, Chunk>()
  const frontier: string[] = []
  for (const seed of seeds) {
    seen.set(seed.id, seed)
    frontier.push(seed.id)
  }

  for (let depth = 0; depth < radius; depth += 1) {
    const next: string[] = []
    for (const id of frontier) {
      const seed = byId.get(id)
      const fallbackNode = graph.nodes[id]
      const file = seed?.file ?? fallbackNode?.file
      if (!file) continue
      const imports = graph.imports[file] ?? []
      for (const target of imports) {
        const nodeIds = nodesByFile.get(target)
        if (!nodeIds) continue
        for (const nodeId of nodeIds) {
          const candidate = byId.get(nodeId)
          if (!candidate || seen.has(candidate.id)) continue
          seen.set(candidate.id, candidate)
          next.push(candidate.id)
        }
      }
    }
    frontier.splice(0, frontier.length, ...next)
  }

  return Array.from(seen.values())
}

async function enrichDenseScores() {
  if (!embedPayload || denseById.size === 0) return
  if (!embedPayload.embeddingModel) return
  if (DENSE_WEIGHT === 0) return
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY is not set. Skipping dense scoring.')
    return
  }

  let OpenAIClient: typeof import('openai').default
  try {
    OpenAIClient = (await import('openai')).default
  } catch (error) {
    logger.error('Failed to load `openai` package. Run `pnpm install` to install dependencies.', error)
    return
  }

  const client = new OpenAIClient({ apiKey })
  const response = await client.embeddings.create({ model: embedPayload.embeddingModel, input: query })
  const vector = response.data[0]?.embedding
  if (!vector || vector.length === 0) return
  const queryNorm = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0))
  if (queryNorm === 0) return

  for (const [id, info] of denseById.entries()) {
    const docVector = info.embedding
    if (!docVector || docVector.length !== vector.length) continue
    let dot = 0
    for (let i = 0; i < vector.length; i += 1) {
      const queryComponent = vector[i]
      const docComponent = docVector[i]
      if (queryComponent === undefined || docComponent === undefined) continue
      dot += docComponent * queryComponent
    }
    const denom = info.norm * queryNorm
    if (denom === 0) continue
    denseScores.set(id, dot / denom)
  }
}


async function run() {
  await enrichDenseScores()

  const ranked = stableSort(index, getScore, (chunk) => chunk.id).filter((chunk) =>
    getScore(chunk) !== Number.NEGATIVE_INFINITY,
  )

  const expanded = expandByGraph(ranked.slice(0, TOP_K), EXPAND_RADIUS)
  const candidates = expanded.filter((chunk) => Number.isFinite(getScore(chunk)))

  const results = stableSort(candidates, getScore, (chunk) => chunk.id)
    .slice(0, TOP_K)
    .map((chunk) => ({
      id: chunk.id,
      file: chunk.file,
      name: chunk.name,
      kind: chunk.kind,
      score: Number(getScore(chunk).toFixed(4)),
    }))

  logger.json(results)
}

run().catch((error) => {
  logger.error('Hybrid retrieval failed', error)
  process.exit(1)
})

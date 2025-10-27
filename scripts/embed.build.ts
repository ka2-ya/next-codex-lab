import fs from 'node:fs'

import { tokenize } from './token-utils'
import { logger } from './logger'
import type { EmbeddedDocument, IndexEntry } from './types'

const indexPath = '.rag/index.json'
const embedPath = '.rag/embed.json'

const OPENAI_MODEL = process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small'
const OPENAI_BATCH = Number.parseInt(process.env.OPENAI_EMBED_BATCH_SIZE ?? '16', 10)

async function main() {
  if (!fs.existsSync(indexPath)) {
    logger.error('Index not found. Run `pnpm index:build` first.')
    process.exit(1)
  }

  const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as IndexEntry[]

  if (indexData.length === 0) {
    logger.warn('Index is empty. Nothing to embed.')
    fs.writeFileSync(
      embedPath,
      JSON.stringify({ generatedAt: new Date().toISOString(), embeddingModel: OPENAI_MODEL, documents: [], idf: {} }, null, 2),
    )
    process.exit(0)
  }

  const documents = indexData.map((entry) => {
    const tokens = tokenize(`${entry.name ?? ''} ${entry.text ?? ''}`)
    const termCounts = new Map<string, number>()
    for (const token of tokens) {
      termCounts.set(token, (termCounts.get(token) ?? 0) + 1)
    }
    return { entry, tokens, termCounts }
  })

  const docFreq = new Map<string, number>()
  for (const doc of documents) {
    for (const term of doc.termCounts.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1)
    }
  }

  const totalDocs = documents.length
  const idf = Object.fromEntries(
    Array.from(docFreq.entries()).map(([term, df]) => [term, Math.log((1 + totalDocs) / (1 + df)) + 1]),
  )

  const embedDocs: EmbeddedDocument[] = documents.map(({ entry, tokens, termCounts }) => {
    const tokenCount = tokens.length
    const vector: Record<string, number> = {}
    if (tokenCount === 0) {
      return { ...entry, vector, norm: 0 }
    }

    let normSquared = 0
    for (const [term, count] of termCounts.entries()) {
      const tf = count / tokenCount
      const termIdf = idf[term] ?? 0
      const weight = tf * termIdf
      if (weight === 0) continue
      vector[term] = weight
      normSquared += weight * weight
    }
    return { ...entry, vector, norm: Math.sqrt(normSquared) }
  })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY is not set. Skipping dense embedding generation.')
    writePayload(embedDocs, idf, null)
    process.exit(0)
  }

  let OpenAIClient: typeof import('openai').default
  try {
    OpenAIClient = (await import('openai')).default
  } catch (error) {
    logger.error('Failed to load `openai` package. Run `pnpm install` to install dependencies.', error)
    process.exit(1)
  }

  try {
    const client = new OpenAIClient({ apiKey })
    const inputs = embedDocs.map((doc) => {
      const candidate = `${doc.name ?? ''}\n${doc.text ?? ''}`.trim()
      if (candidate.length > 0) return candidate
      if (doc.text?.length) return doc.text
      if (doc.name?.length) return doc.name
      return doc.file
    })

    const batches: string[][] = []
    for (let i = 0; i < inputs.length; i += OPENAI_BATCH) {
      batches.push(inputs.slice(i, i + OPENAI_BATCH))
    }

    let index = 0
    for (const batch of batches) {
      const response = await client.embeddings.create({ model: OPENAI_MODEL, input: batch })
      response.data.forEach((item, offset) => {
        const embedding = item.embedding
        const target = embedDocs[index + offset]
        if (!target) return
        const norm = Math.sqrt(embedding.reduce((acc, value) => acc + value * value, 0))
        target.embedding = embedding
        target.embeddingNorm = norm
      })
      index += batch.length
    }

    writePayload(embedDocs, idf, OPENAI_MODEL)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('OpenAI embedding generation failed; falling back to sparse vectors only.', {
      message,
    })
    writePayload(embedDocs, idf, null)
  }
}

function writePayload(documents: EmbeddedDocument[], idf: Record<string, number>, embeddingModel: string | null) {
  const payload = {
    generatedAt: new Date().toISOString(),
    embeddingModel: embeddingModel ?? undefined,
    documents,
    idf,
  }

  fs.writeFileSync(embedPath, JSON.stringify(payload, null, 2))
  logger.info('Embed build complete', {
    documents: documents.length,
    vocabularySize: Object.keys(idf).length,
    hasDenseEmbeddings: embeddingModel != null,
  })
}

main().catch((error) => {
  logger.error('Embed build failed', error)
  process.exit(1)
})

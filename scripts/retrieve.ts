import fs from 'node:fs'

import { logger } from './logger'

const query = process.argv[2] ?? 'toggle'
const raw = fs.readFileSync('.rag/index.json', 'utf8')
const index = JSON.parse(raw) as Array<{
  id?: string
  name?: string
  file: string
  kind?: string
}>

const hits = index
  .filter((entry) => (entry.name ?? '').toLowerCase().includes(query.toLowerCase()))
  .slice(0, 5)

logger.json(
  hits.map((hit) => ({
    id: hit.id,
    file: hit.file,
    name: hit.name,
    kind: hit.kind,
  })),
)

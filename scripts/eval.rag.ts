import fs from 'node:fs'
import { execSync } from 'node:child_process'

import yaml from 'yaml'

import { logger } from './logger'

type ResultRow = {
  id?: string
  file: string
  name?: string
}

type GoldQuery = {
  q: string
  relevant: string[]
}

const goldPath = 'rag.gold.yaml'

if (!fs.existsSync(goldPath)) {
  logger.error(`Missing gold file at ${goldPath}`)
  process.exit(1)
}

const goldDoc = yaml.parse(fs.readFileSync(goldPath, 'utf8')) as { queries?: GoldQuery[] }
const queries = goldDoc?.queries ?? []

if (queries.length === 0) {
  logger.error('No queries defined in rag.gold.yaml')
  process.exit(1)
}
const K = [1, 3, 5, 10]

const run = (command: string) => {
  const output = execSync(command, { stdio: ['ignore', 'pipe', 'inherit'] }).toString()
  return JSON.parse(output) as ResultRow[]
}

const mrr = (ranked: string[], relevant: string[]) => {
  for (let i = 0; i < ranked.length; i += 1) {
    const candidate = ranked[i]
    if (candidate && relevant.some((target) => candidate.startsWith(target))) {
      return 1 / (i + 1)
    }
  }
  return 0
}

const topk = (ranked: string[], relevant: string[], k: number) => {
  const window = ranked.slice(0, k)
  return window.some((id) => relevant.some((target) => id.startsWith(target))) ? 1 : 0
}

const rows: string[] = []
rows.push(['query', 'mode', 'MRR', 'Top1', 'Top3', 'Top5', 'Top10'].join(','))

for (const { q, relevant } of queries) {
  for (const mode of ['base', 'hybrid'] as const) {
    const command =
      mode === 'base'
        ? `tsx scripts/retrieve.ts ${JSON.stringify(q)}`
        : `tsx scripts/retrieve.hybrid.ts ${JSON.stringify(q)}`
    const output = run(command)
    const ranked = output.map((entry) => entry.id ?? `${entry.file}#${entry.name ?? ''}`)
    const score = mrr(ranked, relevant)
    const buckets = K.map((k) => topk(ranked, relevant, k))
    rows.push([q, mode, score.toFixed(3), ...buckets.map((value) => value.toString())].join(','))
  }
}

logger.info(rows.join('\n'))

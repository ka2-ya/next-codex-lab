import fs from 'node:fs'
import { execSync } from 'node:child_process'

import { logger } from './logger'

const SNAP = '.rag/api-surface.json'
if (!fs.existsSync(SNAP)) {
  logger.error(`Missing ${SNAP}. まず main ブランチで snapshot を作成してコミットしてください。`)
  process.exit(1)
}

function run(cmd: string) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
}

// 変更ファイルのみ対象
const diffList = run('git diff --name-only --cached').trim().split('\n').filter(Boolean)
type ApiExport = { name: string; kind: 'function' | 'class' | 'const' | 'let'; signature?: string }
type ApiEntry = { file: string; exports: ApiExport[] }

const readSnapshot = (filePath: string): ApiEntry[] => JSON.parse(fs.readFileSync(filePath, 'utf8')) as ApiEntry[]

const before = readSnapshot(SNAP)
// 再生成してメモリに保持
run('tsx scripts/api-surface.snapshot.ts')
const after = readSnapshot(SNAP)

function indexByFile(arr: ApiEntry[]) {
  const m = new Map<string, ApiEntry>()
  for (const e of arr) m.set(e.file, e)
  return m
}
const A = indexByFile(before)
const B = indexByFile(after)

const errs: string[] = []

for (const file of diffList) {
  const a = A.get(file) ?? { file, exports: [] }
  const b = B.get(file) ?? { file, exports: [] }
  const keyFor = (entry: ApiExport) => `${entry.kind}:${entry.name}:${entry.signature ?? ''}`
  const setA = new Set(a.exports.map(keyFor))
  const setB = new Set(b.exports.map(keyFor))

  // 新規エクスポートや署名変更（＝キー差分）を禁止
  const added = [...setB].filter((x) => !setA.has(x))
  if (added.length) errs.push(`API surface changed in ${file}: ${added.join(', ')}`)
}

if (errs.length) {
  logger.error('❌ API surface violation (新規エクスポート/署名変更は禁止):')
  for (const e of errs) logger.error(`- ${e}`)
  logger.error('意図的変更の場合は、レビュー合意後に .rag/api-surface.json を更新してコミットしてください。')
  process.exit(1)
}
logger.info('✅ api-surface guard passed')

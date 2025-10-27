import fs from 'node:fs'
import { execSync } from 'node:child_process'

import { logger } from './logger'

type Hit = { id?: string; file: string; name?: string; score?: number }

type GuardConfig = {
  aliasThreshold: number
  allowedDirs: string[]
}

// --- 設定（必要に応じて調整） ---
const CFG_PATH = 'guard.config.json'
const defaultConfig: GuardConfig = { aliasThreshold: 1.2, allowedDirs: ['src/app', 'src/server', 'src/domain'] }
const cfgFile = fs.existsSync(CFG_PATH)
  ? (JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')) as Partial<GuardConfig>)
  : {}
const cfg: GuardConfig = {
  aliasThreshold: cfgFile.aliasThreshold ?? defaultConfig.aliasThreshold,
  allowedDirs: cfgFile.allowedDirs ?? defaultConfig.allowedDirs,
}

function run(cmd: string) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

function stagedFiles(): string[] {
  const out = run('git diff --name-only --cached')
  return out ? out.split('\n') : []
}

function newSymbolNames(filePath: string): string[] {
  if (!/\.(ts|tsx)$/.test(filePath)) return []
  const text = fs.readFileSync(filePath, 'utf8')
  const names = new Set<string>()
  // export function/class/const/let 名 を拾う（PoC; 精緻化はts-morphでも可）
  for (const m of text.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z0-9_]+)/g)) {
    const symbol = m[1]
    if (!symbol) continue
    names.add(symbol)
  }
  return [...names]
}

function inAllowedDirs(file: string) {
  const p = file.replace(/\\/g, '/')
  return cfg.allowedDirs.some((d: string) => p.startsWith(d))
}

// --- main ---
const files = stagedFiles().filter(inAllowedDirs)
if (files.length === 0) {
  logger.info('No staged files to check.')
  process.exit(0)
}

const symbols: Array<{ file: string; symbol: string }> = []
for (const f of files) for (const s of newSymbolNames(f)) symbols.push({ file: f, symbol: s })

if (symbols.length === 0) {
  logger.info('No exported symbols added.')
  process.exit(0)
}

// 検索のウォームアップ（キャッシュ等）
try { run('pnpm -s rag:search:hybrid "sanity"') } catch {}

const violations: Array<{ file: string; symbol: string; hit: Hit }> = []
for (const { file, symbol } of symbols) {
  const out = run(`pnpm -s rag:search:hybrid "${symbol}"`)
  let results: Hit[] = []
  try { results = JSON.parse(out) as Hit[] } catch { results = [] }
  const top = results[0]
  const score = Number(top?.score ?? 0)
  if (top && score >= cfg.aliasThreshold) {
    // 既存と高類似 → 新規より既存拡張が妥当
    violations.push({ file, symbol, hit: top })
  }
}

if (violations.length) {
  logger.error('❌ 似た概念の「新規エクスポート」が検出されました。既存拡張を検討してください。')
  for (const violation of violations) {
    logger.error(
      `- ${violation.symbol} (in ${violation.file}) ≈ ${violation.hit.name} @ ${violation.hit.file}  score=${violation.hit.score}`,
    )
  }
  logger.error(`閾値(aliasThreshold)は guard.config.json で調整可能（現在 ${cfg.aliasThreshold}）。`)
  process.exit(1)
}

logger.info('✅ alias guard passed')
